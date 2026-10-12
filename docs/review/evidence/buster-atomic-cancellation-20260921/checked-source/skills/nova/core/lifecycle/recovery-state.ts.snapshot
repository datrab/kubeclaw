import { applyRepair, repairRequest, type RepairRequest } from './remediation.ts';
import type {
  LifecycleEvent,
  PipelineDefinition,
  StageResult,
  WaitRequest,
  ResumeSignal,
} from '@kubeclaw/plugin-sdk';
import { applyStageResult, type StageRuntimeState } from './reducer.ts';
import { decisionWait } from './wait-request.ts';
import { budgetedRepairDecision, validateAdministrativeRepairProjection } from './repair-budget.ts';
import { authorizedRepair } from './repair-authorization.ts';
import { repairIdentityEncoding, type RepairIdentityContext } from './repair-projection.ts';

type StateMap = Map<string, StageRuntimeState>;

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function budgets(event: LifecycleEvent, current: StageRuntimeState): Pick<StageRuntimeState, 'attemptsUsed' | 'remediationCyclesUsed'> {
  return {
    attemptsUsed: event.payload.attemptsUsed === undefined ? current.attemptsUsed : count(event.payload.attemptsUsed),
    remediationCyclesUsed: event.payload.remediationCyclesUsed === undefined
      ? current.remediationCyclesUsed
      : count(event.payload.remediationCyclesUsed),
  };
}

export function initialStageStates(definition: PipelineDefinition): StateMap {
  return new Map([...definition.stages]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((stage) => [stage.id, {
      stageId: stage.id,
      status: 'pending' as const,
      attemptNumber: 0,
      attemptsUsed: 0,
      remediationCyclesUsed: 0,
    }]));
}

function recoverAttemptResult(
  definition: PipelineDefinition,
  event: LifecycleEvent,
  current: StageRuntimeState,
  orchestratorIssuerId: string,
  states: StateMap,
  identity: RepairIdentityContext,
): StageRuntimeState | undefined {
  if (!['attempt.completed', 'attempt.cancelled', 'attempt.timed_out'].includes(event.type)) return undefined;
  if (identity.projection && current.status !== 'running') throw new Error('REPAIR_PROJECTION_COMPLETION_STATE_INVALID');
  if (!event.payload.result || typeof event.payload.result !== 'object' || current.status !== 'running') return undefined;
  const stage = definition.stages.find(({ id }) => id === current.stageId);
  if (!stage) return undefined;
  const result = event.payload.result as StageResult;
  const original = applyStageResult(stage, {
    ...current,
    attemptNumber: Math.max(0, current.attemptNumber - 1),
    attemptsUsed: Math.max(0, current.attemptsUsed - 1),
  }, result);
  const decision = budgetedRepairDecision(definition.stages, states, stage, original, result, event.identity.runId, identity);
  const wait = decisionWait(decision, event.identity.runId, orchestratorIssuerId);
  const state = wait ? { ...decision.state, wait } : decision.state;
  if (decision.action.type === 'schedule_remediation') {
    states.set(stage.id, state);
    applyRepair(states, decision.action.repairRequest ?? repairRequest(definition.stages, stage.id,
      decision.action.stageId, state.remediationCyclesUsed, result));
    return states.get(stage.id);
  }
  return decision.action.type === 'schedule_attempt' ? { ...state, status: 'pending' } : state;
}

function scheduleState(event: LifecycleEvent, current: StageRuntimeState, states: StateMap): StageRuntimeState {
  if (typeof event.payload.remediationReturnTo === 'string') {
    return { ...current, status: 'pending', remediationReturnTo: event.payload.remediationReturnTo };
  }
  const { remediationTarget: _target, ...withoutTarget } = current;
  const remediationStageId = event.payload.remediationStageId;
  if (typeof remediationStageId === 'string') {
    const remediation = states.get(remediationStageId);
    if (remediation) {
      const { remediationReturnTo: _returnTo, ...withoutReturn } = remediation;
      states.set(remediationStageId, withoutReturn);
    }
  }
  return { ...withoutTarget, status: 'pending' };
}

