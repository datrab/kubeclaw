import {
  runScheduledValidator as runScheduledValidatorImpl,
  projectValidatorControlResultToStepResult,
  markScheduledValidatorComplete,
  findNextStep as findNextStepImpl,
} from './pipeline-runner-scheduling.ts';
import { getPipelineRunnerDeps } from './pipeline-runner-deps.ts';
import { runPipelineStateMachine } from './pipeline-runner-state-machine.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

function scheduledValidatorStepId(schedule: AnyRecord, next: AnyRecord): string {
  if (typeof schedule?.key === 'string' && schedule.key.trim()) return schedule.key.trim();
  if (typeof next?.id === 'string' && next.id.trim()) return next.id.trim();
  throw new Error('Scheduled validator completion requires schedule key or step id');
}

export async function runValidatorStep(config: AnyRecord, progress: AnyRecord, next: AnyRecord, deps: AnyRecord, opts: AnyRecord = {}) {
  const schedule = selectDefinedValue(() => (next?.schedule), () => ({}));
  const stepId = scheduledValidatorStepId(schedule, next);
  const controlResult = await runScheduledValidatorImpl(config, progress, next.id, {
    resume: false,
    stageId: next.id,
    scheduleKey: selectTruthyValue(() => (schedule.key), () => (null)),
    scheduleReason: selectTruthyValue(() => (selectTruthyValue(() => (schedule.scheduleReason), () => (schedule.reason))), () => (null)),
    validatorConfig: selectTruthyValue(() => (selectTruthyValue(() => (schedule.validatorConfig), () => (schedule.config))), () => (null)),
    scope: selectDefinedValue(() => (schedule.scope), () => ('pipeline')),
    moduleId: selectTruthyValue(() => (schedule.moduleId), () => (null)),
    gateId: selectTruthyValue(() => (schedule.gateId), () => (null)),
    orderIndex: selectDefinedValue(() => (schedule.orderIndex), () => (null)),
    causationRef: selectTruthyValue(() => (schedule.causationRef), () => (null)),
    signal: selectTruthyValue(() => (opts.signal), () => (null)),
  }, deps);
  const stepResult = projectValidatorControlResultToStepResult(config, controlResult, {
    stageId: next.id,
    stepId,
    scheduleKey: selectTruthyValue(() => (schedule.key), () => (null)),
    moduleId: selectTruthyValue(() => (schedule.moduleId), () => (null)),
    gateId: selectTruthyValue(() => (schedule.gateId), () => (null)),
  });
  if (stepResult.nextAction === 'continue') {
    markScheduledValidatorComplete(config, stepId);
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
