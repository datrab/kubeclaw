import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { resumeDurableCooldownForStep } from '../services/rate-limit.ts';
import { completePipeline, emitPersistedPipelineHalt, haltPipeline, normalizeStepResultForPipeline } from './pipeline-runner-terminal.ts';
import { getActiveContext, runWithActiveContext } from '../core/logger.ts';
import { runPipelineModuleBatch } from './pipeline-runner-module-batch.ts';
import {
  batchFailureResult,
  batchJoinFailureResult,
  normalizeBatchResults,
  passedModuleStepResult,
} from './pipeline-runner-batch-results.ts';

type AnyRecord = Record<string, any>;
const FIRST_GATE_EVALUATION_ATTEMPT = 1;

export const PIPELINE_RUNNER_ACTIONS = Object.freeze({
  COMPLETE: 'complete', HALT_BLOCKED: 'halt_blocked', RUN_VALIDATOR: 'run_validator',
  RUN_GATE: 'run_gate', RUN_MODULE: 'run_module', RUN_MODULE_BATCH: 'run_module_batch',
});

function nonEmptyModuleBatch(next: AnyRecord) {
  return next?.type === 'module_batch' && Array.isArray(next.ids) && next.ids.length > 0;
}

export function planPipelineStep(next: AnyRecord = {}): AnyRecord {
  const actions: AnyRecord = {
    done: PIPELINE_RUNNER_ACTIONS.COMPLETE,
    blocked: PIPELINE_RUNNER_ACTIONS.HALT_BLOCKED,
    validator: PIPELINE_RUNNER_ACTIONS.RUN_VALIDATOR,
    gate: PIPELINE_RUNNER_ACTIONS.RUN_GATE,
  };
  if (actions[next?.type]) return { action: actions[next.type], next };
  if (nonEmptyModuleBatch(next)) return { action: PIPELINE_RUNNER_ACTIONS.RUN_MODULE_BATCH, next };
  if (next?.type === 'module' && next?.id) return { action: PIPELINE_RUNNER_ACTIONS.RUN_MODULE, next };
  throw new Error(`Unknown typed pipeline step: ${JSON.stringify(next)}`);
}

function abortReason(signal: AnyRecord = {}) {
  return signal?.reason instanceof Error ? signal.reason.message : String(signal?.reason ?? 'pipeline_run_lock_lost');
}

function pipelineAbortSignals(opts: AnyRecord = {}) {
  return [opts.pipelineRunLockSignal, opts.signal].filter((signal, index, signals) => signal && signals.indexOf(signal) === index);
}

function assertPipelineStepActive(opts: AnyRecord = {}) {
  opts.assertPipelineRunLockActive?.();
  const signal = pipelineAbortSignals(opts).find((candidate) => candidate?.aborted);
  if (signal?.aborted) throw new Error(`Pipeline runtime lock lost: ${abortReason(signal)}`);
}

function plannedGateAttempt(next: AnyRecord = {}) {
  if (selectTruthyValue(() => next.attempt === undefined, () => next.attempt === null)) return FIRST_GATE_EVALUATION_ATTEMPT;
  const attempt = Number(next.attempt);
  if (selectTruthyValue(() => !Number.isInteger(attempt), () => attempt < 1)) throw new Error('planned gate step requires positive integer attempt');
  return attempt;
}

function activeModuleRunSet(config: AnyRecord): Set<string> {
  const owner = selectTruthyValue(() => config._sharedPipelineConfig, () => config);
  if (!(owner._activeModuleRuns instanceof Set)) owner._activeModuleRuns = new Set<string>();
  return owner._activeModuleRuns;
}

function firstPresent(...values: any[]) {
  for (const value of values) if (value !== undefined && value !== null) return value;
  return null;
}

async function runModuleWithActiveLock(config: AnyRecord, progress: AnyRecord, moduleId: string, opts: AnyRecord, deps: AnyRecord) {
  const active = activeModuleRunSet(config);
  const key = `${firstPresent(config?._runId, config?.run_id, 'run_unknown')}:${moduleId}`;
  if (active.has(key)) throw new Error(`Module ${moduleId} is already active in this pipeline run`);
  active.add(key);
  try { return await deps.runModule(config, progress, moduleId, opts); }
  finally { active.delete(key); }
}

async function runModuleWithIsolatedLogContext(config: AnyRecord, progress: AnyRecord, moduleId: string, opts: AnyRecord, deps: AnyRecord) {
  const parent: AnyRecord = getActiveContext() ?? { stats: { errors: [] } };
  return runWithActiveContext({
    ...parent,
    config,
    stats: parent.stats ?? { errors: [] },
    pluginRegistry: config.pluginRegistry ?? parent.pluginRegistry,
    _logModule: null,
    _logPhase: null,
  }, () => runModuleWithActiveLock(config, progress, moduleId, opts, deps));
}

async function abortablePipelineStep<T>(promise: Promise<T>, opts: AnyRecord = {}): Promise<T> {
  const signals = pipelineAbortSignals(opts);
  opts.trackPipelineStep?.(promise);
  const preAborted = signals.find((signal) => signal?.aborted);
  if (preAborted) throw new Error(`Pipeline runtime lock lost: ${abortReason(preAborted)}`);
  const listenable = signals.filter((signal) => typeof signal.addEventListener === 'function');
  if (listenable.length === 0) return promise;
  const removers: Array<() => void> = [];
  const aborted = new Promise<T>((_resolve, reject) => {
    for (const signal of listenable) {
      const onAbort = () => reject(new Error(`Pipeline runtime lock lost: ${abortReason(signal)}`));
      signal.addEventListener('abort', onAbort, { once: true });
      removers.push(() => signal.removeEventListener('abort', onAbort));
    }
  });
  try { return await Promise.race([promise, aborted]); }
  finally { for (const remove of removers) remove(); }
}

