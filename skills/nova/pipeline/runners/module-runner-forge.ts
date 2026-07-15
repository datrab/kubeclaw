import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.ts';
import { STATUS } from '../core/constants.ts';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { requireStageHandler } from '../core/registry.ts';
import {
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
  resolveStatusDispatchId,
} from '../services/correlation.ts';
import { finalizeModuleSessionRateLimitExit, getRateLimitConfig } from '../services/rate-limit.ts';
import { normalizeTypedValidatorControlResult } from '../services/contracts/validator-control-result.ts';
import { assertPipelineStepResult } from '../services/contracts/pipeline-step-result.ts';
import { archiveForgeCompletionArtifact } from '../services/forge-completion.ts';
import {
  startModulePhase,
  transitionModuleStatus,
  setModuleActiveAgent,
  clearModuleActiveAgent,
} from '../lifecycle-state.ts';
import {
  onModuleStarted,
  onPhaseStarted,
  emitOperatorAlert,
} from '../services/telemetry.ts';
import { getPipelineDefaultsConfig } from '../services/runtime-defaults.ts';
import { normalizeGitFailureClass } from '../services/failure-semantics.ts';
import {
  _telemetryCtx,
  buildModuleForgeRunInput,
  buildModuleWorkerPluginInvocation,
  buildModuleValidatorPluginInvocation,
  buildModuleValidatorRunInput,
  computeElapsedSeconds,
  currentAttemptNumber,
  emitTerminalModuleFailTelemetry,
  ensureModulePluginLogDirs,
  ensureValidationState,
  formatDurationCompact,
  getModuleStats,
  getAttemptStartedAt,
  getPhaseStartedAt,
  markValidationPassed,
  normalizeModuleForgeWorkerResult,
  setLogScope,
  buildWorkerPluginEffects,
} from './module-runner-shared.ts';
import { runModulePreflight } from './module-runner/preflight.ts';
import { applyModuleRunnerCompletion } from './module-runner/completions.ts';
import { applyForgeBlockedCompletion, applyForgeOnlyPassCompletion, applyForgeReadyCompletion } from './module-runner/forge-completions.ts';
import {
  buildModuleBlockedTerminalResult,
  buildModuleErrorTerminalResult,
  buildModulePassTerminalResult,
  buildModuleRateLimitedTerminalResult,
  buildRetryResult,
} from './module-runner/terminal-results.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;
const FORGE_REASONING_LEVEL_NOT_CONFIGURED = 'default';
const GIT_SYNC_FAILED_CLASS = 'git_sync_failed';
const POLLING_GIT_SYNC_FAILED_REASON = 'Polling git sync failed closed during Forge phase';
const FORGE_COMPLETION_ARTIFACT_MISSING_REASON = 'Forge completion artifact was not produced';
const FORGE_WORKER_PASS_SUMMARY = 'Forge worker passed';
const FORGE_ONLY_NO_COMMIT_REASON = 'no commit was created';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function firstTextValue(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = textValue(value);
    if (normalized) return normalized;
  }
  return null;
}

function requireText(value: unknown, field: string): string {
  const normalized = textValue(value);
  if (!normalized) throw new Error(`${field}: required non-empty string`);
  return normalized;
}

function requirePositiveNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(number)), () => (number <= 0))) throw new Error(`${field}: required positive number`);
  return number;
}

function requiredRateLimitExitIdentity(rateLimitExit: AnyRecord) {
  return {
    runId: requireText(rateLimitExit.run_id, 'forgeRateLimitExit.run_id'),
    attempt: requirePositiveNumber(rateLimitExit.attempt, 'forgeRateLimitExit.attempt'),
    gatewayLabel: requireText(rateLimitExit.gateway_label, 'forgeRateLimitExit.gateway_label'),
    sessionKey: requireText(rateLimitExit.session_key, 'forgeRateLimitExit.session_key'),
  };
}

function forgeReasoningLevel(forgePolicy: AnyRecord): string {
  return selectDefinedValue(() => (textValue(forgePolicy.thinking)), () => (FORGE_REASONING_LEVEL_NOT_CONFIGURED));
}

function recalledMemoryIdsFromPrompt(promptResult: AnyRecord): unknown[] {
  return Array.isArray(promptResult.recalledMemoryIds) ? promptResult.recalledMemoryIds : [];
}

function forgeGitFailureClass(...values: unknown[]): string {
  return selectDefinedValue(() => (normalizeGitFailureClass(firstTextValue(...values))), () => (GIT_SYNC_FAILED_CLASS));
}