function waitingState(event: LifecycleEvent, current: StageRuntimeState): StageRuntimeState {
  const wait = event.payload.wait;
  return {
    ...current,
    ...budgets(event, current),
    status: 'waiting',
    ...(wait && typeof wait === 'object' ? { wait: wait as WaitRequest } : {}),
    ...(typeof event.payload.retryAt === 'string' ? { retryAt: event.payload.retryAt } : {}),
    ...(typeof event.payload.remediationStageId === 'string'
      ? { remediationTarget: event.payload.remediationStageId }
      : {}),
  };
}

function succeededState(event: LifecycleEvent, current: StageRuntimeState): StageRuntimeState {
  const facts = event.payload.facts;
  return {
    ...current,
    ...budgets(event, current),
    status: 'succeeded',
    ...(facts && typeof facts === 'object' && !Array.isArray(facts)
      ? { facts: Object.freeze({ ...(facts as Record<string, string | number | boolean | null>) }) }
      : {}),
    ...(typeof event.payload.remediationReturnTo === 'string'
      ? { remediationReturnTo: event.payload.remediationReturnTo }
      : {}),
  };
}

const terminalStatus = new Map<string, StageRuntimeState['status']>([
  ['stage.skipped', 'skipped'],
  ['stage.blocked', 'blocked'],
  ['stage.failed', 'failed'],
  ['stage.cancelled', 'cancelled'],
]);

function stageEventState(event: LifecycleEvent, current: StageRuntimeState, states: StateMap): StageRuntimeState | undefined {
  if (event.type === 'stage.scheduled') return scheduleState(event, current, states);
  if (event.type === 'stage.started') return { ...current, status: 'running' };
  if (event.type === 'stage.retrying') return { ...current, ...budgets(event, current), status: 'pending' };
  if (event.type === 'stage.waiting' || event.type === 'orchestrator.required') return waitingState(event, current);
  if (event.type === 'stage.succeeded') return succeededState(event, current);
  const status = terminalStatus.get(event.type);
  return status ? { ...current, ...budgets(event, current), status } : undefined;
}

function resolvedWaitState(event: LifecycleEvent, current: StageRuntimeState): StageRuntimeState {
  const { wait: _wait, ...withoutWait } = current;
  const signal = event.payload.signal as ResumeSignal;
  if (!signal || signal.waitId !== event.identity.waitId) throw new Error('RECOVERY_WAIT_SIGNAL_INVALID');
  return { ...withoutWait, status: 'pending', continuationGuidance: signal.payload };
}

export function applyRecoveryEvent(
  definition: PipelineDefinition,
  states: StateMap,
  event: LifecycleEvent,
  orchestratorIssuerId: string,
  identity: RepairIdentityContext = { encoding: repairIdentityEncoding(event.payload.repairIdentityEncoding) },
): void {
  const stageId = event.identity.stageId;
  if (!stageId) return;
  const current = states.get(stageId);
  if (!current) return;
  if (event.type === 'stage.waiting' && event.payload.repairRequest) {
    validateAdministrativeRepairProjection(definition.stages, states, current, event, identity);
    states.set(stageId, { ...current, ...budgets(event, current) });
    applyRepair(states, event.payload.repairRequest as unknown as RepairRequest); return;
  }
  if (event.type === 'attempt.created') {
    const attemptNumber = count(event.payload.attemptNumber);
    states.set(stageId, { ...current, attemptNumber: Math.max(current.attemptNumber, attemptNumber), attemptsUsed: Math.max(current.attemptsUsed, attemptNumber) });
    return;
  }
  if (event.type === 'wait.resolved') {
    const repair = authorizedRepair(definition.stages, states, current, event.payload.signal as ResumeSignal);
    if (repair) { applyRepair(states, repair); return; }
    states.set(stageId, resolvedWaitState(event, current));
    return;
  }
  const recovered = recoverAttemptResult(definition, event, current, orchestratorIssuerId, states, identity)
    ?? stageEventState(event, current, states);
  if (recovered) {
    states.set(stageId, recovered);
  }
}

export function resetInterruptedStages(states: StateMap): void {
  for (const [stageId, state] of states) {
    if (state.status === 'running') states.set(stageId, { ...state, status: 'pending' });
  }
}