async function abortableSleep(ms: number, opts: AnyRecord = {}) {
  const signals = pipelineAbortSignals(opts);
  const preAborted = signals.find((signal) => signal?.aborted);
  if (preAborted) throw new Error(`Pipeline runtime lock lost: ${abortReason(preAborted)}`);
  const listenable = signals.filter((signal) => typeof signal.addEventListener === 'function');
  if (listenable.length === 0) return new Promise<void>((resolve) => setTimeout(resolve, ms));
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const removers: Array<() => void> = [];
    const cleanup = () => removers.forEach((remove) => remove());
    const finish = () => { if (!settled) { settled = true; cleanup(); resolve(); } };
    const timer = setTimeout(finish, ms);
    for (const signal of listenable) {
      const fail = () => { if (!settled) { settled = true; clearTimeout(timer); cleanup(); reject(new Error(`Pipeline runtime lock lost: ${abortReason(signal)}`)); } };
      signal.addEventListener('abort', fail, { once: true });
      removers.push(() => signal.removeEventListener('abort', fail));
    }
    (timer as AnyRecord).unref?.();
  });
}

function moduleRunOptions(opts: AnyRecord) {
  return { novaPrompt: opts.novaPrompt, deps: opts.deps, budget: opts.budget ?? null, signal: opts.signal ?? null };
}

async function runPlannedPipelineStep({ config, progress, opts, deps, plan, runValidatorStep }: AnyRecord) {
  const next = plan.next;
  assertPipelineStepActive(opts);
  await resumeDurableCooldownForStep(config, progress, next, { budget: opts.budget ?? null, sleepFn: (ms: number) => abortableSleep(ms, opts) });
  assertPipelineStepActive(opts);
  const persisted = emitPersistedPipelineHalt(config, deps);
  if (persisted !== null) return { kind: 'persisted_terminal_halt_exit', exitCode: persisted };
  if (plan.action === PIPELINE_RUNNER_ACTIONS.RUN_VALIDATOR) return abortablePipelineStep(runValidatorStep(config, progress, next, deps, opts), opts);
  if (plan.action === PIPELINE_RUNNER_ACTIONS.RUN_GATE) return abortablePipelineStep(deps.runGate(config, progress, next.id, { ...moduleRunOptions(opts), attempt: plannedGateAttempt(next) }), opts);
  if (plan.action === PIPELINE_RUNNER_ACTIONS.RUN_MODULE_BATCH) {
    return runPipelineModuleBatch({ config, progress, next, opts: moduleRunOptions(opts), deps, abortable: (promise: Promise<any>) => abortablePipelineStep(promise, opts), runModule: runModuleWithIsolatedLogContext });
  }
  return abortablePipelineStep(runModuleWithActiveLock(config, progress, next.id, moduleRunOptions(opts), deps), opts);
}

function haltForBatchResult(config: AnyRecord, progress: AnyRecord, result: AnyRecord, batchResults: AnyRecord[], opts: AnyRecord) {
  if (result?.join_failure) {
    const id = result.join_failure.module_id ?? batchResults[0]?.moduleId;
    return haltPipeline(config, progress, { type: 'module', id }, batchJoinFailureResult(result.join_failure, batchResults), opts);
  }
  const failed = batchResults.filter((entry) => !entry.normalized.shouldContinue);
  const primary = failed[0];
  if (primary) return haltPipeline(config, progress, { type: 'module', id: primary.moduleId }, batchFailureResult(failed, batchResults), opts);
  return null;
}

export async function runPipelineStateMachine({ config, progress, opts = {}, deps, findNextStep, runValidatorStep }: AnyRecord = {}) {
  while (true) {
    await opts.awaitCommandPermission?.();
    assertPipelineStepActive(opts);
    const persisted = emitPersistedPipelineHalt(config, deps);
    if (persisted !== null) return persisted;
    const plan = planPipelineStep(findNextStep(config, progress, deps));
    if (plan.action === PIPELINE_RUNNER_ACTIONS.COMPLETE) return completePipeline(config, progress, opts);
    if (plan.action === PIPELINE_RUNNER_ACTIONS.HALT_BLOCKED) return haltPipeline(config, progress, plan.next, null, opts);
    const result = await runPlannedPipelineStep({ config, progress, opts, deps, plan, runValidatorStep });
    if (result?.kind === 'persisted_terminal_halt_exit') return result.exitCode;
    assertPipelineStepActive(opts);
    const batchResults = normalizeBatchResults(result);
    if (batchResults) {
      const halt = haltForBatchResult(config, progress, result, batchResults, opts);
      if (halt !== null) return halt;
      continue;
    }
    const stepResult = result ?? (plan.next.type === 'module' ? passedModuleStepResult(plan.next.id) : result);
    const normalized = normalizeStepResultForPipeline(stepResult, { stepType: plan.next.type, stepId: plan.next.id });
    if (!normalized.shouldContinue) return haltPipeline(config, progress, plan.next, result, opts);
  }
}
