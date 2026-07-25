import { log } from '../core/logger.ts';
import { output } from '../core/runtime.ts';
import { STATUS } from '../core/constants.ts';
import { projectPipelineGateState, loadAuthoritativeModuleState } from './pipeline-runner-shared.ts';
import {
  PIPELINE_RUN_CONCURRENCY_LIMIT,
  acquirePipelineRunLock,
  releasePipelineRunLock,
  reconcileStaleModuleState,
  reconcileStaleGateSessions,
} from './pipeline-runner-recovery.ts';
import { getPipelineRunnerDeps } from './pipeline-runner-deps.ts';
import { startAgentObservabilityIngester } from '../services/agent-observability-runtime.ts';
import { createOpenClawAgentObserverPluginController } from '../services/openclaw-plugin-runtime.ts';
import {
  startPipelineRun,
  runSingleModulePipeline,
  preparePipelineStart,
} from './pipeline-runner-start.ts';
import { finalizeTerminalHalt } from './pipeline-runner-terminal.ts';
import { runPipelineLoop } from './pipeline-runner-loop.ts';
import {
  buildPipelineStepResult,
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  PIPELINE_STEP_TYPES,
} from '../services/contracts/pipeline-step-result.ts';
import {
  PIPELINE_TERMINAL_ACTIONS,
  PIPELINE_TERMINAL_SCOPES,
} from '../services/contracts/terminal-decision.ts';
import { emitPipelineCheckpoint } from '../services/pipeline-checkpoint.ts';
import { startCommandRuntime } from '../services/command-runtime.ts';
import { appendStructuredEvent } from '../services/observability.ts';
import { emitTelemetryStreamEvent } from '../services/telemetry-stream.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
function positiveNumber(value: any, label: any) {
  const num = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(num)), () => (num < 0))) throw new Error(`${label}: required non-negative number in swarm.config.json`);
  return num;
}

function pipelineRunAbortSettleMs(config: any) {
  return positiveNumber(config?.locks?.pipeline_run?.abort_settle_ms, 'config.locks.pipeline_run.abort_settle_ms');
}

const PIPELINE_RUNTIME_ERROR = 'PIPELINE_RUNTIME_ERROR';
const PIPELINE_RUN_LOCK_LOST = 'pipeline_run_lock_lost';
const PIPELINE_NOT_INITIALIZED = 'NOT_INITIALIZED';

async function waitForInFlightPipelineSteps(inFlightSteps: any, timeoutMs: any) {
  if (!inFlightSteps?.size) return;
  const settled = Promise.allSettled([...inFlightSteps]);
  if (timeoutMs === 0) {
    await settled;
    return;
  }
  await Promise.race([
    settled,
    new Promise((resolve: any) => setTimeout(resolve, timeoutMs)),
  ]);
}

function abortReason(signal: any) {
  return signal?.reason instanceof Error ? signal.reason.message : String(selectDefinedValue(() => (signal?.reason), () => (PIPELINE_RUN_LOCK_LOST)));
}

function errorMessage(error: any) {
  return error instanceof Error ? error.message : String(error);
}

function runtimeErrorCode(error: any) {
  return selectDefinedValue(() => (selectDefinedValue(() => (error?.code), () => (error?.name))), () => (PIPELINE_RUNTIME_ERROR));
}

function runtimeErrorResult(config: any, error: any) {
  const code = runtimeErrorCode(error);
  const message = errorMessage(error);
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.PIPELINE,
    stepId: 'runtime_config',
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: PIPELINE_STEP_OUTCOMES.ERROR,
    issueType: 'environment',
    reason: message,
    diagnostics: {
      summary: message,
      metadata: {
        error_code: code,
        error_name: selectTruthyValue(() => (error?.name), () => (null)),
      },
    },
    correlation: {
      run_id: selectDefinedValue(() => (selectDefinedValue(() => (config?._runId), () => (config?.run_id))), () => (null)),
    },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP,
    terminalScope: PIPELINE_TERMINAL_SCOPES.PIPELINE,
    terminalReasonCode: code,
    terminalHumanReason: message,
    terminalSource: 'pipeline:runtime_config',
  });
}

