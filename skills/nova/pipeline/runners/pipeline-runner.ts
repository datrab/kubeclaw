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
import { runPipelineLoop } from './pipeline-runner-loop.ts';

function positiveNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

async function waitForInFlightPipelineSteps(inFlightSteps, timeoutMs) {
  if (!inFlightSteps?.size) return;
  const settled = Promise.allSettled([...inFlightSteps]);
  if (timeoutMs === 0) {
    await settled;
    return;
  }
  await Promise.race([
    settled,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function abortReason(signal) {
  return signal?.reason instanceof Error ? signal.reason.message : String(signal?.reason || 'pipeline_run_lock_lost');
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function abortablePipelineRunPromise(promise, signal) {
  if (!signal || typeof signal.addEventListener !== 'function') return promise;
  if (signal.aborted) throw new Error(`Pipeline runtime lock lost: ${abortReason(signal)}`);

  let removeAbortListener = null;
  const aborted = new Promise((_resolve, reject) => {
    const onAbort = () => reject(new Error(`Pipeline runtime lock lost: ${abortReason(signal)}`));
    signal.addEventListener('abort', onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', onAbort);
  });

  try {
    return await Promise.race([promise, aborted]);
  } finally {
    removeAbortListener?.();
  }
}

export async function runPipeline(config, progress, opts = {}) {
  const inFlightSteps = new Set();
  const lockAbortController = typeof AbortController === 'function' ? new AbortController() : null;
  const stepAbortController = typeof AbortController === 'function' ? new AbortController() : null;
  const forwardExternalAbort = () => {
    if (stepAbortController && !stepAbortController.signal.aborted) {
      stepAbortController.abort(opts.signal.reason || 'pipeline_run_aborted');
    }
  };
  if (opts.signal?.aborted) forwardExternalAbort();
  opts.signal?.addEventListener?.('abort', forwardExternalAbort, { once: true });
  const runLock = acquirePipelineRunLock(config, {
    ...opts,
    onPipelineRunLockLost(reason) {
      opts.onPipelineRunLockLost?.(reason);
      if (lockAbortController && !lockAbortController.signal.aborted) {
        lockAbortController.abort(reason || 'pipeline_run_lock_lost');
      }
      if (stepAbortController && !stepAbortController.signal.aborted) {
        stepAbortController.abort(reason || 'pipeline_run_lock_lost');
      }
    },
  });
  const runOpts = {
    ...opts,
    assertPipelineRunLockActive: () => runLock.heartbeat?.assertActive?.(),
    pipelineRunLockSignal: lockAbortController?.signal || null,
    signal: stepAbortController?.signal || opts.signal || null,
    trackPipelineStep(promise) {
      if (!promise || typeof promise.finally !== 'function') return;
      inFlightSteps.add(promise);
      promise.finally(() => inFlightSteps.delete(promise)).catch(() => {});
      opts.trackPipelineStep?.(promise);
    },
  };
  let openClawAgentObserverPlugin = null;
  let agentObservabilityIngester = null;
  let runError = null;
  try {
    openClawAgentObserverPlugin = createOpenClawAgentObserverPluginController(
      config,
      runOpts.openClawAgentObserverPlugin || {},
    );
    await openClawAgentObserverPlugin.start();
    agentObservabilityIngester = startAgentObservabilityIngester(config, {
      runId: config._runId || config.run_id || null,
      project: config.project || null,
    }, runOpts.agentObservabilityIngester || {});
    await reconcileStaleModuleState(config, progress);
    await reconcileStaleGateSessions(config, progress);

    runOpts.assertPipelineRunLockActive();
    await startPipelineRun(config, progress, runOpts);
    if (runOpts.module) {
      const singleModuleRun = runSingleModulePipeline(config, progress, runOpts);
      runOpts.trackPipelineStep(singleModuleRun);
      return await abortablePipelineRunPromise(singleModuleRun, runOpts.pipelineRunLockSignal);
    }

    runOpts.assertPipelineRunLockActive();
    const startExitCode = await preparePipelineStart(config, progress, runOpts);
    if (startExitCode != null) return startExitCode;

    return await runPipelineLoop(config, progress, runOpts);
  } catch (error) {
    runError = error;
    throw error;
  } finally {
    let cleanupError = null;
    try {
      opts.signal?.removeEventListener?.('abort', forwardExternalAbort);
      if (runOpts.pipelineRunLockSignal?.aborted && inFlightSteps.size > 0) {
        await waitForInFlightPipelineSteps(
          inFlightSteps,
          positiveNumber(config.pipeline_run_lock_abort_settle_ms ?? opts.pipelineRunLockAbortSettleMs, 5000),
        );
        if (inFlightSteps.size > 0) {
          log('ERROR', `Pipeline run lock lost with ${inFlightSteps.size} in-flight step(s) still unsettled after abort grace period`);
        }
      }
      if (agentObservabilityIngester) await agentObservabilityIngester.stop();
      if (openClawAgentObserverPlugin) await openClawAgentObserverPlugin.stop();
    } catch (error) {
      cleanupError = error;
      if (runError) log('WARN', `Pipeline observer cleanup failed after run error: ${errorMessage(error)}`);
    } finally {
      releasePipelineRunLock(runLock);
    }
    if (cleanupError && !runError) throw cleanupError;
  }
}

export function printStatus(config, progress) {
  const deps = getPipelineRunnerDeps(config);
  const overview = { project: config.project, timestamp: new Date().toISOString(), modules: {}, gates: {} };
  for (const [id, mod] of Object.entries(progress.modules)) {
    const projected = loadAuthoritativeModuleState(config, progress, id, {
      loadStatusFn: deps.loadStatus,
    });
    overview.modules[id] = {
      title: mod.title,
      status: projected?.status || 'NOT_INITIALIZED',
      fail_count: projected?.fail_count || 0,
      current_phase: projected?.current_phase || null,
      duration_min: projected?.cost?.total_duration_seconds ? Math.round(projected.cost.total_duration_seconds / 60) : 0,
    };
  }
  for (const [id, gate] of Object.entries(progress.gates)) {
    const gateProjection = projectPipelineGateState(config, id, gate, deps);
    overview.gates[id] = { title: gate.title, completed: gateProjection?.completed === true };
  }
  output(overview);
}

export function dryRun(config, progress) {
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
      const projected = loadAuthoritativeModuleState(config, progress, stepId, {
        loadStatusFn: deps.loadStatus,
      });
      log('STEP', `[${stepId}] ${mod.title} | ${projected?.status || STATUS.PENDING} | model=${mod.forge_model ?? progress.defaults?.models?.forge ?? config.fallback_model}`);
    }
  }
}

export default runPipeline;
