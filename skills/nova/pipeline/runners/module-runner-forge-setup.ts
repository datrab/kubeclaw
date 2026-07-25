import { createPluginContext } from '../core/context.ts';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { resolveStatusGatewayLabel, resolveStatusSessionKey } from '../services/correlation.ts';
import { archiveForgeCompletionArtifact } from '../services/forge-completion.ts';
import { startModulePhase, setModuleActiveAgent, clearModuleActiveAgent } from '../lifecycle-state.ts';
import { onModuleStarted, onPhaseStarted } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import {
  _telemetryCtx, buildModuleForgeRunInput, currentAttemptNumber, emitTerminalModuleFailTelemetry,
  getModuleStats, setLogScope,
} from './module-runner-shared.ts';
import { runModulePreflight } from './module-runner/preflight.ts';
import { buildModuleErrorTerminalResult } from './module-runner/terminal-results.ts';
import { selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;

function dispatchRunId(dispatch: AnyRecord, config: AnyRecord) {
  if (dispatch.run_id) return dispatch.run_id;
  if (config._runId) return config._runId;
  return config.run_id ?? null;
}

function reasoning(policy: AnyRecord) {
  return selectTruthyValue(() => policy.thinking, () => 'default');
}

async function announceForge(context: AnyRecord) {
  const { config, moduleId, mod, status, maxFails, deps, policy, harness } = context;
  const attempt = currentAttemptNumber(status);
  getModuleStats(config).total_forge_attempts++;
  await onModuleStarted(_telemetryCtx(config, deps._explicitDeps), moduleId, policy.model, attempt, {
    presentation: { discord: {
      level: 'INFO', title: `Module ${moduleId} started`, description: mod.title,
      fields: [
        ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, {
          run_id: getRunId(config), module_id: moduleId, attempt,
          gateway_label: resolveStatusGatewayLabel(status), model: policy.model,
          reasoning_level: reasoning(policy), thinking_source: policy.thinking_source, runtime: 'session',
        }),
        { name: 'Harness', value: harness }, { name: 'Retry Budget', value: `${status.fail_count + 1}/${maxFails}` },
      ],
    } },
  });
  onPhaseStarted(_telemetryCtx(config, deps._explicitDeps), moduleId, 'forge', policy.model);
}

function promptFailure(context: AnyRecord, error: string) {
  const { config, moduleId, mod, dir, status, deps, policy, recalledMemoryIds } = context;
  log('ERROR', `Module ${moduleId}, attempt ${status.fail_count + 1}: forge prompt assembly failed: ${error}`);
  emitTerminalModuleFailTelemetry({ config, moduleId, status, mod, phase: 'forge', model: policy.model, oldStatus: status?.status });
  return {
    status, recalledMemoryIds,
    terminal: buildModuleErrorTerminalResult(config, moduleId, {
      reason: error, moduleDir: dir, attempt: currentAttemptNumber(status), phase: 'forge',
      gatewayLabel: resolveStatusGatewayLabel(status), sessionKey: resolveStatusSessionKey(status),
    }),
  };
}

function activeAgentCallbacks(context: AnyRecord, execution: AnyRecord) {
  const { config, dir, deps, status, policy, harness, sessionLabel } = context;
  return {
    onDispatched: async (dispatch: AnyRecord = {}) => {
      setModuleActiveAgent(status, {
        session_key: selectTruthyValue(() => dispatch.session_key, () => null), stream_log_path: selectTruthyValue(() => dispatch.stream_log_path, () => null),
        label: sessionLabel, gateway_label: selectTruthyValue(() => dispatch.gateway_label, () => null), dispatch_id: selectTruthyValue(() => dispatch.dispatch_id, () => null),
        run_id: dispatchRunId(dispatch, config),
        attempt: currentAttemptNumber(status), runtime: selectTruthyValue(() => dispatch.runtime, () => null), model: policy.model,
        model_source: selectTruthyValue(() => policy.model_source, () => null), reasoning_level: reasoning(policy),
        thinking_source: selectTruthyValue(() => policy.thinking_source, () => null), agent_id: dispatch.agent_id ?? harness,
        phase: 'forge', started_at: new Date().toISOString(),
      });
      deps.saveStatus(config, dir, status);
    },
    onFinalized: async ({ status: finalStatus = null }: AnyRecord = {}) => {
      context.status = selectTruthyValue(() => finalStatus, () => deps.loadStatus(config, dir));
      if (!context.status) context.status = status;
      clearModuleActiveAgent(context.status);
      deps.saveStatus(config, dir, context.status);
    },
    executionContext: execution,
  };
}