async function abortablePipelineRunPromise(promise: any, signal: any) {
  if (selectTruthyValue(() => (!signal), () => (typeof signal.addEventListener !== 'function'))) return promise;
  if (signal.aborted) throw new Error(`Pipeline runtime lock lost: ${abortReason(signal)}`);

  let removeAbortListener: () => void = () => {};
  const aborted = new Promise((_resolve: any, reject: any) => {
    const onAbort = () => reject(new Error(`Pipeline runtime lock lost: ${abortReason(signal)}`));
    signal.addEventListener('abort', onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', onAbort);
  });

  try {
    return await Promise.race([promise, aborted]);
  } finally {
    removeAbortListener();
  }
}

export async function runPipeline(config: any, progress: any, opts: any = {}) {
  installCanonicalEvidenceEmitter(config);
  const inFlightSteps = new Set();
  const lockAbortController = typeof AbortController === 'function' ? new AbortController() : null;
  const stepAbortController = typeof AbortController === 'function' ? new AbortController() : null;
  const forwardExternalAbort = () => {
    if (stepAbortController && !stepAbortController.signal.aborted) {
      stepAbortController.abort(opts.signal.reason);
    }
  };
  if (opts.signal?.aborted) forwardExternalAbort();
  opts.signal?.addEventListener?.('abort', forwardExternalAbort, { once: true });
  const runLock = acquirePipelineRunLock(config, {
    ...opts,
    onPipelineRunLockLost(reason: any) {
      opts.onPipelineRunLockLost?.(reason);
      if (lockAbortController && !lockAbortController.signal.aborted) {
        lockAbortController.abort(reason);
      }
      if (stepAbortController && !stepAbortController.signal.aborted) {
        stepAbortController.abort(reason);
      }
    },
  });
  const runOpts = {
    ...opts,
    assertPipelineRunLockActive: () => runLock.heartbeat?.assertActive?.(),
    pipelineRunLockSignal: selectDefinedValue(() => (lockAbortController?.signal), () => (null)),
    signal: selectDefinedValue(() => (selectDefinedValue(() => (stepAbortController?.signal), () => (opts.signal))), () => (null)),
    trackPipelineStep(promise: any) {
      if (selectTruthyValue(() => (!promise), () => (typeof promise.finally !== 'function'))) return;
      inFlightSteps.add(promise);
      promise.finally(() => inFlightSteps.delete(promise)).catch(() => {});
      opts.trackPipelineStep?.(promise);
    },
  };
  const runtime: any = { observer: null, ingester: null, commands: null };
  let runError = null;
  try {
    await startPipelineRuntime({ config, progress, runOpts, runtime, stepAbortController });
    return await executePipelineRun(config, progress, runOpts);
  } catch (error: any) {
    runError = error;
    return finalizePipelineRuntimeError(config, progress, runOpts, error);
  } finally {
    const cleanupError = await cleanupPipelineRuntime({ config, opts, runOpts, runtime, inFlightSteps, forwardExternalAbort, runLock, runError });
    emitPipelineCheckpoint(config, 'during_cleanup', {
      step_type: 'pipeline',
      step_id: 'runner_cleanup',
    });
    if (cleanupError && !runError) throw cleanupError;
  }
}

async function finalizePipelineRuntimeError(config: any, progress: any, runOpts: any, error: any) {
  try {
    return await finalizeTerminalHalt(config, progress, { stepType: 'pipeline', stepId: 'runtime_config', result: runtimeErrorResult(config, error), opts: runOpts, summaryReason: runtimeErrorCode(error), scheduleProjectSummaryOnBlocked: false });
  } catch (_terminalError: any) {
    throw error;
  }
}

function installCanonicalEvidenceEmitter(config: any) {
  config._emitCanonicalEvidence = (eventType: any, record: any, options: any = {}) => {
    const payload = { ...record, ...(record?.correlation ?? {}) };
    for (const key of ['schema_version', 'published_at', 'correlation', 'producer', 'project', 'run_id', 'source', 'work_id', 'work_type']) delete payload[key];
    const authorityClass = options.authorityClass ?? 'pipeline_authority';
    const producer = record?.producer ?? 'nova/pipeline';
    const disk = appendStructuredEvent(config, eventType, { ...payload, source_event_id: options.sourceEventId, authority_class: authorityClass, source: 'pipeline', producer });
    void emitTelemetryStreamEvent(config, eventType, payload, { sourceEventId: options.sourceEventId, authorityClass, source: 'pipeline', emitter: producer });
    return disk;
  };
}

async function startPipelineRuntime({ config, progress, runOpts, runtime, stepAbortController }: any) {
  runtime.observer = createOpenClawAgentObserverPluginController(config);
  await runtime.observer.start();
  runOpts.assertPipelineRunLockActive();
  await startPipelineRun(config, progress, runOpts);
  await getPipelineRunnerDeps(config, runOpts.deps).preflightRuntimeRedis(config);
  runtime.commands = startCommandRuntime(config, progress, { abort: (reason: any) => {
    if (stepAbortController && !stepAbortController.signal.aborted) stepAbortController.abort(reason);
  } });
  runOpts.awaitCommandPermission = () => runtime.commands.awaitPermission();
  runtime.ingester = startAgentObservabilityIngester(config, { runId: config._runId ?? null, project: config.project ?? null });
  await reconcileStaleModuleState(config, progress);
  await reconcileStaleGateSessions(config, progress);
}

async function executePipelineRun(config: any, progress: any, runOpts: any) {
  runOpts.assertPipelineRunLockActive();
  if (runOpts.module) {
    const singleModuleRun = runSingleModulePipeline(config, progress, runOpts);
    runOpts.trackPipelineStep(singleModuleRun);
    return abortablePipelineRunPromise(singleModuleRun, runOpts.pipelineRunLockSignal);
  }
  const startExitCode = await preparePipelineStart(config, progress, runOpts);
  if (startExitCode != null) return startExitCode;
  return runPipelineLoop(config, progress, runOpts);
}

async function cleanupPipelineRuntime(input: any) {
  const { config, opts, runOpts, runtime, inFlightSteps, forwardExternalAbort, runLock, runError } = input;
  let cleanupError = null;
  try {
    opts.signal?.removeEventListener?.('abort', forwardExternalAbort);
    await settleAbortedPipelineSteps(config, opts, runOpts, inFlightSteps);
    if (runtime.ingester) await runtime.ingester.stop();
    if (runtime.commands) await runtime.commands.stop();
    if (runtime.observer) await runtime.observer.stop();
  } catch (error: any) {
    cleanupError = error;
    if (runError) log('WARN', `Pipeline observer cleanup failed after run error: ${errorMessage(error)}`);
  } finally {
    releasePipelineRunLock(runLock);
  }
  return cleanupError;
}

async function settleAbortedPipelineSteps(config: any, opts: any, runOpts: any, inFlightSteps: Set<any>) {
  if (!runOpts.pipelineRunLockSignal?.aborted || inFlightSteps.size === 0) return;
  const settleMs = opts.pipelineRunLockAbortSettleMs == null ? pipelineRunAbortSettleMs(config) : positiveNumber(opts.pipelineRunLockAbortSettleMs, 'opts.pipelineRunLockAbortSettleMs');
  await waitForInFlightPipelineSteps(inFlightSteps, settleMs);
  if (inFlightSteps.size > 0) log('ERROR', `Pipeline run lock lost with ${inFlightSteps.size} in-flight step(s) still unsettled after abort grace period`);
}

export function printStatus(config: any, progress: any) {
  const deps = getPipelineRunnerDeps(config);
  const overview: any = { project: config.project, timestamp: new Date().toISOString(), modules: {}, gates: {} };
  for (const [id, mod] of Object.entries(progress.modules as Record<string, any>)) {
    const projected = loadAuthoritativeModuleState(config, progress, id);
    overview.modules[id] = {
      title: mod.title,
      status: selectDefinedValue(() => (projected?.status), () => (PIPELINE_NOT_INITIALIZED)),
      fail_count: selectDefinedValue(() => (projected?.fail_count), () => (0)),
      current_phase: selectTruthyValue(() => (projected?.current_phase), () => (null)),
      duration_min: projected?.cost?.total_duration_seconds ? Math.round(projected.cost.total_duration_seconds / 60) : 0,
    };
  }
  for (const [id, gate] of Object.entries(progress.gates as Record<string, any>)) {
    const gateProjection = projectPipelineGateState(config, id, gate, deps);
    overview.gates[id] = { title: gate.title, completed: gateProjection?.completed === true };
  }
  output(overview);
}

export function dryRun(config: any, progress: any) {
  const deps = getPipelineRunnerDeps(config);
  log('INFO', 'DRY RUN — no agents will be spawned\n');
  for (const stepId of progress.execution_order) {
    if (stepId.startsWith('validator:')) {
      log('STEP', `[VALIDATOR] ${stepId} | registry-owned validator stage`);
      continue;
    }
    if (stepId.startsWith('gate:')) {
      const gateId = stepId.replace('gate:', '');
      const gate = progress.gates[gateId];
      const gateProjection = projectPipelineGateState(config, gateId, gate, deps);
      log('STEP', `[GATE] ${gate.title} | type=${gate.type} model=${gate.model} | ${gateProjection?.completed ? 'DONE' : 'PENDING'}`);
    } else {
      const mod = progress.modules[stepId];
      if (!mod) continue;
      const projected = loadAuthoritativeModuleState(config, progress, stepId);
      log('STEP', `[${stepId}] ${mod.title} | ${selectDefinedValue(() => (projected?.status), () => (STATUS.PENDING))} | model=${selectDefinedValue(() => (mod.forge_model), () => ('model_not_configured'))}`);
    }
  }
}

export default runPipeline;
