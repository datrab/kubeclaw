import fs from 'node:fs/promises';
import { nativeSourceCleanupOperation, verifyNativeSourceCleanupResult,
  type NativeCleanupReconciliation } from '@kubeclaw/worker-core';
import type { WorkerAttemptEnvelopeV3, WorkerAttemptResultV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { preparationDigest } from './preparation-header.ts';
import { preparationSourceDirectory } from './preparation-source.ts';
import { verifyPreparationGate, removeEmptyPreparationGate } from './preparation-gate.ts';
import { preparationCleanupEnvelope, preparationCleanupProfile } from './preparation-cleanup-envelope.ts';
import { executePreparationCleanup, recoverPreparationCleanup } from './preparation-cleanup-execution.ts';
import type { PreparationCleanupAssociation, PreparationCleanupEffects } from './preparation-cleanup-binding.ts';
import type { PreparationExecutionOptions } from './preparation-execution.ts';
import type { SourceReservation } from './preparation-ledger-state.ts';

async function sourceEffects(options: PreparationExecutionOptions, record: SourceReservation): Promise<PreparationCleanupEffects> {
  if (!record.gate || record.slotReleased || !['staging', 'reserved'].includes(record.phase)) {
    throw new Error('BUSTER_PREPARATION_CLEANUP_INELIGIBLE');
  }
  await verifyPreparationGate(options.command.sourceRoot, record.admissionId, record.gate);
  let data = null;
  try {
    const stat = await fs.lstat(preparationSourceDirectory(options.command.sourceRoot, record.admissionId));
    if (!stat.isDirectory() || stat.uid !== record.slot) throw new Error('BUSTER_PREPARATION_CLEANUP_SOURCE_CHANGED');
    data = { device: stat.dev, inode: stat.ino, uid: stat.uid };
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return { schemaVersion: 'buster-preparation-cleanup-effects.v1', admissionId: record.admissionId,
    originalEnvelopeDigest: preparationDigest(record.envelope), gate: structuredClone(record.gate), data };
}

async function previousQuiescent(options: PreparationExecutionOptions, association: PreparationCleanupAssociation,
  result: WorkerAttemptResultV3): Promise<void> {
  const envelope = association.envelope;
  const owner = await options.owner.record({ workerId: envelope.claim.workerId, attemptId: envelope.attemptId,
    claimId: envelope.claim.claimId, generation: envelope.claim.generation,
    profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest });
  if (owner?.phase === 'disposed' && owner.binding && owner.finalObservation?.populated === false) return;
  const notLaunched = !owner || (['disposed', 'abandoned'].includes(owner.phase)
    && ['WORKER_NATIVE_ALLOCATION_NOT_LAUNCHED', 'WORKER_NATIVE_RESERVATION_NOT_LAUNCHED'].includes(owner.diagnosis ?? ''));
  if (notLaunched && result.cleanup.state === 'not_required') return;
  throw new Error('BUSTER_PREPARATION_CLEANUP_PREDECESSOR_NOT_QUIESCENT');
}

async function releaseSource(options: PreparationExecutionOptions, record: SourceReservation,
  association: PreparationCleanupAssociation): Promise<WorkerAttemptEnvelopeV3> {
  await verifyNativeSourceCleanupResult(options.journal, options.owner, association.envelope);
  await removeEmptyPreparationGate(options.command.sourceRoot, record.admissionId, association.effects.gate);
  await options.ledger.released(record.admissionId);
  return association.envelope;
}

function bindOriginal(association: PreparationCleanupAssociation, original: WorkerAttemptEnvelopeV3,
  result: WorkerAttemptResultV3): void {
  const expected = nativeSourceCleanupOperation(original, result, preparationDigest(association.effects));
  if (preparationDigest(association.envelope.operation) !== preparationDigest(expected)) {
    throw new Error('BUSTER_PREPARATION_CLEANUP_ORIGINAL_CHANGED');
  }
}

async function reconcileSource(options: PreparationExecutionOptions, original: WorkerAttemptEnvelopeV3,
  result: WorkerAttemptResultV3): Promise<WorkerAttemptEnvelopeV3 | null> {
  const record = (await options.ledger.reservations()).find(item => preparationDigest(item.envelope) === preparationDigest(original));
  if (!record || !record.gate || !['staging', 'reserved', 'released'].includes(record.phase)) return null;
  let previous = record.cleanup.at(-1);
  if (previous) {
    bindOriginal(previous, original, result);
    const recovered = await recoverPreparationCleanup(options, previous);
    if (!recovered) {
      await executePreparationCleanup(options, previous);
      return releaseSource(options, record, previous);
    }
    await options.ledger.recordCleanupResult(record.admissionId, preparationDigest(previous.envelope), recovered.resultDigest);
    previous = { ...previous, resultDigest: recovered.resultDigest };
    if (recovered.state === 'completed' && recovered.cleanup.state === 'completed') {
      return releaseSource(options, record, previous);
    }
    await previousQuiescent(options, previous, recovered);
  }
  if (record.slotReleased) return null;
  const effects = previous?.effects ?? await sourceEffects(options, record);
  const settings = structuredClone(options.settings);
  const association: PreparationCleanupAssociation = {
    envelope: preparationCleanupEnvelope(original, result, effects, settings, options.engineContentDigest),
    settings, effects, previousEnvelopeDigest: previous ? preparationDigest(previous.envelope) : null,
    previousResultDigest: previous?.resultDigest ?? null, resultDigest: null,
  };
  await options.ledger.reserveCleanup(record.admissionId, association);
  await executePreparationCleanup(options, association);
  return releaseSource(options, record, association);
}

/** Startup only, while the root parent lifetime fence excludes publication and manual mutation. */
export function preparationCleanupReconciliation(options: PreparationExecutionOptions): NativeCleanupReconciliation {
  return { journal: options.journal,
    cleanupProfileDigest: preparationCleanupProfile(options.engineContentDigest).profileDigest,
    reconcile: ({ envelope, result }) => reconcileSource(options, envelope, result),
    async resolveFailedCleanup({ envelope }) {
      for (const record of await options.ledger.reservations()) {
        const predecessor = record.cleanup.find(item => preparationDigest(item.envelope) === preparationDigest(envelope));
        const successful = record.cleanup.at(-1);
        if (!predecessor || !successful || record.phase !== 'released') continue;
        if (preparationDigest(predecessor.effects) !== preparationDigest(successful.effects)) {
          throw new Error('BUSTER_PREPARATION_CLEANUP_ORIGINAL_CHANGED');
        }
        return { original: record.envelope, successfulCleanup: successful.envelope };
      }
      return null;
    } };
}
