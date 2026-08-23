import type {
  LifecycleEvent,
  PipelineDefinition,
  StageResult,
  WaitRequest,
} from '@kubeclaw/plugin-sdk';
import { applyStageResult, type StageRuntimeState } from './reducer.ts';

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
): StageRuntimeState | undefined {
  if (!['attempt.completed', 'attempt.cancelled', 'attempt.timed_out'].includes(event.type)) return undefined;
  if (!event.payload.result || typeof event.payload.result !== 'object' || current.status !== 'running') return undefined;
  const stage = definition.stages.find(({ id }) => id === current.stageId);
  if (!stage) return undefined;
  const decision = applyStageResult(stage, {
    ...current,
    attemptNumber: Math.max(0, current.attemptNumber - 1),
    attemptsUsed: Math.max(0, current.attemptsUsed - 1),
  }, event.payload.result as StageResult);
  const waiting = decision.action.type === 'pause_for_orchestrator' || decision.action.type === 'request_orchestrator';
  const state = waiting ? withOrchestratorWait(decision, event, orchestratorIssuerId) : decision.state;
  return decision.action.type === 'schedule_attempt' ? { ...state, status: 'pending' } : state;
}

function withOrchestratorWait(
  decision: ReturnType<typeof applyStageResult>,
  event: LifecycleEvent,
  orchestratorIssuerId: string,
): StageRuntimeState {
  if (decision.action.type !== 'pause_for_orchestrator' && decision.action.type !== 'request_orchestrator') return decision.state;
  const request = decision.action.type === 'request_orchestrator'
    ? { afterAttempt: decision.action.afterAttempt }
    : decision.action.wait.request;
  return {
    ...decision.state,
    wait: {
      schemaVersion: 'wait-request.v2',
      waitId: `wait:orchestrator:${event.identity.attemptId ?? event.eventId}`,
      kind: 'orchestrator',
      signalType: 'core.orchestrator.resume',
      authorizedIssuer: { type: 'orchestrator', id: orchestratorIssuerId },
      expiresAt: null,
      ...(request ? { request } : {}),
    },
  };
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

export function applyRecoveryEvent(
  definition: PipelineDefinition,
  states: StateMap,
  event: LifecycleEvent,
  orchestratorIssuerId: string,
): void {
  const stageId = event.identity.stageId;
  if (!stageId) return;
  const current = states.get(stageId);
  if (!current) return;
  if (event.type === 'attempt.created') {
    const attemptNumber = count(event.payload.attemptNumber);
    states.set(stageId, { ...current, attemptNumber: Math.max(current.attemptNumber, attemptNumber), attemptsUsed: Math.max(current.attemptsUsed, attemptNumber) });
    return;
  }
  if (event.type === 'wait.resolved') {
    const { wait: _wait, ...withoutWait } = current;
    states.set(stageId, { ...withoutWait, status: 'pending' });
    return;
  }
  const recovered = recoverAttemptResult(definition, event, current, orchestratorIssuerId)
    ?? stageEventState(event, current, states);
  if (recovered) states.set(stageId, recovered);
}

export function resetInterruptedStages(states: StateMap): void {
  for (const [stageId, state] of states) {
    if (state.status === 'running') states.set(stageId, { ...state, status: 'pending' });
  }
}
