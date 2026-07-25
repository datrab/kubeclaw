import { STATUS } from '../../../core/constants.ts';
import { log } from '../../../core/logger.ts';
import { getRunId } from '../../../core/runtime.ts';
import {
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
} from '../../../services/correlation.ts';
import { resolveModuleBusterDispatchId } from '../../../services/buster-dispatch-identity.ts';
import {
  emitTerminalModuleFailTelemetry,
} from '../../module-runner-shared.ts';
import { executeBusterWorkerAttempt } from '../../module-runner-buster-worker.ts';
import {
  buildModuleErrorTerminalResult,
  buildModuleNeedsNovaTerminalResult,
} from '../terminal-results.ts';
import { buildBusterAgentJudgmentPolicy } from '../../../agents/orchestration.ts';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../../services/discord-fields.ts';

import { selectDefinedValue, selectTruthyValue } from '../../../optional-absence.ts';
type AnyRecord = Record<string, any>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createModuleBusterCompletionIdentity({ runId, moduleId, attempt, busterAttempt, nowMs }: AnyRecord = {}) {
  if (!runId) throw new Error('Module Buster completion identity requires runId');
  if (!moduleId) throw new Error('Module Buster completion identity requires moduleId');
  if (selectTruthyValue(() => (!Number.isInteger(attempt)), () => (attempt < 1))) throw new Error('Module Buster completion identity requires positive integer attempt');
  if (selectTruthyValue(() => (!Number.isInteger(busterAttempt)), () => (busterAttempt < 1))) throw new Error('Module Buster completion identity requires positive integer busterAttempt');
  if (selectTruthyValue(() => (!Number.isInteger(nowMs)), () => (nowMs < 0))) throw new Error('Module Buster completion identity requires non-negative integer nowMs');
  return {
    runId,
    attempt,
    dispatchId: `buster-module-${moduleId}-${nowMs}-${busterAttempt}`,
    gateway_label: null,
  };
}

function isBusterResumeDispatch(status: AnyRecord | null): boolean {
  return status?.status === STATUS.TESTING
    && status?.current_phase === 'buster'
    && Boolean(resolveModuleBusterDispatchId(status));
}

function createResumedModuleBusterCompletionIdentity({ runId, moduleId, attempt, status }: AnyRecord = {}) {
  if (!runId) throw new Error('Resumed Module Buster completion identity requires runId');
  if (!moduleId) throw new Error('Resumed Module Buster completion identity requires moduleId');
  if (selectTruthyValue(() => (!Number.isInteger(attempt)), () => (attempt < 1))) throw new Error('Resumed Module Buster completion identity requires positive integer attempt');
  const dispatchId = resolveModuleBusterDispatchId(status);
  const sessionKey = resolveStatusSessionKey(status);
  if (!dispatchId) throw new Error('Resumed Module Buster completion identity requires status.dispatch_id');
  return {
    runId,
    attempt,
    dispatchId,
    gateway_label: resolveStatusGatewayLabel(status),
    sessionKey,
    resumed: true,
  };
}

function normalizeRequestedBusterSuites(mod: AnyRecord = {}): string[] {
  if (!Array.isArray(mod.test_suites)) return [];
  return mod.test_suites
    .map((suite: unknown) => typeof suite === 'string' ? suite.trim() : '')
    .filter(Boolean);
}

function resolveModuleBusterIdentityNowMs(deps: AnyRecord = {}): number {
  const value = typeof deps.nowMs === 'function' ? deps.nowMs() : Date.now();
  if (selectTruthyValue(() => (!Number.isInteger(value)), () => (value < 0))) throw new Error('Module Buster identity clock returned invalid nowMs');
  return value;
}

function statusAfterWorkerOutcome(currentStatus: AnyRecord, workerOutcome: AnyRecord): AnyRecord {
  if (workerOutcome?.status && typeof workerOutcome.status === 'object') return workerOutcome.status;
  return currentStatus;
}