function clearForgeActiveAgentAfterWorkerFailure({ config, dir, status, deps }: AnyRecord = {}) {
  try {
    const latestStatus = selectTruthyValue(() => (deps.loadStatus(config, dir)), () => (status));
    clearModuleActiveAgent(latestStatus);
    deps.saveStatus(config, dir, latestStatus);
    return latestStatus;
  } catch (cleanupError) {
    log('WARN', `Failed to clear Module Forge active agent after worker failure: ${errorMessage(cleanupError)}`);
    return status;
  }
}

function workerMetadata(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.metadata && typeof controlResult.diagnostics.metadata === 'object'
    ? controlResult.diagnostics.metadata
    : {};
}

function workerTypedMetadata(controlResult: AnyRecord | null = null): AnyRecord {
  const typedWorker = workerTypedWorker(controlResult);
  return typedWorker.metadata && typeof typedWorker.metadata === 'object'
    ? typedWorker.metadata
    : {};
}

function workerTypedWorker(controlResult: AnyRecord | null = null): AnyRecord {
  return controlResult?.diagnostics?.typed?.worker && typeof controlResult.diagnostics.typed.worker === 'object'
    ? controlResult.diagnostics.typed.worker
    : {};
}

function workerOutcomeClass(controlResult: AnyRecord | null = null): string | null {
  const typedWorker = workerTypedWorker(controlResult);
  const outcomeClass = typedWorker.outcomeClass !== undefined
    ? typedWorker.outcomeClass
    : typedWorker.metadata?.outcomeClass;
  return typeof outcomeClass === 'string' && outcomeClass.trim() ? outcomeClass.trim() : null;
}

function workerSummary(controlResult: AnyRecord | null = null): string | null {
  const summary = controlResult?.diagnostics?.summary;
  return typeof summary === 'string' && summary.trim() ? summary.trim() : null;
}

function isRetryableStartupWorkerReason(reason: string | null = null): boolean {
  return selectTruthyValue(() => (selectTruthyValue(() => (reason === 'healthcheck_failed'), () => (reason === 'startup_evidence_missing'))), () => (reason === 'rate_limited'));
}

