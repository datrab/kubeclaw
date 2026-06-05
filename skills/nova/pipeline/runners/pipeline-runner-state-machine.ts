// runners/pipeline-runner-state-machine.ts — explicit pipeline loop state machine

import { resumeDurableCooldownForStep } from '../services/rate-limit.ts';
import {
  completePipeline,
  haltPipeline,
  normalizeStepResultForPipeline,
} from './pipeline-runner-terminal.ts';

type AnyRecord = Record<string, any>;

export const PIPELINE_RUNNER_ACTIONS = Object.freeze({
  COMPLETE: 'complete',
  HALT_BLOCKED: 'halt_blocked',
  RUN_VALIDATOR: 'run_validator',
  RUN_GATE: 'run_gate',
  RUN_MODULE: 'run_module',
});

export function planPipelineStep(next: AnyRecord = {}): AnyRecord {
  if (next?.type === 'done') return { action: PIPELINE_RUNNER_ACTIONS.COMPLETE, next };
  if (next?.type === 'blocked') return { action: PIPELINE_RUNNER_ACTIONS.HALT_BLOCKED, next };
  if (next?.type === 'validator') return { action: PIPELINE_RUNNER_ACTIONS.RUN_VALIDATOR, next };
  if (next?.type === 'gate') return { action: PIPELINE_RUNNER_ACTIONS.RUN_GATE, next };
  if (next?.type === 'module' && next?.id) return { action: PIPELINE_RUNNER_ACTIONS.RUN_MODULE, next };
  throw new Error(`Unknown typed pipeline step: ${JSON.stringify(next)}`);
}

function abortReason(signal: AnyRecord = {}): string {
  return signal?.reason instanceof Error ? signal.reason.message : String(signal?.reason || 'pipeline_run_lock_lost');
}

function pipelineAbortSignals(opts: AnyRecord = {}): AnyRecord[] {
  return [opts.pipelineRunLockSignal, opts.signal].filter((signal, index, signals) => (
    signal && signals.indexOf(signal) === index
  ));
}

function assertPipelineStepActive(opts: AnyRecord = {}): void {
  opts.assertPipelineRunLockActive?.();
  const signal = pipelineAbortSignals(opts).find((candidate) => candidate?.aborted);
  if (signal?.aborted) {
    throw new Error(`Pipeline runtime lock lost: ${abortReason(signal)}`);
  }
}

async function abortablePipelineStep<T>(promise: Promise<T>, opts: AnyRecord = {}): Promise<T> {
  const signals = pipelineAbortSignals(opts);
  opts.trackPipelineStep?.(promise);
  const abortedSignal = signals.find((signal) => signal?.aborted);
  if (abortedSignal) throw new Error(`Pipeline runtime lock lost: ${abortReason(abortedSignal)}`);
  const listenableSignals = signals.filter((signal) => typeof signal.addEventListener === 'function');
  if (listenableSignals.length === 0) return promise;

  const removeAbortListeners: Array<() => void> = [];
  const aborted = new Promise<T>((_resolve, reject) => {
    for (const signal of listenableSignals) {
      const onAbort = () => reject(new Error(`Pipeline runtime lock lost: ${abortReason(signal)}`));
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbortListeners.push(() => signal.removeEventListener('abort', onAbort));
    }
  });

  try {
    return await Promise.race([promise, aborted]);
  } finally {
    for (const removeAbortListener of removeAbortListeners) removeAbortListener();
  }
}

async function abortableSleep(ms: number, opts: AnyRecord = {}): Promise<void> {
  const signals = pipelineAbortSignals(opts);
  const abortedSignal = signals.find((signal) => signal?.aborted);
  if (abortedSignal) throw new Error(`Pipeline runtime lock lost: ${abortReason(abortedSignal)}`);
  const listenableSignals = signals.filter((signal) => typeof signal.addEventListener === 'function');
  if (listenableSignals.length === 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const removeAbortListeners: Array<() => void> = [];
    const cleanup = () => {
      for (const removeAbortListener of removeAbortListeners) removeAbortListener();
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (signal: AnyRecord) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error(`Pipeline runtime lock lost: ${abortReason(signal)}`));
    };
    const timer = setTimeout(finish, ms);
    for (const signal of listenableSignals) {
      const onAbort = () => {
        fail(signal);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbortListeners.push(() => signal.removeEventListener('abort', onAbort));
    }
    (timer as AnyRecord).unref?.();
    const signal = listenableSignals.find((candidate) => candidate?.aborted);
    if (signal) fail(signal);
  });
}

async function runPlannedPipelineStep({ config, progress, opts, deps, plan, runValidatorStep }: AnyRecord): Promise<any> {
  const next = plan.next;
  assertPipelineStepActive(opts);
  await resumeDurableCooldownForStep(config, progress, next, {
    budget: opts.budget || null,
    sleepFn: (ms: number) => abortableSleep(ms, opts),
  });
  assertPipelineStepActive(opts);

  if (plan.action === PIPELINE_RUNNER_ACTIONS.RUN_VALIDATOR) {
    return abortablePipelineStep(runValidatorStep(config, progress, next, deps, opts), opts);
  }
  if (plan.action === PIPELINE_RUNNER_ACTIONS.RUN_GATE) {
    return abortablePipelineStep(deps.runGate(config, progress, next.id, { novaPrompt: opts.novaPrompt, deps: opts.deps, budget: opts.budget || null, signal: opts.signal || null }), opts);
  }
  return abortablePipelineStep(deps.runModule(config, progress, next.id, { novaPrompt: opts.novaPrompt, deps: opts.deps, budget: opts.budget || null, signal: opts.signal || null }), opts);
}

export async function runPipelineStateMachine({
  config,
  progress,
  opts = {},
  deps,
  findNextStep,
  runValidatorStep,
}: AnyRecord = {}): Promise<any> {
  while (true) {
    assertPipelineStepActive(opts);
    const plan = planPipelineStep(findNextStep(config, progress, deps));
    assertPipelineStepActive(opts);

    if (plan.action === PIPELINE_RUNNER_ACTIONS.COMPLETE) {
      return completePipeline(config, progress, opts);
    }
    if (plan.action === PIPELINE_RUNNER_ACTIONS.HALT_BLOCKED) {
      return haltPipeline(config, progress, plan.next, null, opts);
    }

    const result = await runPlannedPipelineStep({ config, progress, opts, deps, plan, runValidatorStep });
    assertPipelineStepActive(opts);
    const normalized = normalizeStepResultForPipeline(result, {
      stepType: plan.next.type,
      stepId: plan.next.id,
    });
    if (!normalized.shouldContinue) {
      return haltPipeline(config, progress, plan.next, result, opts);
    }
  }
}
