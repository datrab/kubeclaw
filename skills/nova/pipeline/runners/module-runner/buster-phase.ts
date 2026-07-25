import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
// runners/module-runner/buster-phase.ts — Buster phase execution for module runner

import { STATUS } from '../../core/constants.ts';
import { log } from '../../core/logger.ts';
import { shouldApplyRedisCompletionToStatus } from '../../services/completion-adjudicator.ts';
import { onPhaseStarted } from '../../services/telemetry.ts';
import {
  _telemetryCtx,
  computeElapsedSeconds,
  getAttemptStartedAt,
  getModuleStats,
  setLogScope,
} from '../module-runner-shared.ts';
import { handleBusterSpawnFailure } from './buster-phase/spawn-failure.ts';
import { handleFailedPollResult } from './buster-phase/poll-failure.ts';
import { handleBusterFailOrBlockedStatus } from './buster-phase/terminal-failure.ts';
import { executeBusterAttemptDispatch } from './buster-phase/dispatch.ts';
import { getBusterRuntimeConfig, getPipelineDefaultsConfig } from '../../services/runtime-defaults.ts';
import { buildModuleErrorTerminalResult, buildModulePassTerminalResult } from './terminal-results.ts';
import {
  isBusterPhaseActive, mergeWorkerStatus, nonEmptyString, normalizedStatusText, resolveBusterSessionKey,
  startupRateLimitPauseCountAuthority, statusAfterWorkerDispatch,
  statusAfterPollFailure, statusAfterTerminalFailure,
} from './buster-phase-state.ts';
import {
  isRetryableWorkerStartupReason as isRetryableStartupWorkerReason,
  workerControlMetadata as workerMetadata,
  workerControlOutcomeClass as workerOutcomeClass,
  workerControlSummary as workerSummary,
} from '../../services/contracts/worker-control-accessors.ts';

type AnyRecord = Record<string, any>;

const REDIS_COMPLETION_SOURCE = 'redis';

function moduleTerminalResult(result: AnyRecord): AnyRecord {
  let current = result;
  while (current?.terminal && current?.result === undefined) current = current.terminal;
  if (current?.retry !== undefined) return current;
  const terminal = current?.result ?? current;
  if (terminal?.nextAction && terminal?.outcome) return { retry: false, result: terminal };
  return current;
}

function finalizeBusterPassCompletion({
  config,
  moduleId,
  dir,
  status,
  deps,
  completionIdentity,
  completionSessionKey,
  persistStatus = true,
}: AnyRecord = {}) {
  const passCompletedAt = new Date().toISOString();
  if (persistStatus) {
    deps.applyModuleCompletion(config, dir, status, {
      target_kind: 'module',
      target_id: moduleId,
      phase: 'buster',
      attempt: completionIdentity.attempt,
      status: 'PASS',
      authority: {
        kind: completionIdentity.dispatchId ? 'redis' : 'worker',
        dispatch_id: selectDefinedValue(() => (completionIdentity.dispatchId), () => (null)),
      },
      summary: selectDefinedValue(() => (status.completion_summary), () => ('Buster checks PASS')),
      occurred_at: passCompletedAt,
      observed: {
        session_key: selectDefinedValue(() => (completionSessionKey), () => (null)),
        gateway_label: selectDefinedValue(() => (completionIdentity.gateway_label), () => (null)),
      },
    });
  }

  if (!status.cost) status.cost = {};
  if (status.started_at) {
    status.cost.total_duration_seconds = computeElapsedSeconds(status.started_at, status.completed_at);
  }
  status.cost.attempt_duration_seconds = computeElapsedSeconds(getAttemptStartedAt(status), status.completed_at);
  deps.saveStatus(config, dir, status);

  log('OK', `Module ${moduleId} implementation checks PASS`);
  setLogScope(null, null);
  getModuleStats(config).modules_completed.push(moduleId);

  return buildModulePassTerminalResult(config, moduleId, {
    runId: selectDefinedValue(() => (completionIdentity.runId), () => (null)),
    moduleDir: dir,
    attempt: completionIdentity.attempt,
    phase: 'buster',
    dispatchId: selectDefinedValue(() => (completionIdentity.dispatchId), () => (null)),
    gatewayLabel: selectDefinedValue(() => (completionIdentity.gateway_label), () => (null)),
    sessionKey: completionSessionKey,
  });
}