export async function runModuleForgePhase({
  config,
  progress,
  moduleId,
  mod,
  dir,
  status,
  maxFails,
  timeout,
  novaPrompt,
  stages,
  deps,
  recalledMemoryIds = [],
}: AnyRecord = {}) {
  const handleModuleFail = (statusValue: AnyRecord, phase: string, reason: string, opts: AnyRecord = {}) => (
    deps.handleFail(config, statusValue, dir, moduleId, maxFails, phase, reason, { progress, ...opts })
  );

  setLogScope(moduleId, 'forge');
  ensureValidationState(status);

  const preflight = await runModulePreflight({
    config,
    progress,
    moduleId,
    mod,
    dir,
    status,
    maxFails,
    deps,
    recalledMemoryIds,
  } as AnyRecord);
  if (preflight.terminal) return { status: preflight.status, recalledMemoryIds, terminal: preflight.terminal };

  const forgePolicy = deps.resolvePolicy(config, progress, 'forge', {
    scopeModel: mod.forge_model,
    scopeThinking: selectTruthyValue(() => (mod.thinking_level?.forge), () => (null)),
    dispatchPath: 'acp',
  });
  const forgeModel = forgePolicy.model;
  const forgeHarness = config.agents?.forge?.acp_agent_id;
  if (!forgeHarness) throw new Error('Forge ACP dispatch requires explicit agents.forge.acp_agent_id');
  log('STEP', `Phase: FORGE (harness: ${forgeHarness}, model: ${selectDefinedValue(() => (forgeModel), () => ('model_not_configured'))}, thinking: ${selectDefinedValue(() => (forgePolicy.thinking), () => ('thinking_not_configured'))}, model_source: ${forgePolicy.model_source})`);
  deps.logEffectivePolicy(config, { scope: 'module_forge', agent: 'forge', moduleId, ...forgePolicy });
  getModuleStats(config).total_forge_attempts++;
  await onModuleStarted(_telemetryCtx(config, deps._explicitDeps), moduleId, forgeModel, currentAttemptNumber(status), {
    presentation: {
      discord: {
        level: 'INFO',
        title: `Module ${moduleId} started`,
        description: mod.title,
        fields: [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status), model: forgeModel, reasoning_level: forgeReasoningLevel(forgePolicy), thinking_source: forgePolicy.thinking_source, runtime: 'session' }),
          { name: 'Harness', value: forgeHarness },
          { name: 'Retry Budget', value: `${status.fail_count + 1}/${maxFails}` },
        ],
      },
    },
  });
  onPhaseStarted(_telemetryCtx(config, deps._explicitDeps), moduleId, 'forge', forgeModel);

  const promptResult = await deps.buildForgePrompt(config, moduleId, mod, dir, status, maxFails, novaPrompt);
  if (promptResult.error) {
    log('ERROR', `Module ${moduleId}, attempt ${status.fail_count + 1}: forge prompt assembly failed: ${promptResult.error}`);
    emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'forge', forgeModel, status?.status);
    return {
      status,
      recalledMemoryIds,
      terminal: buildModuleErrorTerminalResult(config, moduleId, {
        reason: promptResult.error,
        moduleDir: dir,
        attempt: currentAttemptNumber(status),
        phase: 'forge',
        gatewayLabel: resolveStatusGatewayLabel(status),
        sessionKey: resolveStatusSessionKey(status),
      }),
    };
  }
  const forgePrompt = promptResult.prompt;
  recalledMemoryIds = recalledMemoryIdsFromPrompt(promptResult);

  const archivedCompletion = archiveForgeCompletionArtifact(config, dir, currentAttemptNumber(status));
  if (archivedCompletion) {
    log('INFO', `Archived stale Forge completion before attempt ${currentAttemptNumber(status)}: ${archivedCompletion}`);
  }

  deps.savePrompt(config, dir, 'forge', status.fail_count + 1, forgePrompt);

  const forgeAttemptStartedAt = new Date().toISOString();
  const forgeStartTransition = startModulePhase(status, 'forge', `Forge started (${forgeHarness})`, { now: forgeAttemptStartedAt });
  status.validation = {
    attempt: currentAttemptNumber(status),
    delivery_lint_passed: false,
    delivery_lint_passed_at: null,
    pre_check_passed: false,
    pre_check_passed_at: null,
  };
  deps.saveStatus(config, dir, status, forgeStartTransition);

  deps.setShutdownContext(config, 'forge', moduleId, dir);
  deps.invalidateHeadHash(config);
  const headBeforeForge = deps.headHash(config);
  const forgeSessionLabel = deps.acpLabel('forge', moduleId);

  const forgeStageId = 'worker:module_forge';
  const forgeExecutionInput = buildModuleForgeRunInput(config, moduleId, mod, dir, status, {
    attempt: currentAttemptNumber(status),
    maxFails,
    model: forgeModel,
    thinking: forgePolicy.thinking,
    thinkingSource: forgePolicy.thinking_source,
    timeoutMinutes: timeout,
    headBefore: headBeforeForge,
    novaPromptProvided: Boolean(novaPrompt),
    recalledMemoryIds,
  });
  const forgeWorkerInput = {
    ...forgeExecutionInput,
    prompt: forgePrompt,
    onDispatched: async (dispatch: AnyRecord = {}) => {
      setModuleActiveAgent(status, {
        session_key: selectTruthyValue(() => (dispatch.session_key), () => (null)),
        stream_log_path: selectTruthyValue(() => (dispatch.stream_log_path), () => (null)),
        label: forgeSessionLabel,
        gateway_label: selectTruthyValue(() => (dispatch.gateway_label), () => (null)),
        dispatch_id: selectTruthyValue(() => (dispatch.dispatch_id), () => (null)),
        run_id: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (dispatch.run_id), () => (config?._runId))), () => (config?.run_id))), () => (null)),
        attempt: currentAttemptNumber(status),
        runtime: selectTruthyValue(() => (dispatch.runtime), () => (null)),
        model: forgeModel,
        model_source: selectTruthyValue(() => (forgePolicy.model_source), () => (null)),
        reasoning_level: forgeReasoningLevel(forgePolicy),
        thinking_source: selectTruthyValue(() => (forgePolicy.thinking_source), () => (null)),
        agent_id: selectDefinedValue(() => (dispatch.agent_id), () => (forgeHarness)),
        phase: 'forge',
        started_at: new Date().toISOString(),
      });
      deps.saveStatus(config, dir, status);
    },
    onFinalized: async ({ status: finalizedStatus = null }: AnyRecord = {}) => {
      status = selectTruthyValue(() => (selectTruthyValue(() => (finalizedStatus), () => (deps.loadStatus(config, dir)))), () => (status));
      clearModuleActiveAgent(status);
      deps.saveStatus(config, dir, status);
    },
  };

  const agentStartupRetryBudget = getPipelineDefaultsConfig(config).agent_startup_retry_budget;
  let startupRateLimitPauses = 0;
  let forgeWorkerMetadata: AnyRecord = {};
  let forgeWorkerTypedMetadata: AnyRecord = {};
  let forgeWorkerSummary: string | null = null;
  let forgeFinalStatus: AnyRecord | null = null;
  let workerReason: string | null = null;
  let forgeWorkerControlResult: AnyRecord | null = null;

  for (let startupRetryCount = 0; ; startupRetryCount++) {
    let executeForgeWorker;
    let forgeOwnerRecord;
    try {
      ({ handler: executeForgeWorker, record: forgeOwnerRecord } = requireStageHandler(config, 'worker.execute', forgeStageId, 'execute'));
      ensureModulePluginLogDirs(config);
      const pluginInvocation = buildModuleWorkerPluginInvocation(moduleId, status, forgeStageId, {
        attempt: currentAttemptNumber(status),
      });
      const pluginContext = createPluginContext({
        config,
        progress,
        hookFamily: 'worker.execute',
        stageId: forgeStageId,
        record: forgeOwnerRecord,
        invocation: pluginInvocation,
        stateSnapshot: async () => forgeExecutionInput.stateSnapshot,
        environmentMetadata: {
          moduleId,
          phase: 'forge',
          workerType: 'module_forge',
          model: forgeModel,
          thinking: selectTruthyValue(() => (forgePolicy.thinking), () => (null)),
        },
        effects: buildWorkerPluginEffects(config, progress, forgeStageId, forgeWorkerInput, deps),
      });

      const rawForgeWorkerResult: unknown = await executeForgeWorker(
        buildPluginInvocationEnvelope(forgeExecutionInput, pluginContext, {
          workerInput: {
            ...forgeWorkerInput,
            executionContext: {
              ...forgeWorkerInput.executionContext,
              startupRateLimitPauseCount: startupRateLimitPauses,
            },
          },
        }),
        pluginContext,
      );
      forgeWorkerControlResult = normalizeModuleForgeWorkerResult(config, forgeExecutionInput, rawForgeWorkerResult, { stageId: forgeStageId, moduleId: forgeOwnerRecord.manifest.moduleId, pluginInvocation });
    } catch (error) {
      const reason = `Module Forge worker execution failed: ${errorMessage(error)}`;
      log('ERROR', reason);
      const failureDispatchId = requireText(selectDefinedValue(() => (status?.active_agent?.dispatch_id), () => (resolveStatusDispatchId(status))), 'forge.failure.dispatch_id');
      const failureGatewayLabel = requireText(selectDefinedValue(() => (status?.active_agent?.gateway_label), () => (resolveStatusGatewayLabel(status))), 'forge.failure.gateway_label');
      const failureSessionKey = requireText(selectDefinedValue(() => (status?.active_agent?.session_key), () => (resolveStatusSessionKey(status))), 'forge.failure.session_key');
      status = clearForgeActiveAgentAfterWorkerFailure({ config, dir, status, deps });
      emitTerminalModuleFailTelemetry(
        config,
        moduleId,
        status,
        mod,
        'forge',
        forgeModel,
        status?.status !== undefined ? status.status : STATUS.IN_PROGRESS,
        reason,
        {
          dispatchId: failureDispatchId,
          gatewayLabel: failureGatewayLabel,
          sessionKey: failureSessionKey,
        },
      );
      return {
        status,
        recalledMemoryIds,
        terminal: buildModuleErrorTerminalResult(config, moduleId, {
          reason,
          moduleDir: dir,
          attempt: currentAttemptNumber(status),
          phase: 'forge',
          dispatchId: failureDispatchId,
          gatewayLabel: failureGatewayLabel,
          sessionKey: failureSessionKey,
          ...((error as AnyRecord)?.diagnostics ? { diagnostics: { contract_invalid: true, contract_diagnostic: (error as AnyRecord).diagnostics } } : {}),
        }),
      };
    }

    forgeWorkerMetadata = workerMetadata(forgeWorkerControlResult);
    forgeWorkerTypedMetadata = workerTypedMetadata(forgeWorkerControlResult);
    forgeWorkerSummary = workerSummary(forgeWorkerControlResult);
    forgeFinalStatus = selectTruthyValue(() => (forgeWorkerMetadata.final_status), () => (null));
    workerReason = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (forgeWorkerMetadata.reason), () => (workerOutcomeClass(forgeWorkerControlResult)))), () => (forgeWorkerTypedMetadata.outcomeClass))), () => (null));
    if (workerReason === 'rate_limited') {
      startupRateLimitPauses = forgeWorkerMetadata.rate_limit_pauses !== undefined
        ? Number(forgeWorkerMetadata.rate_limit_pauses)
        : startupRateLimitPauses + 1;
      log('WARN', `Module ${moduleId}: Forge startup rate limited — retrying after cooldown pause ${startupRateLimitPauses}`);
      continue;
    }
    if (selectTruthyValue(() => (!isRetryableStartupWorkerReason(workerReason)), () => (startupRetryCount >= agentStartupRetryBudget))) {
      break;
    }
    log('WARN', `Module ${moduleId}: Forge startup failed (${workerReason}) — retrying agent startup ${startupRetryCount + 1}/${agentStartupRetryBudget}`);
  }

  const forgeSessionKey = requireText(selectDefinedValue(() => (forgeWorkerMetadata.session_key), () => (resolveStatusSessionKey(status))), 'forge.session_key');
  const terminalDetail = typeof forgeWorkerMetadata.status_detail === 'string' && forgeWorkerMetadata.status_detail.trim()
    ? forgeWorkerMetadata.status_detail.trim()
    : null;
  const terminalMessage = typeof forgeWorkerMetadata.status_message === 'string' && forgeWorkerMetadata.status_message.trim()
    ? forgeWorkerMetadata.status_message.trim()
    : null;
  const terminalErrors = Array.isArray(forgeWorkerMetadata.status_errors) ? forgeWorkerMetadata.status_errors : [];

  if (workerReason === 'spawn_failed') {
    const reason = `Forge spawn failed: ${forgeWorkerMetadata.error}`;
    const spawnFailureGatewayLabel = requireText(selectDefinedValue(() => (forgeWorkerMetadata.gateway_label), () => (resolveStatusGatewayLabel(status))), 'forge.spawn_failure.gateway_label');
    const spawnFailureSessionKey = requireText(selectDefinedValue(() => (forgeWorkerMetadata.session_key), () => (resolveStatusSessionKey(status))), 'forge.spawn_failure.session_key');
    log('ERROR', `Module ${moduleId}, attempt ${status.fail_count + 1}/${maxFails}: forge agent spawn failed: ${forgeWorkerMetadata.error}`);
    await emitOperatorAlert(_telemetryCtx(config, deps._explicitDeps), 'module.operator_alert', {
      module_id: moduleId,
      phase: 'forge',
      attempt: currentAttemptNumber(status),
      gateway_label: spawnFailureGatewayLabel,
      session_key: spawnFailureSessionKey,
    }, {
      hookId: 'module.completed',
      moduleId,
      attempt: currentAttemptNumber(status),
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Module ${moduleId} — Forge Spawn Failed`,
          description: reason,
          fields: [
            ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, {
              run_id: getRunId(config),
              module_id: moduleId,
              attempt: currentAttemptNumber(status),
              gateway_label: spawnFailureGatewayLabel,
              session_key: spawnFailureSessionKey,
            }),
            { name: 'Status', value: 'ERROR' },
            { name: 'Action', value: 'Inspect Forge runtime and retry the module' },
          ],
        },
      },
    });
    emitTerminalModuleFailTelemetry(
      config,
      moduleId,
      status,
      mod,
      'forge',
      forgeModel,
      status?.status !== undefined ? status.status : STATUS.IN_PROGRESS,
      reason,
      {
        gatewayLabel: spawnFailureGatewayLabel,
        sessionKey: spawnFailureSessionKey,
      },
    );
    return {
      status,
      recalledMemoryIds,
      terminal: buildModuleErrorTerminalResult(config, moduleId, {
        reason,
        moduleDir: dir,
        attempt: currentAttemptNumber(status),
        phase: 'forge',
        gatewayLabel: spawnFailureGatewayLabel,
        sessionKey: spawnFailureSessionKey,
      }),
    };
  }

  if (workerReason === 'healthcheck_failed') {
    const failResult = await handleModuleFail(status, 'forge',
      'Forge agent failed health check — session not running after spawn', { recalledMemoryIds });
    return failResult._retry
      ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
      : { status, recalledMemoryIds, terminal: { retry: false, result: assertPipelineStepResult(failResult) } };
  }

  if (forgeWorkerControlResult?.nextAction !== 'pass') {
    status = selectTruthyValue(() => (selectTruthyValue(() => (forgeFinalStatus), () => (deps.loadStatus(config, dir)))), () => (status));

    const forgeNoWorkReasons = new Set([
      'session_ended_no_changes',
      'agent_ended_no_meaningful_diff',
      'session_ended_no_meaningful_diff',
    ]);
    if (forgeNoWorkReasons.has(workerReason)) {
      const forgeNoChangesBaseMsg = 'Forge session ended but produced no typed meaningful-diff completion evidence';
      const forgeNoChangesMsg = terminalDetail
        ? `${forgeNoChangesBaseMsg} (${terminalDetail})`
        : forgeNoChangesBaseMsg;
      await emitOperatorAlert(_telemetryCtx(config, deps._explicitDeps), 'module.operator_alert', {
        module_id: moduleId,
        phase: 'forge',
        attempt: currentAttemptNumber(status),
        gateway_label: resolveStatusGatewayLabel(status),
        session_key: forgeSessionKey,
      }, {
        hookId: 'module.completed',
        moduleId,
        attempt: currentAttemptNumber(status),
        presentation: {
          discord: {
            level: 'WARN',
            title: `Module ${moduleId} — Forge no changes`,
            description: forgeNoChangesMsg,
            fields: [
              ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { run_id: getRunId(config), module_id: moduleId, attempt: currentAttemptNumber(status), gateway_label: resolveStatusGatewayLabel(status), session_key: forgeSessionKey }),
              { name: 'Status', value: 'FAIL' },
              { name: 'Action', value: 'Inspect Forge output and resume' },
            ],
          },
        },
      });
      const failResult = await handleModuleFail(status, 'forge', forgeNoChangesMsg, { recalledMemoryIds });
      return failResult._retry
        ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
        : { status, recalledMemoryIds, terminal: { retry: false, result: assertPipelineStepResult(failResult) } };
    }

    if (workerReason === 'timeout') {
      const failResult = await handleModuleFail(status, 'forge',
        `TIMEOUT: Forge did not complete within ${timeout} minutes`, { isTimeout: true, recalledMemoryIds });
      return failResult._retry
        ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
        : { status, recalledMemoryIds, terminal: { retry: false, result: assertPipelineStepResult(failResult) } };
    }
    if (workerReason === 'rate_limit_exhausted') {
      const rateLimitReason = 'Rate limit pauses exceeded maximum — pipeline halted';
      const forgeRateLimitExit = await finalizeModuleSessionRateLimitExit({
        reason: workerReason,
        rate_limit_status: selectDefinedValue(() => (forgeWorkerMetadata.rate_limit_status), () => (null)),
        rate_limit_pauses: selectDefinedValue(() => (forgeWorkerMetadata.rate_limit_pauses), () => (null)),
        max_rate_limit_pauses: selectDefinedValue(() => (forgeWorkerMetadata.max_rate_limit_pauses), () => (null)),
        status: selectDefinedValue(() => (forgeWorkerMetadata.rate_limit_status), () => (null)),
      }, {
        config,
        moduleId,
        moduleDir: dir,
        phase: 'forge',
        notifyDiscord: deps.discord,
        discordTitle: `Module ${moduleId} RATE LIMITED`,
        discordDescription: (exitResult: AnyRecord) =>
          `Forge attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}). Pipeline cannot continue.`,
        reason: rateLimitReason,
        identity: {
          run_id: getRunId(config),
          attempt: currentAttemptNumber(status),
          gateway_label: requireText(selectDefinedValue(() => (forgeWorkerMetadata.gateway_label), () => (resolveStatusGatewayLabel(status))), 'forge.rate_limit.gateway_label'),
          session_key: forgeSessionKey,
        },
        maxPauses: getRateLimitConfig(config).max_pauses_per_module,
        logLevel: 'ERROR',
        logMessage: `Module ${moduleId} rate limit pauses exhausted in forge phase`,
      } as AnyRecord);
      const rateLimitIdentity = requiredRateLimitExitIdentity(forgeRateLimitExit);
      return { status, recalledMemoryIds, terminal: buildModuleRateLimitedTerminalResult(config, moduleId, {
        rateLimitResult: forgeRateLimitExit,
        reason: rateLimitReason,
        runId: rateLimitIdentity.runId,
        moduleDir: dir,
        attempt: rateLimitIdentity.attempt,
        phase: 'forge',
        gatewayLabel: rateLimitIdentity.gatewayLabel,
        sessionKey: rateLimitIdentity.sessionKey,
      }) };
    }
    if (workerReason === 'invalid_forge_completion') {
      const detail = terminalErrors.length > 0
        ? terminalErrors.join('; ')
        : 'invalid Forge completion artifact';
      applyModuleRunnerCompletion({
        deps,
        config,
        dir,
        status,
        moduleId,
        phase: 'forge',
        attempt: currentAttemptNumber(status),
        completionStatus: 'ERROR',
        authority: { kind: 'artifact', path: 'forge-completion.json' },
        reasonCode: 'invalid_contract',
        summary: detail,
        gatewayLabel: resolveStatusGatewayLabel(status),
        sessionKey: selectDefinedValue(() => (resolveStatusSessionKey(status)), () => (forgeSessionKey)),
        metadata: {
          failure_class: 'invalid_contract',
          status_errors: terminalErrors,
        },
      });
      const failResult = await handleModuleFail(status, 'forge', detail, {
        recalledMemoryIds,
        discordFields: [{ name: 'Contract', value: 'forge-completion.json' }],
      });
      return failResult._retry
        ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
        : { status, recalledMemoryIds, terminal: { retry: false, result: assertPipelineStepResult(failResult) } };
    }
    if (workerReason === 'parse_corrupted') {
      const failResult = await handleModuleFail(status, 'forge',
        'Forge completion artifact is permanently corrupted (unparseable after multiple attempts)', { recalledMemoryIds });
      return failResult._retry
        ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
        : { status, recalledMemoryIds, terminal: { retry: false, result: assertPipelineStepResult(failResult) } };
    }
    if (workerReason === 'git_error') {
      const gitFailureClass = forgeGitFailureClass(terminalMessage, terminalDetail, forgeWorkerSummary, workerReason);
      return {
        status,
        recalledMemoryIds,
        terminal: buildModuleErrorTerminalResult(config, moduleId, {
          reason: selectDefinedValue(() => (textValue(terminalMessage)), () => (POLLING_GIT_SYNC_FAILED_REASON)),
          moduleDir: dir,
          attempt: currentAttemptNumber(status),
          phase: 'forge',
          gatewayLabel: resolveStatusGatewayLabel(status),
          sessionKey: selectDefinedValue(() => (resolveStatusSessionKey(status)), () => (forgeSessionKey)),
          terminalReasonCode: gitFailureClass,
          terminalSource: 'module:forge_git',
          metadata: {
            failure_class: gitFailureClass,
            polling_git: selectDefinedValue(() => (forgeWorkerMetadata.polling_git), () => (null)),
          },
        }),
      };
    }

    const failReason = selectDefinedValue(() => (firstTextValue(terminalDetail, terminalMessage, forgeWorkerSummary, workerReason)), () => (FORGE_COMPLETION_ARTIFACT_MISSING_REASON));
    const failResult = await handleModuleFail(status, 'forge', failReason, { recalledMemoryIds });
    return failResult._retry
      ? { status, recalledMemoryIds, terminal: buildRetryResult(failResult, status) }
      : { status, recalledMemoryIds, terminal: { retry: false, result: assertPipelineStepResult(failResult) } };
  }

  const forgeCompletionReasons = new Set([
    'forge_completion',
    'agent_ended_meaningful_diff',
    'session_ended_meaningful_diff',
  ]);
  const typedPassForgeCompletion = workerReason === 'passed'
    ? {
        status: STATUS.READY_FOR_TESTING,
        summary: selectDefinedValue(() => (textValue(forgeWorkerSummary)), () => (FORGE_WORKER_PASS_SUMMARY)),
      }
    : null;
  const forgeCompletion = forgeCompletionReasons.has(workerReason)
    ? forgeFinalStatus
    : typedPassForgeCompletion;

  if (forgeCompletion?.status === STATUS.BLOCKED) {
    applyForgeBlockedCompletion({ deps, config, dir, status, moduleId, attempt: currentAttemptNumber(status), summary: forgeCompletion.summary, sessionKey: forgeSessionKey, gatewayLabel: resolveStatusGatewayLabel(status) });
    emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'forge', forgeModel, STATUS.BLOCKED, forgeCompletion.summary);
    return {
      status,
      recalledMemoryIds,
      terminal: buildModuleBlockedTerminalResult(config, moduleId, {
        reason: forgeCompletion.summary,
        moduleDir: dir,
        attempt: currentAttemptNumber(status),
        phase: 'forge',
        gatewayLabel: resolveStatusGatewayLabel(status),
        sessionKey: forgeSessionKey,
      }),
    };
  }

  if (forgeCompletion?.status !== STATUS.READY_FOR_TESTING) {
    const reason = `Unexpected Forge completion result: ${selectTruthyValue(() => (workerReason), () => ('missing_worker_reason'))}`;
    log('ERROR', reason);
    return {
      status,
      recalledMemoryIds,
      terminal: buildModuleErrorTerminalResult(config, moduleId, {
        reason,
        moduleDir: dir,
        attempt: currentAttemptNumber(status),
        phase: 'forge',
        gatewayLabel: resolveStatusGatewayLabel(status),
        sessionKey: forgeSessionKey,
      }),
    };
  }

  ensureValidationState(status);
  applyForgeReadyCompletion({ deps, config, dir, status, moduleId, attempt: currentAttemptNumber(status), summary: forgeCompletion.summary, sessionKey: forgeSessionKey, gatewayLabel: resolveStatusGatewayLabel(status) });
  log('OK', 'Forge completion evidence accepted → READY_FOR_TESTING');

  const forgeDurationSec = computeElapsedSeconds(getPhaseStartedAt(status));
  const forgeNextStep = stages.includes('buster') ? 'Buster' : 'done (no Buster)';
  const forgeCompletionCorrelation = {
    run_id: getRunId(config),
    module_id: moduleId,
    attempt: currentAttemptNumber(status),
    gateway_label: resolveStatusGatewayLabel(status),
    session_key: forgeSessionKey,
    model: forgeModel,
    reasoning_level: forgeReasoningLevel(forgePolicy),
    thinking_source: forgePolicy.thinking_source,
    runtime: 'session',
  };
  await deps.discord(config, 'OK', `Module ${moduleId} Forge complete → ${forgeNextStep}`, mod.title, [
    ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, forgeCompletionCorrelation),
    { name: 'Forge Duration', value: formatDurationCompact(forgeDurationSec) },
    { name: 'Retry Budget', value: `${status.fail_count + 1}/${maxFails}` },
  ], { correlation: forgeCompletionCorrelation });

  return { status, recalledMemoryIds, terminal: null };
}

export async function finalizeForgeOnlyPass({
  config,
  moduleId,
  mod,
  dir,
  status,
  stages,
  deps,
}: AnyRecord = {}) {
  log('INFO', 'No buster in stages — promoting READY_FOR_TESTING → PASS');

  let gitResult;
  try {
    gitResult = await deps.gitCommitAndPush(config, `[pipeline] Module ${moduleId}: Forge output (no buster)`);
  } catch (error) {
    const reason = `Forge-only module cannot PASS without durable Git persistence: ${errorMessage(error)}`;
    log('ERROR', reason);
    return { terminal: buildModuleErrorTerminalResult(config, moduleId, {
      reason,
      moduleDir: dir,
      attempt: currentAttemptNumber(status),
      phase: 'forge',
      gatewayLabel: resolveStatusGatewayLabel(status),
      sessionKey: resolveStatusSessionKey(status),
    }) };
  }
  if (gitResult?.committed !== true) {
    const reason = `Forge-only module cannot PASS without a durable Git commit: ${selectDefinedValue(() => (textValue(gitResult?.error)), () => (FORGE_ONLY_NO_COMMIT_REASON))}`;
    log('ERROR', reason);
    return { terminal: buildModuleErrorTerminalResult(config, moduleId, {
      reason,
      moduleDir: dir,
      attempt: currentAttemptNumber(status),
      phase: 'forge',
      gatewayLabel: resolveStatusGatewayLabel(status),
      sessionKey: resolveStatusSessionKey(status),
    }) };
  }

  const forgeOnlyCompletedAt = new Date().toISOString();
  applyForgeOnlyPassCompletion({ deps, config, dir, status, moduleId, attempt: currentAttemptNumber(status), occurredAt: forgeOnlyCompletedAt, sessionKey: resolveStatusSessionKey(status), gatewayLabel: resolveStatusGatewayLabel(status) });
  if (!status.cost) status.cost = {};
  if (status.started_at) {
    status.cost.total_duration_seconds = computeElapsedSeconds(status.started_at, status.completed_at);
  }
  status.cost.attempt_duration_seconds = computeElapsedSeconds(getAttemptStartedAt(status), status.completed_at);

  log('OK', `Module ${moduleId} PASS (forge-only)`);
  setLogScope(null, null);
  getModuleStats(config).modules_completed.push(moduleId);

  return { status, terminal: buildModulePassTerminalResult(config, moduleId, {
    moduleDir: dir,
    attempt: currentAttemptNumber(status),
    phase: 'forge',
    gatewayLabel: resolveStatusGatewayLabel(status),
    sessionKey: resolveStatusSessionKey(status),
  }) };
}