function createBusterDispatchIdentity(context: AnyRecord) {
  const { config, moduleId, status, busterAttempt, deps, busterModel, busterPolicy } = context;
  const input = { runId: getRunId(config), moduleId, attempt: status.fail_count + 1, status };
  const identity: AnyRecord = isBusterResumeDispatch(status)
    ? createResumedModuleBusterCompletionIdentity(input)
    : createModuleBusterCompletionIdentity({ ...input, busterAttempt, nowMs: resolveModuleBusterIdentityNowMs(deps) });
  Object.assign(identity, {
    model: busterModel ?? null,
    model_source: busterPolicy.model_source ?? null,
    reasoning_level: busterPolicy.thinking_supported === false ? 'not supported' : busterPolicy.thinking ?? 'default',
    thinking_source: busterPolicy.thinking_source ?? null,
    runtime: 'session',
  });
  return identity;
}

function busterDispatchTerminal(context: AnyRecord, identity: AnyRecord, reason: string, options: AnyRecord = {}) {
  const { config, moduleId, dir, status, mod, busterModel } = context;
  log('ERROR', `Module ${moduleId} — ${reason}`);
  emitTerminalModuleFailTelemetry({ config, moduleId, status, mod, phase: 'buster', model: busterModel, oldStatus: status?.status });
  const builder = options.needsNova ? buildModuleNeedsNovaTerminalResult : buildModuleErrorTerminalResult;
  return { terminal: builder(config, moduleId, {
    reason,
    runId: identity.runId,
    moduleDir: dir,
    attempt: identity.attempt,
    phase: 'buster',
    dispatchId: identity.dispatchId,
    gatewayLabel: resolveStatusGatewayLabel(status),
    sessionKey: resolveStatusSessionKey(status),
    ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
    ...(options.reasonCode ? { terminalReasonCode: options.reasonCode, terminalHumanReason: options.humanReason ?? reason } : {}),
  }) };
}

function buildBusterDispatchPrompt(context: AnyRecord, identity: AnyRecord) {
  const { config, moduleId, mod, dir, status, maxFails, deps } = context;
  let result;
  try {
    result = deps.buildBusterModulePrompt(config, moduleId, mod, dir, status, maxFails, identity);
  } catch (error: unknown) {
    result = { error: errorMessage(error), thrown: true };
  }
  if (!result.error) return { prompt: result.prompt, terminal: null };
  const reason = `Buster prompt build failed for ${moduleId}: ${result.error}`;
  return { prompt: null, terminal: busterDispatchTerminal(context, identity, reason, {
    metadata: { failure_class: 'buster_prompt_build_failed', thrown: result.thrown === true },
    reasonCode: 'buster_prompt_build_failed',
  }).terminal };
}

function persistBusterPrompt(context: AnyRecord, identity: AnyRecord, prompt: string) {
  const { config, moduleId, dir, status, deps } = context;
  try {
    deps.savePrompt(config, dir, 'buster', status.fail_count + 1, prompt);
    return null;
  } catch (error: unknown) {
    const reason = `Buster prompt artifact write failed: ${errorMessage(error)}`;
    return busterDispatchTerminal(context, identity, reason, {
      metadata: { failure_class: 'buster_prompt_artifact_failed' },
      reasonCode: 'buster_prompt_artifact_failed',
    }).terminal;
  }
}

async function validateInitialBusterDispatch(context: AnyRecord, identity: AnyRecord) {
  const { config, moduleId, deps, busterAttempt } = context;
  if (busterAttempt !== 1) return null;
  try {
    deps.validateBusterConfig(config);
    return null;
  } catch (error: unknown) {
    const reason = `Config validation failed: ${errorMessage(error)}`;
    const correlation = { ...identity, run_id: identity.runId, module_id: moduleId, dispatch_id: identity.dispatchId };
    await deps.discord(config, 'CRITICAL', `Module ${moduleId} — Config Invalid`,
      'Pre-dispatch validation caught config issues. Fix progress.json before retrying.',
      buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, correlation, [
        { name: 'Issue', value: errorMessage(error).slice(0, 200) },
      ]), { correlation });
    deps.clearShutdownContext();
    return busterDispatchTerminal(context, identity, reason, { needsNova: true }).terminal;
  }
}

