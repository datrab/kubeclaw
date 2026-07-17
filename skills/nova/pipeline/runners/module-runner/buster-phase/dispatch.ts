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

export function createModuleBusterCompletionIdentity({ runId, moduleId, attempt, busterAttempt, nowMs }: AnyRecord = {}) {
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

export async function executeBusterAttemptDispatch({
  config,
  progress,
  moduleId,
  mod,
  dir,
  status,
  timeout,
  maxFails,
  deps,
  busterModel,
  busterPolicy = {},
  maxBusterCrashRetries,
  busterAttempt,
  startupRateLimitPauseCount = 0,
}: AnyRecord = {}) {
  const requestedSuites = normalizeRequestedBusterSuites(mod);
  const runId = getRunId(config);
  const attempt = status.fail_count + 1;
  const completionIdentity = isBusterResumeDispatch(status) ? createResumedModuleBusterCompletionIdentity({
    runId,
    moduleId,
    attempt,
    status,
  }) : createModuleBusterCompletionIdentity({
    runId,
    moduleId,
    attempt,
    busterAttempt,
    nowMs: resolveModuleBusterIdentityNowMs(deps),
  });
  const busterReasoningLevel = busterPolicy.thinking_supported === false
    ? 'not supported'
    : (selectDefinedValue(() => (busterPolicy.thinking), () => ('default')));
  Object.assign(completionIdentity, {
    model: selectTruthyValue(() => (busterModel), () => (null)),
    model_source: selectTruthyValue(() => (busterPolicy.model_source), () => (null)),
    reasoning_level: busterReasoningLevel,
    thinking_source: selectTruthyValue(() => (busterPolicy.thinking_source), () => (null)),
    runtime: 'session',
  });

  if (requestedSuites.length === 0) {
    const reason = 'Buster dispatch requires a typed nonempty test_suites list';
    log('ERROR', `Module ${moduleId} — ${reason}`);
    emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'buster', busterModel, status?.status);
    return { terminal: buildModuleNeedsNovaTerminalResult(config, moduleId, {
      reason,
      runId: completionIdentity.runId,
      moduleDir: dir,
      attempt: completionIdentity.attempt,
      phase: 'buster',
      dispatchId: completionIdentity.dispatchId,
      gatewayLabel: resolveStatusGatewayLabel(status),
      sessionKey: resolveStatusSessionKey(status),
      diagnostics: {
        metadata: { code: 'buster_test_suites_empty', test_suites: selectDefinedValue(() => (mod?.test_suites), () => (null)) },
      },
    }) };
  }

  let busterPrompt;
  {
    let promptResult;
    try {
      promptResult = deps.buildBusterModulePrompt(config, moduleId, mod, dir, status, maxFails, completionIdentity);
    } catch (e) {
      promptResult = { error: errorMessage(e), thrown: true };
    }
    if (promptResult.error) {
      log('ERROR', `Buster prompt build failed for ${moduleId}: ${promptResult.error}`);
      emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'buster', busterModel, status?.status);
      return { terminal: buildModuleErrorTerminalResult(config, moduleId, {
        reason: promptResult.error,
        runId: completionIdentity.runId,
        moduleDir: dir,
        attempt: completionIdentity.attempt,
        phase: 'buster',
        dispatchId: completionIdentity.dispatchId,
        gatewayLabel: resolveStatusGatewayLabel(status),
        sessionKey: resolveStatusSessionKey(status),
        metadata: {
          failure_class: 'buster_prompt_build_failed',
          thrown: promptResult.thrown === true,
        },
        terminalReasonCode: 'buster_prompt_build_failed',
        terminalHumanReason: `Buster prompt build failed for ${moduleId}: ${promptResult.error}`,
      }) };
    }
    busterPrompt = promptResult.prompt;
  }

  try {
    deps.savePrompt(config, dir, 'buster', status.fail_count + 1, busterPrompt);
  } catch (e) {
    const reason = `Buster prompt artifact write failed: ${errorMessage(e)}`;
    log('ERROR', `Module ${moduleId} — ${reason}`);
    emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'buster', busterModel, status?.status);
    return { terminal: buildModuleErrorTerminalResult(config, moduleId, {
      reason,
      runId: completionIdentity.runId,
      moduleDir: dir,
      attempt: completionIdentity.attempt,
      phase: 'buster',
      dispatchId: completionIdentity.dispatchId,
      gatewayLabel: resolveStatusGatewayLabel(status),
      sessionKey: resolveStatusSessionKey(status),
      metadata: { failure_class: 'buster_prompt_artifact_failed' },
      terminalReasonCode: 'buster_prompt_artifact_failed',
      terminalHumanReason: reason,
    }) };
  }

  // ── Pre-dispatch config validation ──
  // Catches obvious config issues (missing paths, bad binaries) before wasting
  // a full Buster dispatch cycle. Only checked on first buster attempt per module
  // attempt — crash retries reuse the same config.
  if (busterAttempt === 1) {
    try {
      deps.validateBusterConfig(config);
    } catch (e) {
      const reason = `Config validation failed: ${errorMessage(e)}`;
      log('ERROR', `Module ${moduleId} — ${reason}`);
      emitTerminalModuleFailTelemetry(config, moduleId, status, mod, 'buster', busterModel, status?.status);
      const configInvalidCorrelation = {
        run_id: completionIdentity.runId,
        module_id: moduleId,
        attempt: completionIdentity.attempt,
        dispatch_id: completionIdentity.dispatchId,
        gateway_label: completionIdentity.gateway_label,
        session_key: completionIdentity.sessionKey,
        model: completionIdentity.model,
        model_source: completionIdentity.model_source,
        reasoning_level: completionIdentity.reasoning_level,
        thinking_source: completionIdentity.thinking_source,
        runtime: completionIdentity.runtime,
      };
      await deps.discord(config, 'CRITICAL', `Module ${moduleId} — Config Invalid`,
        `Pre-dispatch validation caught config issues. Fix progress.json before retrying.`,
        buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, configInvalidCorrelation, [
          { name: 'Issue', value: errorMessage(e).slice(0, 200) },
        ]),
        { correlation: configInvalidCorrelation },
      );
      deps.clearShutdownContext();
      return { terminal: buildModuleNeedsNovaTerminalResult(config, moduleId, {
        reason,
        runId: completionIdentity.runId,
        moduleDir: dir,
        attempt: completionIdentity.attempt,
        phase: 'buster',
        dispatchId: completionIdentity.dispatchId,
        gatewayLabel: resolveStatusGatewayLabel(status),
        sessionKey: resolveStatusSessionKey(status),
      }) };
    }
  }

  if (completionIdentity.resumed === true) log('INFO', `Module ${moduleId}: adopting existing Buster dispatch ${completionIdentity.dispatchId} on resume`);

  deps.setShutdownContext(config, 'buster', moduleId, dir);

  const agentJudgment = buildBusterAgentJudgmentPolicy(mod);
  const agentJudgmentEnabled = agentJudgment.required === true;

  await deps.discord(config, 'INFO', `Module ${moduleId} — Buster queued`,
    agentJudgmentEnabled
      ? 'Buster work is queued. Deterministic suites run first; the Buster agent is configured to run after the suites pass.'
      : 'Buster work is queued. Deterministic suites are the final Buster authority for this module.', [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, {
        run_id: completionIdentity.runId,
        module_id: moduleId,
        attempt: completionIdentity.attempt,
        dispatch_id: completionIdentity.dispatchId,
        gateway_label: completionIdentity.gateway_label,
        session_key: completionIdentity.sessionKey,
        model: completionIdentity.model,
        model_source: completionIdentity.model_source,
        reasoning_level: completionIdentity.reasoning_level,
        thinking_source: completionIdentity.thinking_source,
        runtime: completionIdentity.runtime,
      }),
      { name: 'Phase', value: 'buster', inline: true },
      { name: 'Queued Suites', value: requestedSuites.join(', '), inline: true },
      { name: 'Agent Judgment', value: agentJudgmentEnabled ? 'enabled' : 'disabled', inline: true },
      { name: 'Authority', value: agentJudgmentEnabled ? 'Buster agent is required after deterministic suites pass' : 'Deterministic suites are final authority', inline: false },
      { name: 'Policy Reason', value: String(agentJudgment.reason), inline: false },
      { name: 'Next', value: agentJudgmentEnabled ? 'Watch for suite results, then Buster agent spawn/result.' : 'Watch for deterministic suite result.', inline: false },
    ],
    {
      correlation: {
        run_id: completionIdentity.runId,
        module_id: moduleId,
        attempt: completionIdentity.attempt,
        dispatch_id: completionIdentity.dispatchId,
        gateway_label: completionIdentity.gateway_label,
        session_key: completionIdentity.sessionKey,
      },
    });

  completionIdentity.gateway_label = null;

  const workerOutcome = await executeBusterWorkerAttempt({
    config,
    progress,
    moduleId,
    mod,
    dir,
    status,
    timeout,
    maxFails,
    deps,
    busterPrompt,
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
