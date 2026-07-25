import { STATUS } from '../core/constants.ts';
import { selectDefinedValue } from '../optional-absence.ts';
import { statusEvidenceFields, pollStatus } from './module-worker-buster-status.ts';
import { buildModuleForgeWorkerControlResult } from './module-worker-control-results.ts';
import { normalizeModuleWorkerInput } from './module-worker-input.ts';
import { forgeControlForPollResult } from './module-worker-result-policy.ts';
import {
  errorMessage,
  normalizeHealthCheckResult,
  objectRecord,
  processStartupRateLimit,
  requireObjectRecord,
  requireWorkerDependency,
  retryableStartupFailure,
} from './module-worker-support.ts';
import type { AnyRecord } from './module-worker-support.ts';

const FORGE_SUCCESSFUL_KILL_POLICY = Object.freeze({
  graceMs: 10_000,
  statusTimeoutMs: 5_000,
  requestTimeoutMs: 5_000,
  stopRequestTimeoutMs: 5_000,
  listTimeoutMs: 5_000,
  acpxTimeoutMs: 5_000,
});

function createForgeRuntime(config: any, progress: any, workerInput: AnyRecord, deps: AnyRecord) {
  const input: AnyRecord = normalizeModuleWorkerInput('module_forge', workerInput);
  const backend = objectRecord(input?.worker?.backendConfig);
  const runtime: AnyRecord = {
    config,
    progress,
    input,
    moduleId: input.ids.moduleId,
    moduleDir: input.executionContext.moduleDir,
    timeoutMinutes: input.executionContext.timeoutMinutes,
    attempt: input.ids.attempt,
    runId: input.ids.runId,
    headBefore: selectDefinedValue(() => (input.executionContext.headBefore), () => (null)),
    model: backend.model,
    thinking: selectDefinedValue(() => (backend.thinking), () => (null)),
    thinkingSource: selectDefinedValue(() => (backend.thinkingSource), () => (null)),
    pollResult: null,
    finalStatus: null,
    streamPath: null,
    hookError: null,
    hookFailureReason: null,
  };
  for (const name of ['spawnAgent', 'verifyAgentHealth', 'killAgent', 'getTrackedAgent', 'acpLabel', 'pollForgeCompletionWithRateLimitRecovery', 'loadStatus', 'saveStreamLog', 'clearShutdownContext']) {
    runtime[name] = requireWorkerDependency(deps, name);
  }
  runtime.sessionLabel = runtime.acpLabel('forge', runtime.moduleId, { runId: runtime.runId, attempt: runtime.attempt });
  return runtime;
}

function forgeResult(runtime: AnyRecord, values: AnyRecord) {
  return buildModuleForgeWorkerControlResult(runtime.config, runtime.input, values);
}

async function spawnForge(runtime: AnyRecord) {
  try {
    await runtime.spawnAgent(runtime.config, runtime.progress, 'forge', runtime.moduleId, runtime.model, runtime.input.prompt, {
      thinking: runtime.thinking,
      module_id: runtime.moduleId,
      run_id: runtime.runId,
      attempt: runtime.attempt,
      trackingLabel: runtime.sessionLabel,
      thinking_source: runtime.thinkingSource,
    });
    return null;
  } catch (error: any) {
    runtime.clearShutdownContext();
    const retryable = retryableStartupFailure(error);
    return forgeResult(runtime, {
      nextAction: retryable ? 'retry' : 'block',
      issueType: 'environment',
      outcomeClass: retryable ? 'retrying' : 'error',
      reason: retryable ? 'startup_evidence_missing' : 'spawn_failed',
      error: errorMessage(error),
      gatewayLabel: selectDefinedValue(() => (error?.gateway_label), () => (null)),
      sessionKey: selectDefinedValue(() => (error?.session_key), () => (null)),
      attempt: runtime.attempt,
    });
  }
}

async function verifyForge(runtime: AnyRecord) {
  const health = normalizeHealthCheckResult(
    await runtime.verifyAgentHealth(runtime.config, 'forge', runtime.moduleId, { trackingLabel: runtime.sessionLabel }),
  );
  if (health.ok) return null;
  await runtime.killAgent(runtime.config, 'forge', runtime.moduleId, false, { trackingLabel: runtime.sessionLabel });
  runtime.clearShutdownContext();
  if (health.rateLimited || health.reason === 'rate_limited') {
    const control = await processStartupRateLimit({
      ...runtime,
      workerInput: runtime.input,
      phase: 'forge',
    }, health);
    return forgeResult(runtime, {
      ...control,
      gatewayLabel: selectDefinedValue(() => (health.gatewayLabel), () => (null)),
      sessionKey: selectDefinedValue(() => (health.sessionKey), () => (null)),
      streamLogPath: selectDefinedValue(() => (health.streamLogPath), () => (null)),
      attempt: runtime.attempt,
    });
  }
  return forgeResult(runtime, {
    nextAction: 'retry',
    issueType: 'environment',
    outcomeClass: 'retrying',
    reason: 'healthcheck_failed',
    error: 'Forge agent failed health check — session not running after spawn',
    attempt: runtime.attempt,
  });
}

