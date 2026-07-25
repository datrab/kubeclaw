import { STATUS } from '../core/constants.ts';
import { selectDefinedValue } from '../optional-absence.ts';
import { buildActiveSessionAuthorityPolicy } from '../services/session-authority.ts';
import {
  pollRedisEntry,
  pollStatus,
  statusEvidenceFields,
  terminalBusterFinalStatus,
} from './module-worker-buster-status.ts';
import { buildModuleBusterWorkerControlResult } from './module-worker-control-results.ts';
import { busterControlForPollResult, resolveModuleBusterFailureClass } from './module-worker-result-policy.ts';
import { errorMessage, objectRecord, requireObjectRecord } from './module-worker-support.ts';
import type { AnyRecord } from './module-worker-support.ts';

function hasTerminalPollAuthority(runtime: AnyRecord) {
  const status = pollStatus(runtime.pollResult);
  return runtime.pollResult?.ok === true && [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED].includes(status?.status);
}

function hasPollAuthority(runtime: AnyRecord) {
  return typeof runtime.pollResult?.reason === 'string' && runtime.pollResult.reason.trim().length > 0;
}

function captureHookError(runtime: AnyRecord, error: unknown, reason: string) {
  if (runtime.hookError === null) runtime.hookError = error;
  runtime.hookFailureReason = reason;
}

function recordCleanupError(runtime: AnyRecord, phase: string, error: unknown) {
  runtime.cleanupDiagnostics.push({ phase, error: errorMessage(error) });
  if (hasTerminalPollAuthority(runtime) || hasPollAuthority(runtime)) return;
  captureHookError(runtime, error, 'cleanup_failed');
}

async function loadFinalBusterStatus(runtime: AnyRecord) {
  try {
    runtime.finalStatus = selectDefinedValue(
      () => (runtime.loadStatus(runtime.config, runtime.moduleDir, { raw: true })),
      () => (null),
    );
  } catch (error) {
    recordCleanupError(runtime, 'load_final_status', error);
  }
  const active = selectDefinedValue(() => (runtime.finalStatus?.active_agent), () => (null));
  const policy = buildActiveSessionAuthorityPolicy({
    lifecycleActiveSession: active,
    evidenceActiveSession: {
      run_id: runtime.dispatch.run_id,
      attempt: runtime.dispatch.attempt,
      dispatch_id: runtime.dispatch.dispatch_id,
      session_key: runtime.dispatch.session_key,
      gateway_label: runtime.dispatch.gateway_label,
    },
  });
  runtime.finalStreamPath = policy.identity_confirmed === true ? active?.stream_log_path ?? null : null;
  runtime.finalSessionKey = selectDefinedValue(() => (runtime.dispatch.session_key), () => (null));
}

async function finalizeBusterHook(runtime: AnyRecord) {
  if (typeof runtime.input.onFinalized !== 'function') return;
  try {
    await runtime.input.onFinalized({
      status: runtime.finalStatus,
      stream_log_path: runtime.finalStreamPath,
      session_key: runtime.finalSessionKey,
      dispatch: runtime.dispatch,
    });
    runtime.finalStatus = requireObjectRecord(
      runtime.loadStatus(runtime.config, runtime.moduleDir, { raw: true }),
      'final Buster status after finalize',
    );
  } catch (error) {
    runtime.cleanupDiagnostics.push({ phase: 'finalize_hook', error: errorMessage(error) });
    if (!hasTerminalPollAuthority(runtime)) captureHookError(runtime, error, 'finalize_hook_failed');
  }
}

export async function cleanupBuster(runtime: AnyRecord) {
  if (!runtime.resumeExistingDispatch) {
    try {
      await runtime.killAgent(runtime.config, 'buster', runtime.moduleId, runtime.pollResult?.ok === true);
    } catch (error) {
      captureHookError(runtime, error, 'cleanup_failed');
    }
  }
  await loadFinalBusterStatus(runtime);
  await finalizeBusterHook(runtime);
  try {
    await runtime.saveStreamLog(runtime.config, runtime.moduleDir, 'buster', runtime.attempt, runtime.finalStreamPath);
  } catch (error) {
    recordCleanupError(runtime, 'save_stream_log', error);
  }
  runtime.clearShutdownContext();
}

function hookFailureResult(runtime: AnyRecord, evidence: AnyRecord) {
  return buildModuleBusterWorkerControlResult(runtime.config, runtime.input, {
    nextAction: 'block',
    issueType: 'environment',
    outcomeClass: 'error',
    reason: runtime.hookFailureReason,
    failureClass: runtime.hookFailureReason,
    error: errorMessage(runtime.hookError),
    finalStatus: runtime.finalStatus,
    streamLogPath: runtime.finalStreamPath,
    dispatchId: runtime.dispatch.dispatch_id,
    gatewayLabel: runtime.dispatch.gateway_label,
    sessionKey: runtime.finalSessionKey,
    attempt: runtime.attempt,
    runId: runtime.dispatch.run_id,
    ...evidence,
  });
}

export function finalBusterResult(runtime: AnyRecord) {
  const evidence = statusEvidenceFields(runtime.pollResult);
  if (runtime.hookError) return hookFailureResult(runtime, evidence);
  const pollResult = objectRecord(runtime.pollResult);
  const failureClass = resolveModuleBusterFailureClass(pollResult);
  return buildModuleBusterWorkerControlResult(runtime.config, runtime.input, {
    ...busterControlForPollResult(pollResult, failureClass),
    reason: selectDefinedValue(() => (pollResult.reason), () => (null)),
    finalStatus: terminalBusterFinalStatus({
      finalStatus: runtime.finalStatus,
      pollStatus: pollStatus(pollResult),
      redisEntry: pollRedisEntry(pollResult),
      failureClass,
      pollReason: pollResult.reason,
    }),
    streamLogPath: runtime.finalStreamPath,
    dispatchId: runtime.dispatch.dispatch_id,
    gatewayLabel: runtime.dispatch.gateway_label,
    sessionKey: runtime.finalSessionKey,
    attempt: runtime.attempt,
    runId: runtime.dispatch.run_id,
    ...evidence,
    statusErrors: runtime.cleanupDiagnostics,
  });
}
