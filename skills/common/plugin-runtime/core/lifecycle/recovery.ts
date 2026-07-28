import type {
  LifecycleEvent,
  PipelineDefinition,
  PluginDomainEvent,
  WaitRequest,
} from '../../sdk/src/index.ts';
import type { JournalRecord } from '../state/journal.ts';
import type { StageRuntimeState } from './reducer.ts';

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

export function recoverStageStates(
  definition: PipelineDefinition,
  records: readonly JournalRecord<LifecycleEvent | PluginDomainEvent>[],
  runId: string,
): ReadonlyMap<string, StageRuntimeState> {
  const states = new Map<string, StageRuntimeState>(definition.stages.map((stage) => [stage.id, {
    stageId: stage.id,
    status: 'pending',
    attemptNumber: 0,
    attemptsUsed: 0,
    remediationCyclesUsed: 0,
  }]));
  for (const record of records) {
    const event = record.entry;
    if (event.schemaVersion !== 'lifecycle-event.v2' || event.identity.runId !== runId) continue;
    const stageId = event.identity.stageId;
    if (!stageId || !states.has(stageId)) continue;
    const current = states.get(stageId)!;
    if (event.type === 'attempt.created') {
      states.set(stageId, {
        ...current,
        attemptNumber: Math.max(current.attemptNumber, count(event.payload.attemptNumber)),
      });
      continue;
    }
    const budgets = {
      attemptsUsed: count(event.payload.attemptsUsed) || current.attemptsUsed,
      remediationCyclesUsed: count(event.payload.remediationCyclesUsed) || current.remediationCyclesUsed,
    };
    if (event.type === 'stage.started') states.set(stageId, { ...current, status: 'running' });
    else if (event.type === 'stage.retrying') states.set(stageId, { ...current, ...budgets, status: 'pending' });
    else if (event.type === 'stage.waiting' || event.type === 'orchestrator.required') {
      const wait = event.payload.wait;
      states.set(stageId, {
        ...current,
        ...budgets,
        status: 'waiting',
        ...(wait && typeof wait === 'object' ? { wait: wait as WaitRequest } : {}),
      });
    } else if (event.type === 'stage.succeeded') states.set(stageId, { ...current, ...budgets, status: 'succeeded' });
    else if (event.type === 'stage.blocked') states.set(stageId, { ...current, ...budgets, status: 'blocked' });
    else if (event.type === 'stage.failed') states.set(stageId, { ...current, ...budgets, status: 'failed' });
    else if (event.type === 'stage.cancelled') states.set(stageId, { ...current, ...budgets, status: 'cancelled' });
  }
  for (const [stageId, state] of states) {
    if (state.status === 'running') {
      states.set(stageId, {
        ...state,
        status: 'pending',
        attemptsUsed: state.attemptsUsed + 1,
      });
    }
  }
  return states;
}
