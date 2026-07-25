import { STATUS } from '../core/constants.ts';
import { selectDefinedValue } from '../optional-absence.ts';
import { cleanupBuster, finalBusterResult } from './module-worker-buster-finalization.ts';
import { buildModuleBusterWorkerControlResult } from './module-worker-control-results.ts';
import { normalizeModuleWorkerInput } from './module-worker-input.ts';
import {
  errorMessage,
  isJsonParseFailure,
  isResumedBusterDispatch,
  normalizeHealthCheckResult,
  objectRecord,
  processStartupRateLimit,
  requireNonEmptyString,
  requireWorkerDependency,
  resumedBusterDispatch,
  retryableStartupFailure,
} from './module-worker-support.ts';
import type { AnyRecord } from './module-worker-support.ts';

function createBusterRuntime(config: any, progress: any, workerInput: AnyRecord, deps: AnyRecord) {
  const input: AnyRecord = normalizeModuleWorkerInput('module_buster', workerInput);
  const backend = objectRecord(input?.worker?.backendConfig);
  const runtime: AnyRecord = {
    config,
    progress,
    input,
    backend,
    status: selectDefinedValue(() => (input.status), () => (null)),
    moduleId: input.ids.moduleId,
    moduleDir: input.executionContext.moduleDir,
    timeoutMinutes: input.executionContext.timeoutMinutes,
    runId: input.ids.runId,
    attempt: input.ids.attempt,
    dispatchId: selectDefinedValue(() => (input.ids.dispatchId), () => (null)),
    workerDispatch: null,
    dispatch: null,
    pollResult: null,
    finalStatus: null,
    finalStreamPath: null,
    finalSessionKey: null,
    hookError: null,
    hookFailureReason: null,
    cleanupDiagnostics: [],
  };
  runtime.resumeExistingDispatch = isResumedBusterDispatch(runtime.status, runtime.dispatchId);
  for (const name of ['archiveModuleCompletions', 'spawnAgent', 'verifyAgentHealth', 'killAgent', 'pollDualWithRateLimitRecovery', 'loadStatus', 'saveStreamLog', 'clearShutdownContext']) {
    runtime[name] = requireWorkerDependency(deps, name);
  }
  return runtime;
}

function busterResult(runtime: AnyRecord, values: AnyRecord) {
  return buildModuleBusterWorkerControlResult(runtime.config, runtime.input, values);
}

function archiveFailure(runtime: AnyRecord, error: unknown) {
  runtime.clearShutdownContext();
  return busterResult(runtime, {
    nextAction: 'block',
    issueType: 'environment',
    outcomeClass: 'error',
    reason: 'completion_archive_failed',
    error: errorMessage(error),
    failureClass: 'completion_archive_failed',
    dispatchId: selectDefinedValue(() => (runtime.dispatchId), () => (null)),
    attempt: runtime.attempt,
    runId: runtime.runId,
  });
}

async function archiveBusterCompletions(runtime: AnyRecord) {
  try {
    const result = await runtime.archiveModuleCompletions(runtime.config, runtime.moduleId, {
      run_id: runtime.runId,
      attempt: runtime.attempt,
      dispatch_id: runtime.dispatchId,
    }, {
      targetKind: 'module',
      module_id: runtime.moduleId,
      agent_type: 'buster',
    });
    return result?.failed ? archiveFailure(runtime, requireNonEmptyString(result.error, 'archiveResult.error')) : null;
  } catch (error) {
    return archiveFailure(runtime, error);
  }
}

function spawnOptions(runtime: AnyRecord) {
  const backend = runtime.backend;
  const thinkingSupported = selectDefinedValue(() => (backend.thinkingSupported), () => (null));
  const thinking = selectDefinedValue(() => (backend.thinking), () => (null));
  return {
    status: runtime.status,
    taskType: 'module_test',
    cwd: selectDefinedValue(() => (runtime.input?.workspace?.repoRoot), () => (runtime.config.repo_root)),
    run_id: runtime.runId,
    attempt: runtime.attempt,
    dispatch_id: runtime.dispatchId,
    model_source: selectDefinedValue(() => (backend.modelSource), () => (null)),
    thinking,
    thinking_source: selectDefinedValue(() => (backend.thinkingSource), () => (null)),
    thinking_supported: thinkingSupported,
    reasoning_level: thinkingSupported === false ? 'not supported' : thinking,
    runtime_kind: selectDefinedValue(() => (backend.runtimeKind), () => (null)),
  };
}

async function spawnBuster(runtime: AnyRecord) {
  try {
    runtime.workerDispatch = await runtime.spawnAgent(
      runtime.config,
      runtime.progress,
      'buster',
      runtime.moduleId,
      runtime.backend.model,
      runtime.input.prompt,
      spawnOptions(runtime),
    );
    return null;
  } catch (error: any) {
    runtime.clearShutdownContext();
    const retryable = retryableStartupFailure(error);
    return busterResult(runtime, {
      nextAction: retryable ? 'retry' : 'block',
      issueType: 'environment',
      outcomeClass: retryable ? 'retrying' : 'error',
      reason: retryable ? 'startup_evidence_missing' : 'spawn_failed',
      failureClass: retryable ? 'healthcheck_failed' : 'spawn_failed',
      error: errorMessage(error),
      dispatchId: selectDefinedValue(() => (runtime.dispatchId), () => (null)),
      gatewayLabel: selectDefinedValue(() => (error?.gateway_label), () => (null)),
      sessionKey: selectDefinedValue(() => (error?.session_key), () => (null)),
      attempt: runtime.attempt,
      runId: runtime.runId,
    });
  }
}