async function notifyBusterQueued(context: AnyRecord, identity: AnyRecord, requestedSuites: string[]) {
  const { config, moduleId, mod, deps } = context;
  const judgment = buildBusterAgentJudgmentPolicy(mod);
  const enabled = judgment.required === true;
  const correlation = { run_id: identity.runId, module_id: moduleId, attempt: identity.attempt, dispatch_id: identity.dispatchId, gateway_label: identity.gateway_label, session_key: identity.sessionKey };
  await deps.discord(config, 'INFO', `Module ${moduleId} — Buster queued`,
    enabled
      ? 'Buster work is queued. Deterministic suites run first; the Buster agent is configured to run after the suites pass.'
      : 'Buster work is queued. Deterministic suites are the final Buster authority for this module.', [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...correlation, model: identity.model, model_source: identity.model_source, reasoning_level: identity.reasoning_level, thinking_source: identity.thinking_source, runtime: identity.runtime }),
      { name: 'Phase', value: 'buster', inline: true },
      { name: 'Queued Suites', value: requestedSuites.join(', '), inline: true },
      { name: 'Agent Judgment', value: enabled ? 'enabled' : 'disabled', inline: true },
      { name: 'Authority', value: enabled ? 'Buster agent is required after deterministic suites pass' : 'Deterministic suites are final authority', inline: false },
      { name: 'Policy Reason', value: String(judgment.reason), inline: false },
      { name: 'Next', value: enabled ? 'Watch for suite results, then Buster agent spawn/result.' : 'Watch for deterministic suite result.', inline: false },
    ], { correlation });
}

export async function executeBusterAttemptDispatch(context: AnyRecord = {}) {
  const {
    config, progress, moduleId, mod, dir, status, timeout, maxFails, deps,
    busterModel, busterPolicy = {}, maxBusterCrashRetries, busterAttempt,
    startupRateLimitPauseCount = 0,
  } = context;
  const requestedSuites = normalizeRequestedBusterSuites(mod);
  const completionIdentity = createBusterDispatchIdentity({ ...context, busterPolicy });
  if (requestedSuites.length === 0) {
    const reason = 'Buster dispatch requires a typed nonempty test_suites list';
    return busterDispatchTerminal(context, completionIdentity, reason, {
      needsNova: true,
      diagnostics: { metadata: { code: 'buster_test_suites_empty', test_suites: mod?.test_suites ?? null } },
    });
  }
  const promptResult = buildBusterDispatchPrompt(context, completionIdentity);
  if (promptResult.terminal) return { terminal: promptResult.terminal };
  const promptTerminal = persistBusterPrompt(context, completionIdentity, promptResult.prompt);
  if (promptTerminal) return { terminal: promptTerminal };
  const validationTerminal = await validateInitialBusterDispatch(context, completionIdentity);
  if (validationTerminal) return { terminal: validationTerminal };
  if (completionIdentity.resumed === true) {
    log('INFO', `Module ${moduleId}: adopting existing Buster dispatch ${completionIdentity.dispatchId} on resume`);
  }
  deps.setShutdownContext(config, 'buster', moduleId, dir);
  await notifyBusterQueued(context, completionIdentity, requestedSuites);
  completionIdentity.gateway_label = null;
  const workerOutcome = await executeBusterWorkerAttempt({
    config, progress, moduleId, mod, dir, status, timeout, maxFails, deps,
    busterPrompt: promptResult.prompt,
    completionIdentity,
    busterModel,
    busterPolicy,
    maxBusterCrashRetries,
    busterAttempt,
    startupRateLimitPauseCount,
  });
  return {
    completionIdentity,
    workerOutcome,
    status: statusAfterWorkerOutcome(status, workerOutcome),
  };
}