function startForgeAttempt(context: AnyRecord, prompt: string, recalledMemoryIds: unknown[]) {
  const { config, moduleId, mod, dir, status, maxFails, timeout, novaPrompt, deps, policy, harness } = context;
  const attempt = currentAttemptNumber(status);
  const archived = archiveForgeCompletionArtifact(config, dir, attempt);
  if (archived) log('INFO', `Archived stale Forge completion before attempt ${attempt}: ${archived}`);
  deps.savePrompt(config, dir, 'forge', status.fail_count + 1, prompt);
  const transition = startModulePhase(status, 'forge', `Forge started (${harness})`, { now: new Date().toISOString() });
  status.validation = { attempt, delivery_lint_passed: false, delivery_lint_passed_at: null, pre_check_passed: false, pre_check_passed_at: null };
  deps.saveStatus(config, dir, status, transition);
  deps.setShutdownContext(config, 'forge', moduleId, dir);
  deps.invalidateHeadHash(config);
  const execution = buildModuleForgeRunInput(config, moduleId, mod, dir, status, {
    attempt, maxFails, model: policy.model, thinking: policy.thinking,
    thinkingSource: policy.thinking_source, timeoutMinutes: timeout,
    headBefore: deps.headHash(config), novaPromptProvided: Boolean(novaPrompt), recalledMemoryIds,
  });
  const callbacks = activeAgentCallbacks(context, execution);
  return { execution, workerInput: { ...execution, prompt, ...callbacks }, recalledMemoryIds };
}

export async function prepareModuleForge(context: AnyRecord) {
  setLogScope(context.moduleId, 'forge');
  const preflight = await runModulePreflight(context);
  if (preflight.terminal) return { terminalResult: { status: preflight.status, recalledMemoryIds: context.recalledMemoryIds, terminal: preflight.terminal } };
  const policy = context.deps.resolvePolicy(context.config, context.progress, 'forge', {
    scopeModel: context.mod.forge_model, scopeThinking: selectTruthyValue(() => context.mod.thinking_level?.forge, () => null), dispatchPath: 'acp',
  });
  const harness = context.config.agents?.forge?.acp_agent_id;
  if (!harness) throw new Error('Forge ACP dispatch requires explicit agents.forge.acp_agent_id');
  Object.assign(context, { policy, harness, sessionLabel: context.deps.acpLabel('forge', context.moduleId) });
  log('STEP', `Phase: FORGE (harness: ${harness}, model: ${selectTruthyValue(() => policy.model, () => 'model_not_configured')}, thinking: ${selectTruthyValue(() => policy.thinking, () => 'thinking_not_configured')}, model_source: ${policy.model_source})`);
  context.deps.logEffectivePolicy(context.config, { scope: 'module_forge', agent: 'forge', moduleId: context.moduleId, ...policy });
  await announceForge(context);
  const prompt = await context.deps.buildForgePrompt(context.config, context.moduleId, context.mod, context.dir, context.status, context.maxFails, context.novaPrompt);
  if (prompt.error) return { terminalResult: promptFailure(context, prompt.error) };
  const recalled = Array.isArray(prompt.recalledMemoryIds) ? prompt.recalledMemoryIds : [];
  return { ...startForgeAttempt(context, prompt.prompt, recalled), policy, harness };
}
