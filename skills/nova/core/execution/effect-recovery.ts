import path from 'node:path';
import type { LifecycleEvent, PipelineDefinition, PluginDomainEvent } from '@kubeclaw/plugin-sdk';
import { FileEffectJournal } from '../effects/journal.ts';
import type { FileJournal } from '../state/journal.ts';

// These local operations can be recovered through durable artifact checkpoints
// or repeated reads. External mutations require an explicit continuation.
const CHECKPOINT_OPERATIONS = new Set(['artifacts.read', 'artifacts.write', 'git.repository.read', 'state.read']);

export async function assertEffectRecoverySafe(runRoot: string, runId: string, definition: PipelineDefinition,
  events: FileJournal<LifecycleEvent | PluginDomainEvent>): Promise<void> {
  const effects = new FileEffectJournal(path.join(runRoot, 'effects.jsonl'));
  const stages = new Set(definition.stages.map(stage => stage.id));
  const owned = (request: { attempt: { runId: string; stageId: string } }) => request.attempt.runId === runId && stages.has(request.attempt.stageId);
  const entries = (await effects.recoveryEntries()).filter(({ request }) => owned(request));
  const unresolved = entries.filter(entry => entry.accepted && entry.receiptStatus === undefined);
  if (unresolved.length) throw new Error(`RECOVERY_EFFECT_OUTCOME_UNRESOLVED:${unresolved.map(({ request }) => request.effectId).join(',')}`);
  const finished = new Set(events.records().flatMap(({ entry }) => entry.schemaVersion === 'lifecycle-event.v2'
    && entry.identity.runId === runId && ['attempt.completed', 'attempt.cancelled', 'attempt.timed_out'].includes(entry.type)
    ? [entry.identity.attemptId] : []));
  const interrupted = entries.filter(({ request, receiptStatus }) =>
    !finished.has(request.attempt.attemptId) && !CHECKPOINT_OPERATIONS.has(request.capability)
      && receiptStatus !== undefined).map(({ request }) => request.effectId);
  if (interrupted.length) throw new Error(`RECOVERY_EXTERNAL_CONTINUATION_REQUIRED:${interrupted.join(',')}`);
}