function resolveBusterFinalStatus(status: AnyRecord, control: AnyRecord, metadata: AnyRecord, redisEntry: AnyRecord | null) {
  const typedPass = control?.nextAction === 'pass' && workerOutcomeClass(control) === 'passed'
    ? { ...status, status: STATUS.PASS, completion_summary: workerSummary(control) ?? null }
    : null;
  if (metadata.final_status) return mergeWorkerStatus(status, metadata.final_status);
  if (typedPass) return typedPass;
  const redisStatus = normalizedStatusText(redisEntry?.status);
  if (![STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(redisStatus)) return null;
  return { ...status, status: redisStatus, completion_summary: redisEntry?.summary ?? status.completion_summary };
}

function busterWorkerStartupDecision(metadata: AnyRecord, currentPauses: number, retryCount: number, retryBudget: number) {
  const reason = nonEmptyString(metadata.reason)?.toLowerCase() ?? null;
  if (reason === 'rate_limited') {
    return { retry: true, reason, retryCount, pauses: startupRateLimitPauseCountAuthority(metadata, currentPauses) };
  }
  if (isRetryableStartupWorkerReason(reason) && retryCount < retryBudget) {
    return { retry: true, reason, retryCount: retryCount + 1, pauses: currentPauses };
  }
  return { retry: false, reason, retryCount: 0, pauses: currentPauses };
}

function logRedisBusterAdjudication(status: AnyRecord, adjudication: AnyRecord) {
  const drift = Array.isArray(adjudication.adjudication?.drift) ? adjudication.adjudication.drift : [];
  const driftCodes = drift.map((entry: AnyRecord) => entry.code).join(', ') || 'none';
  const hasDrift = adjudication.adjudication?.drift_detected === true;
  log(hasDrift ? 'WARN' : 'INFO', hasDrift
    ? `Lifecycle state shows '${status.status}' but Redis says '${adjudication.status}' — applying shared completion adjudication (drift=${driftCodes})`
    : `Buster phase completed '${adjudication.status}' from Redis while module lifecycle was '${status.status}' — advancing module phase state`);
}

function redisBusterCompletionInput(context: AnyRecord, adjudication: AnyRecord) {
  const { moduleId, redisEntry, completionIdentity, completionSessionKey } = context;
  const source = redisEntry.source ?? REDIS_COMPLETION_SOURCE;
  return {
    target_kind: 'module', target_id: moduleId, phase: 'buster', attempt: completionIdentity.attempt,
    status: adjudication.status,
    authority: { kind: 'redis', dispatch_id: completionIdentity.dispatchId ?? redisEntry.dispatch_id, key: redisEntry.completion_key ?? null, source },
    reason_code: redisEntry.reason ?? null,
    summary: redisEntry.summary ?? `Trusted terminal status from Redis completion (${source})`,
    occurred_at: new Date().toISOString(),
    observed: { session_key: completionSessionKey, gateway_label: completionIdentity.gateway_label ?? redisEntry.gateway_label },
  };
}

function applyRedisBusterPass(context: AnyRecord): boolean {
  const { config, moduleId, dir, status, deps, redisEntry, completionIdentity, completionSessionKey } = context;
  if (!redisEntry?.status) return false;
  const adjudication = shouldApplyRedisCompletionToStatus({
    moduleId,
    expectedStatuses: [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED],
    expectedIdentity: {
      run_id: completionIdentity.runId,
      attempt: completionIdentity.attempt,
      dispatch_id: completionIdentity.dispatchId,
      session_key: completionSessionKey,
    },
    redisEntry,
    status,
  });
  if (!adjudication.shouldApply || adjudication.status !== STATUS.PASS) return false;
  logRedisBusterAdjudication(status, adjudication);
  deps.applyModuleCompletion(config, dir, status, redisBusterCompletionInput(context, adjudication));
  return true;
}

function buildMissingBusterEvidenceTerminal(context: AnyRecord) {
  const { config, moduleId, dir, status, deps, completionIdentity, completionSessionKey, metadata, control } = context;
  const reason = `Buster phase did not produce terminal completion evidence (${normalizedStatusText(status.status) || 'missing_status'})`;
  log('ERROR', `Module ${moduleId}: ${reason}`);
  deps.applyModuleCompletion(config, dir, status, {
    target_kind: 'module', target_id: moduleId, phase: 'buster', attempt: completionIdentity.attempt, status: 'ERROR',
    authority: { kind: 'worker', dispatch_id: completionIdentity.dispatchId ?? null },
    reason_code: 'buster_terminal_completion_missing', summary: reason,
    observed: { session_key: completionSessionKey, gateway_label: completionIdentity.gateway_label ?? null },
  });
  return buildModuleErrorTerminalResult(config, moduleId, {
    reason, runId: completionIdentity.runId, moduleDir: dir, attempt: completionIdentity.attempt, phase: 'buster',
    dispatchId: completionIdentity.dispatchId, gatewayLabel: completionIdentity.gateway_label ?? null,
    sessionKey: completionSessionKey, terminalReasonCode: 'buster_terminal_completion_missing',
    terminalHumanReason: reason, terminalSource: 'module:buster_completion',
    metadata: { failure_class: 'buster_terminal_completion_missing', worker_reason: metadata.reason ?? null, worker_next_action: control?.nextAction ?? null },
  });
}

async function resolveCompletedBusterAttempt(context: AnyRecord) {
  let { status } = context;
  const { config, moduleId, dir, deps, completionIdentity, completionSessionKey } = context;
  const persisted = applyRedisBusterPass({ ...context, status });
  if (status.status === STATUS.PASS) {
    return { terminal: finalizeBusterPassCompletion({ config, moduleId, dir, status, deps, completionIdentity, completionSessionKey, persistStatus: !persisted }), status };
  }
  if ([STATUS.FAIL, STATUS.BLOCKED].includes(status.status)) {
    const failure: AnyRecord = await handleBusterFailOrBlockedStatus({ ...context, status });
    status = statusAfterTerminalFailure(status, failure);
    return { ...failure, status, terminal: failure.retry ? null : moduleTerminalResult(failure.terminal) };
  }
  return { status, terminal: buildMissingBusterEvidenceTerminal({ ...context, status }) };
}

async function resolveBusterDispatchOutcome(context: AnyRecord) {
  let { status } = context;
  const { dispatchResult, metadata, completionIdentity, workerOutcome, isLastBusterAttempt } = context;
  const { busterWorkerControlResult, busterSessionKey } = workerOutcome;
  completionIdentity.sessionKey = resolveBusterSessionKey(metadata, busterSessionKey);
  const finalStatus = resolveBusterFinalStatus(status, busterWorkerControlResult, metadata, metadata.redis_entry ?? null);
  const finalState = normalizedStatusText(finalStatus?.status);
  const redisState = normalizedStatusText(metadata.redis_entry?.status);
  if (![finalState, redisState].some((candidate) => [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(candidate))) {
    const pollFailure: AnyRecord = await handleFailedPollResult({ ...context, status, redisEntry: metadata.redis_entry ?? null, busterSessionKey, busterWorkerControlResult, isLastBusterAttempt });
    status = statusAfterPollFailure(status, pollFailure);
    if (pollFailure.retry) return { retry: true, status };
    if (!pollFailure.terminal) throw new Error('Buster poll failure requires a terminal result');
    return { retry: false, status, terminal: moduleTerminalResult(pollFailure.terminal) };
  }
  status = finalStatus ?? status;
  return resolveCompletedBusterAttempt({ ...context, dispatchResult, status, redisEntry: metadata.redis_entry ?? null, completionSessionKey: completionIdentity.sessionKey, control: busterWorkerControlResult });
}

async function runBusterAttempt(context: AnyRecord, counters: AnyRecord) {
  let { status } = context;
  const dispatchResult: AnyRecord = await executeBusterAttemptDispatch({
    ...context,
    startupRateLimitPauseCount: counters.pauses,
  });
  if (dispatchResult.terminal) return { ...counters, status, terminal: moduleTerminalResult(dispatchResult.terminal) };
  const { completionIdentity, workerOutcome } = dispatchResult;
  status = statusAfterWorkerDispatch(status, dispatchResult.status);
  if (workerOutcome?.terminal) return { ...counters, status, terminal: moduleTerminalResult(workerOutcome.terminal) };
  const metadata = workerMetadata(workerOutcome.busterWorkerControlResult);
  const startup = busterWorkerStartupDecision(metadata, counters.pauses, counters.retryCount, counters.retryBudget);
  if (startup.retry) return { status, retry: true, retryReason: startup.reason, retryCount: startup.retryCount, pauses: startup.pauses };
  completionIdentity.dispatchId = metadata.dispatch_id ?? null;
  completionIdentity.gateway_label = metadata.gateway_label ?? null;
  if (metadata.reason === 'spawn_failed') {
    const terminal = await handleBusterSpawnFailure({
      config: context.config, moduleId: context.moduleId, status, mod: context.mod,
      maxFails: context.maxFails, busterWorkerControlResult: workerOutcome.busterWorkerControlResult,
      completionIdentity, busterModel: context.busterModel,
    });
    return { status, terminal, retryCount: 0, pauses: startup.pauses };
  }
  const resolved: AnyRecord = await resolveBusterDispatchOutcome({
    ...context, status, dispatchResult, completionIdentity, workerOutcome, metadata,
    isLastBusterAttempt: context.busterAttempt > context.maxBusterCrashRetries,
  });
  return { ...resolved, retryCount: 0, pauses: startup.pauses };
}

export async function runModuleBusterPhase(context: AnyRecord = {}) {
  let { status } = context;
  const { config, progress, moduleId, mod, deps } = context;
  if (!isBusterPhaseActive(status)) return { status };
  setLogScope(moduleId, 'buster');
  const busterPolicy = deps.resolvePolicy(config, progress, 'buster', {
    scopeModel: mod.buster_model ?? null,
    dispatchPath: config?.agents?.buster?.dispatch,
  });
  const busterModel = busterPolicy.model;
  log('STEP', `Phase: BUSTER (model: ${busterModel ?? 'model_not_configured'}, thinking: ${busterPolicy.thinking ?? 'thinking_not_configured'}, thinking_source: ${busterPolicy.thinking_source}, model_source: ${busterPolicy.model_source})`);
  deps.logEffectivePolicy(config, { scope: 'module_buster', agent: 'buster', moduleId, ...busterPolicy });
  getModuleStats(config).total_buster_attempts++;
  onPhaseStarted(_telemetryCtx(config), moduleId, 'buster', busterModel);
  const maxBusterCrashRetries = getBusterRuntimeConfig(config).max_crash_retries;
  const startupRetryBudget = getPipelineDefaultsConfig(config).agent_startup_retry_budget;
  let counters = { retryCount: 0, pauses: 0, retryBudget: startupRetryBudget };
  for (let busterAttempt = 1; busterAttempt <= maxBusterCrashRetries + 1; busterAttempt++) {
    const result: AnyRecord = await runBusterAttempt({ ...context, status, busterModel, busterPolicy, maxBusterCrashRetries, busterAttempt }, counters);
    status = result.status ?? status;
    counters = { retryCount: Number(result.retryCount), pauses: Number(result.pauses), retryBudget: startupRetryBudget };
    if (result.retry) {
      log('WARN', result.retryReason === 'rate_limited'
        ? `Module ${moduleId}: Buster startup rate limited — retrying after cooldown pause ${counters.pauses}`
        : `Module ${moduleId}: Buster startup failed (${result.retryReason}) — retrying agent startup ${counters.retryCount}/${startupRetryBudget}`);
      busterAttempt -= 1;
      continue;
    }
    if (result.terminal) return moduleTerminalResult(result.terminal);
  }
  return { status };
}