function buildForgeDispatch(runtime: AnyRecord) {
  const tracked = runtime.getTrackedAgent(runtime.sessionLabel);
  runtime.streamPath = selectDefinedValue(() => (tracked?.streamLogPath), () => (null));
  return {
    label: runtime.sessionLabel,
    session_key: selectDefinedValue(() => (tracked?.sessionKey), () => (null)),
    stream_log_path: selectDefinedValue(() => (tracked?.streamLogPath), () => (null)),
    gateway_label: selectDefinedValue(() => (tracked?.gatewayLabel), () => (null)),
    dispatch_id: selectDefinedValue(() => (tracked?.telemetry_dispatch_id), () => (null)),
    run_id: runtime.runId,
    runtime: selectDefinedValue(() => (tracked?.runtime), () => (null)),
    model: runtime.model,
    agent_id: selectDefinedValue(() => (tracked?.agentId), () => (null)),
    attempt: runtime.attempt,
    phase: 'forge',
  };
}

function captureHookError(runtime: AnyRecord, error: unknown, reason: string) {
  if (runtime.hookError === null) runtime.hookError = error;
  runtime.hookFailureReason = reason;
}

async function dispatchAndPollForge(runtime: AnyRecord) {
  if (typeof runtime.input.onDispatched === 'function') {
    try {
      await runtime.input.onDispatched(runtime.dispatch);
    } catch (error) {
      captureHookError(runtime, error, 'dispatch_hook_failed');
    }
  }
  if (runtime.hookError) return;
  runtime.pollResult = await runtime.pollForgeCompletionWithRateLimitRecovery(
    runtime.config,
    runtime.moduleDir,
    runtime.timeoutMinutes,
    {
      sessionLabel: runtime.sessionLabel,
      headBefore: runtime.headBefore,
      moduleId: runtime.moduleId,
      runId: runtime.dispatch.run_id,
      attempt: runtime.attempt,
      dispatchId: runtime.dispatch.dispatch_id,
      sessionKey: runtime.dispatch.session_key,
      gatewayLabel: runtime.dispatch.gateway_label,
    },
  );
}

async function finalizeForgeHook(runtime: AnyRecord) {
  if (typeof runtime.input.onFinalized !== 'function') return;
  try {
    await runtime.input.onFinalized({
      status: runtime.finalStatus,
      stream_log_path: runtime.streamPath,
      dispatch: runtime.dispatch,
    });
    runtime.finalStatus = requireObjectRecord(
      runtime.loadStatus(runtime.config, runtime.moduleDir),
      'final Forge status after finalize',
    );
  } catch (error) {
    captureHookError(runtime, error, 'finalize_hook_failed');
  }
}

async function cleanupForge(runtime: AnyRecord) {
  try {
    runtime.streamPath = selectDefinedValue(() => (runtime.getTrackedAgent(runtime.sessionLabel)?.streamLogPath), () => (null));
    await runtime.killAgent(runtime.config, 'forge', runtime.moduleId, runtime.pollResult?.ok === true, {
      trackingLabel: runtime.sessionLabel,
      ...(runtime.pollResult?.ok ? FORGE_SUCCESSFUL_KILL_POLICY : {}),
    });
  } catch (error) {
    captureHookError(runtime, error, 'cleanup_failed');
  }
  try {
    runtime.finalStatus = selectDefinedValue(() => (runtime.loadStatus(runtime.config, runtime.moduleDir)), () => (null));
  } catch (error) {
    captureHookError(runtime, error, 'cleanup_failed');
  }
  await finalizeForgeHook(runtime);
  try {
    await runtime.saveStreamLog(runtime.config, runtime.moduleDir, 'forge', runtime.attempt, runtime.streamPath);
  } catch (error) {
    captureHookError(runtime, error, 'cleanup_failed');
  }
  runtime.clearShutdownContext();
}

function finalForgeResult(runtime: AnyRecord) {
  const evidence = statusEvidenceFields(runtime.pollResult);
  if (runtime.hookError) {
    return forgeResult(runtime, {
      nextAction: 'block',
      issueType: 'environment',
      outcomeClass: 'error',
      reason: runtime.hookFailureReason,
      error: errorMessage(runtime.hookError),
      finalStatus: runtime.finalStatus,
      streamLogPath: runtime.streamPath,
      gatewayLabel: runtime.dispatch.gateway_label,
      sessionKey: runtime.dispatch.session_key,
      attempt: runtime.attempt,
      ...evidence,
    });
  }
  const pollResult = objectRecord(runtime.pollResult);
  const status = pollStatus(pollResult);
  const terminalStatus = pollResult.ok === true && [STATUS.READY_FOR_TESTING, STATUS.BLOCKED].includes(status?.status)
    ? status
    : runtime.finalStatus;
  return forgeResult(runtime, {
    ...forgeControlForPollResult(pollResult),
    reason: selectDefinedValue(() => (pollResult.reason), () => (null)),
    finalStatus: terminalStatus,
    streamLogPath: runtime.streamPath,
    gatewayLabel: runtime.dispatch.gateway_label,
    sessionKey: runtime.dispatch.session_key,
    attempt: runtime.attempt,
    ...evidence,
  });
}

export async function runModuleForgeWorker(input: AnyRecord = {}) {
  if (!input.config) throw new Error('runModuleForgeWorker requires config');
  const runtime = createForgeRuntime(input.config, input.progress, input.workerInput || {}, input.deps || {});
  const spawnFailure = await spawnForge(runtime);
  if (spawnFailure) return spawnFailure;
  const healthFailure = await verifyForge(runtime);
  if (healthFailure) return healthFailure;
  runtime.dispatch = buildForgeDispatch(runtime);
  try {
    await dispatchAndPollForge(runtime);
  } finally {
    await cleanupForge(runtime);
  }
  return finalForgeResult(runtime);
}
