import type {
  LifecycleEvent,
  PipelineDefinition,
  PluginDomainEvent,
} from '../../sdk/src/index.ts';
import type { JournalRecord } from '../state/journal.ts';
import type { StageRuntimeState } from './reducer.ts';
import { FrozenMap } from '../registry/frozen-map.ts';
import { applyRecoveryEvent, initialStageStates, resetInterruptedStages } from './recovery-state.ts';

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

export function recoverStageStates(
  definition: PipelineDefinition,
  records: readonly JournalRecord<LifecycleEvent | PluginDomainEvent>[],
  runId: string,
  orchestratorIssuerId: string,
): ReadonlyMap<string, StageRuntimeState> {
  const states = initialStageStates(definition);
  for (const record of records) {
    const event = record.entry;
    if (event.schemaVersion !== 'lifecycle-event.v2' || event.identity.runId !== runId) continue;
    applyRecoveryEvent(definition, states, event, orchestratorIssuerId);
  }
  resetInterruptedStages(states);
  return new FrozenMap(
    [...states].map(([stageId, state]) => [stageId, deepFreeze(structuredClone(state))]),
  );
}
