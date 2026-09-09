import type {
  LifecycleEvent,
  PipelineDefinition,
  PluginDomainEvent,
} from '@kubeclaw/plugin-sdk';
import type { JournalRecord } from '../state/journal.ts';
import type { StageRuntimeState } from './reducer.ts';
import { FrozenMap } from '@kubeclaw/plugin-foundation/registry/frozen-map';
import { applyRecoveryEvent, initialStageStates, resetInterruptedStages } from './recovery-state.ts';
import { repairIdentityContexts } from './repair-projection.ts';

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
  const identities = repairIdentityContexts(records, runId);
  for (const record of records) {
    const event = record.entry;
    if (event.schemaVersion !== 'lifecycle-event.v2' || event.identity.runId !== runId) continue;
    applyRecoveryEvent(definition, states, event, orchestratorIssuerId, identities.get(event));
  }
  resetInterruptedStages(states);
  return new FrozenMap(
    [...states].map(([stageId, state]) => [stageId, deepFreeze(structuredClone(state))]),
  );
}

/** A wait projection may be missing after a committed attempt result. Fold the
 * same reducer to recover its authoritative creation record and timestamp. */
export function recoverWaitCreation(
  definition: PipelineDefinition,
  records: readonly JournalRecord<LifecycleEvent | PluginDomainEvent>[],
  runId: string,
  orchestratorIssuerId: string,
  waitId: string,
): JournalRecord<LifecycleEvent | PluginDomainEvent> | undefined {
  const states = initialStageStates(definition);
  const identities = repairIdentityContexts(records, runId);
  let created: JournalRecord<LifecycleEvent | PluginDomainEvent> | undefined;
  for (const record of records) {
    const event = record.entry;
    if (event.schemaVersion !== 'lifecycle-event.v2' || event.identity.runId !== runId) continue;
    const stageId = event.identity.stageId;
    const previous = stageId ? states.get(stageId)?.wait?.waitId : undefined;
    applyRecoveryEvent(definition, states, event, orchestratorIssuerId, identities.get(event));
    if (stageId && previous !== waitId && states.get(stageId)?.wait?.waitId === waitId) created = record;
  }
  return created;
}
