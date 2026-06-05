import {
  runScheduledValidator as runScheduledValidatorImpl,
  projectValidatorControlResultToStepResult,
  markScheduledValidatorComplete,
  findNextStep as findNextStepImpl,
} from './pipeline-runner-scheduling.ts';
import { getPipelineRunnerDeps } from './pipeline-runner-deps.ts';
import { runPipelineStateMachine } from './pipeline-runner-state-machine.ts';

type AnyRecord = Record<string, any>;

export async function runValidatorStep(config: AnyRecord, progress: AnyRecord, next: AnyRecord, deps: AnyRecord, opts: AnyRecord = {}) {
  const schedule = next?.schedule || {};
  const controlResult = await runScheduledValidatorImpl(config, progress, next.id, {
    resume: false,
    stageId: next.id,
    scheduleKey: schedule.key || null,
    scheduleReason: schedule.scheduleReason || schedule.reason || null,
    validatorConfig: schedule.validatorConfig || schedule.config || null,
    scope: schedule.scope || 'pipeline',
    moduleId: schedule.moduleId || null,
    gateId: schedule.gateId || null,
    orderIndex: schedule.orderIndex ?? null,
    causationRef: schedule.causationRef || null,
    signal: opts.signal || null,
  }, deps);
  const stepResult = projectValidatorControlResultToStepResult(config, controlResult, {
    stageId: next.id,
    stepId: schedule.key || next.id,
    scheduleKey: schedule.key || null,
    moduleId: schedule.moduleId || null,
    gateId: schedule.gateId || null,
  });
  if (stepResult.nextAction === 'continue') {
    markScheduledValidatorComplete(config, schedule.key || next.id);
  }
  return stepResult;
}

export async function runPipelineLoop(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}) {
  const deps = getPipelineRunnerDeps(config, opts.deps);
  return runPipelineStateMachine({
    config,
    progress,
    opts,
    deps,
    findNextStep: findNextStepImpl,
    runValidatorStep,
  });
}
