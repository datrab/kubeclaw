import type {
  LifecycleEvent,
  PipelineDefinition,
  PluginDomainEvent,
  StageResult,
  WaitRequest,
} from '../../sdk/src/index.ts';
import type { JournalRecord } from '../state/journal.ts';
import { applyStageResult, type StageRuntimeState } from './reducer.ts';
import { FrozenMap } from '../registry/frozen-map.ts';

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

export function recoverStageStates(
  definition: PipelineDefinition,
  records: readonly JournalRecord<LifecycleEvent | PluginDomainEvent>[],
  runId: string,
  orchestratorIssuerId: string,
): ReadonlyMap<string, StageRuntimeState> {
  const states = new Map<string, StageRuntimeState>(
    [...definition.stages]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((stage) => [stage.id, {
        stageId: stage.id,
        status: 'pending',
        attemptNumber: 0,
        attemptsUsed: 0,
        remediationCyclesUsed: 0,
      }]),
  );
  for (const record of records) {
    const event = record.entry;
    if (event.schemaVersion !== 'lifecycle-event.v2' || event.identity.runId !== runId) continue;
    const stageId = event.identity.stageId;
    if (!stageId || !states.has(stageId)) continue;
    const current = states.get(stageId)!;
    if (event.type === 'attempt.created') {
      const attemptNumber = count(event.payload.attemptNumber);
      states.set(stageId, {
        ...current,
        attemptNumber: Math.max(current.attemptNumber, attemptNumber),
        attemptsUsed: Math.max(current.attemptsUsed, attemptNumber),
      });
      continue;
    }
    if (event.type === 'wait.resolved') {
      const { wait: _wait, ...withoutWait } = current;
      states.set(stageId, { ...withoutWait, status: 'pending' });
      continue;
    }
    if (
      ['attempt.completed', 'attempt.cancelled', 'attempt.timed_out'].includes(event.type)
      && event.payload.result
      && typeof event.payload.result === 'object'
      && current.status === 'running'
    ) {
      const definitionForStage = definition.stages.find(({ id }) => id === stageId);
      if (!definitionForStage) continue;
      const decision = applyStageResult(
        definitionForStage,
        {
          ...current,
          attemptNumber: Math.max(0, current.attemptNumber - 1),
          attemptsUsed: Math.max(0, current.attemptsUsed - 1),
        },
        event.payload.result as StageResult,
      );
      const recoveredState = (
        decision.action.type === 'pause_for_orchestrator'
        || decision.action.type === 'request_orchestrator'
      )
        ? {
            ...decision.state,
            wait: {
              schemaVersion: 'wait-request.v2' as const,
              waitId: `wait:orchestrator:${event.identity.attemptId ?? event.eventId}`,
              kind: 'orchestrator' as const,
              signalType: 'core.orchestrator.resume',
              authorizedIssuer: {
                type: 'orchestrator' as const,
                id: orchestratorIssuerId,
              },
              expiresAt: null,
              ...(decision.action.type === 'request_orchestrator'
                ? { request: { afterAttempt: decision.action.afterAttempt } }
                : decision.action.wait.request
                  ? { request: decision.action.wait.request }
                  : {}),
            },
          }
        : decision.state;
      states.set(stageId, {
        ...recoveredState,
        ...(decision.action.type === 'schedule_attempt' ? { status: 'pending' as const } : {}),
      });
      continue;
    }
    const budgets = {
      attemptsUsed: event.payload.attemptsUsed === undefined
        ? current.attemptsUsed
        : count(event.payload.attemptsUsed),
      remediationCyclesUsed: event.payload.remediationCyclesUsed === undefined
        ? current.remediationCyclesUsed
        : count(event.payload.remediationCyclesUsed),
    };
    if (event.type === 'stage.scheduled') {
      if (typeof event.payload.remediationReturnTo === 'string') {
        states.set(stageId, {
          ...current,
          status: 'pending',
          remediationReturnTo: event.payload.remediationReturnTo,
        });
      } else {
        const { remediationTarget: _target, ...withoutTarget } = current;
        states.set(stageId, {
          ...withoutTarget,
          status: 'pending',
        });
        if (typeof event.payload.remediationStageId === 'string') {
          const remediation = states.get(event.payload.remediationStageId);
          if (remediation) {
            const { remediationReturnTo: _returnTo, ...withoutReturn } = remediation;
            states.set(event.payload.remediationStageId, withoutReturn);
          }
        }
      }
    } else if (event.type === 'stage.started') states.set(stageId, { ...current, status: 'running' });
    else if (event.type === 'stage.retrying') states.set(stageId, { ...current, ...budgets, status: 'pending' });
    else if (event.type === 'stage.waiting' || event.type === 'orchestrator.required') {
      const wait = event.payload.wait;
      states.set(stageId, {
        ...current,
        ...budgets,
        status: 'waiting',
        ...(wait && typeof wait === 'object' ? { wait: wait as WaitRequest } : {}),
        ...(typeof event.payload.retryAt === 'string'
          ? { retryAt: event.payload.retryAt }
          : {}),
        ...(typeof event.payload.remediationStageId === 'string'
          ? { remediationTarget: event.payload.remediationStageId }
          : {}),
      });
    } else if (event.type === 'stage.succeeded') {
      states.set(stageId, {
        ...current,
        ...budgets,
        status: 'succeeded',
        ...(typeof event.payload.remediationReturnTo === 'string'
          ? { remediationReturnTo: event.payload.remediationReturnTo }
          : {}),
      });
    }
    else if (event.type === 'stage.blocked') states.set(stageId, { ...current, ...budgets, status: 'blocked' });
    else if (event.type === 'stage.failed') states.set(stageId, { ...current, ...budgets, status: 'failed' });
    else if (event.type === 'stage.cancelled') states.set(stageId, { ...current, ...budgets, status: 'cancelled' });
  }
  for (const [stageId, state] of states) {
    if (state.status === 'running') {
      states.set(stageId, {
        ...state,
        status: 'pending',
      });
    }
  }
  return new FrozenMap(
    [...states].map(([stageId, state]) => [stageId, deepFreeze(structuredClone(state))]),
  );
}