async function prepareBuster(runtime: AnyRecord) {
  if (runtime.resumeExistingDispatch) return null;
  const archiveError = await archiveBusterCompletions(runtime);
  if (archiveError) return archiveError;
  return spawnBuster(runtime);
}

function buildBusterDispatch(runtime: AnyRecord) {
  if (runtime.resumeExistingDispatch) {
    return resumedBusterDispatch(runtime.status, runtime.input, runtime.runId, runtime.attempt, runtime.dispatchId);
  }
  const worker = objectRecord(runtime.workerDispatch);
  return {
    label: selectDefinedValue(() => (worker.dispatch_id), () => (null)),
    session_key: selectDefinedValue(() => (worker.session_key), () => (null)),
    stream_log_path: selectDefinedValue(() => (worker.stream_log_path), () => (null)),
    gateway_label: selectDefinedValue(() => (worker.gateway_label), () => (null)),
    dispatch_id: selectDefinedValue(() => (worker.dispatch_id), () => (null)),
    run_id: runtime.runId,
    attempt: runtime.attempt,
    runtime: selectDefinedValue(() => (worker.runtime), () => (null)),
    model: selectDefinedValue(() => (worker.model), () => (null)),
    model_source: selectDefinedValue(() => (worker.model_source), () => (null)),
    reasoning_level: selectDefinedValue(() => (worker.reasoning_level), () => (null)),
    thinking_source: selectDefinedValue(() => (worker.thinking_source), () => (null)),
    agent_id: null,
    phase: 'buster',
  };
}

async function verifyBuster(runtime: AnyRecord) {
  const health = runtime.resumeExistingDispatch
    ? { ok: true }
    : normalizeHealthCheckResult(await runtime.verifyAgentHealth(runtime.config, 'buster', runtime.moduleId));
  if (health.ok) return null;
  await runtime.killAgent(runtime.config, 'buster', runtime.moduleId, false);
  runtime.clearShutdownContext();
  if (health.rateLimited || health.reason === 'rate_limited') {
    const control = await processStartupRateLimit({
      ...runtime,
      workerInput: runtime.input,
      phase: 'buster',
      dispatchId: runtime.dispatch.dispatch_id,
      runId: runtime.dispatch.run_id,
    }, health);
    return busterResult(runtime, {
      ...control,
      dispatchId: runtime.dispatch.dispatch_id,
      gatewayLabel: selectDefinedValue(() => (health.gatewayLabel), () => (null)),
      sessionKey: selectDefinedValue(() => (health.sessionKey), () => (null)),
      streamLogPath: selectDefinedValue(() => (health.streamLogPath), () => (null)),
      attempt: runtime.attempt,
      runId: runtime.dispatch.run_id,
    });
  }
  return busterResult(runtime, {
    nextAction: 'retry',
    issueType: 'environment',
    outcomeClass: 'retrying',
    reason: 'healthcheck_failed',
    failureClass: 'healthcheck_failed',
    error: 'Buster agent failed health check — session not running after spawn',
    dispatchId: runtime.dispatch.dispatch_id,
    gatewayLabel: runtime.dispatch.gateway_label,
    sessionKey: runtime.dispatch.session_key,
    streamLogPath: runtime.dispatch.stream_log_path,
    attempt: runtime.attempt,
    runId: runtime.dispatch.run_id,
  });
}

function captureHookError(runtime: AnyRecord, error: unknown, reason: string) {
  if (runtime.hookError === null) runtime.hookError = error;
  runtime.hookFailureReason = reason;
}

async function pollBuster(runtime: AnyRecord) {
  if (!runtime.resumeExistingDispatch && typeof runtime.input.onDispatched === 'function') {
    try {
      await runtime.input.onDispatched(runtime.dispatch);
    } catch (error) {
      captureHookError(runtime, error, 'dispatch_hook_failed');
    }
  }
  if (runtime.hookError) return;
  try {
    runtime.pollResult = await runtime.pollDualWithRateLimitRecovery(
      runtime.config,
      runtime.moduleDir,
      runtime.moduleId,
      [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED],
      runtime.timeoutMinutes,
      {
        run_id: runtime.dispatch.run_id,
        attempt: runtime.attempt,
        dispatch_id: runtime.dispatch.dispatch_id,
        session_key: runtime.dispatch.session_key,
        gateway_label: runtime.dispatch.gateway_label,
      },
    );
  } catch (error) {
    const failureClass = isJsonParseFailure(error) ? 'parse_corrupted' : 'completion_event_adapter_failed';
    runtime.pollResult = {
      ok: false,
      reason: failureClass,
      status: {
        module_id: runtime.moduleId,
        status: STATUS.FAIL,
        failure_class: failureClass,
        error: errorMessage(error),
        _source: 'module_buster_poll',
      },
      failure_class: failureClass,
      error,
    };
  }
}

export async function runModuleBusterWorker(input: AnyRecord = {}) {
  if (!input.config) throw new Error('runModuleBusterWorker requires config');
  const runtime = createBusterRuntime(input.config, input.progress, input.workerInput || {}, input.deps || {});
  const preparationFailure = await prepareBuster(runtime);
  if (preparationFailure) return preparationFailure;
  runtime.dispatch = buildBusterDispatch(runtime);
  const healthFailure = await verifyBuster(runtime);
  if (healthFailure) return healthFailure;
  try {
    await pollBuster(runtime);
  } finally {
    await cleanupBuster(runtime);
  }
  return finalBusterResult(runtime);
}
