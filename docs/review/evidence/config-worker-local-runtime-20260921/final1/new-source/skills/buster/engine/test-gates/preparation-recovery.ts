import type { WorkerOwnershipRecord } from '@kubeclaw/worker-core';
import type { WorkerAttemptResultV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { assertPreparedSource, preparationDigest } from './preparation-header.ts';
import { removeEmptyPreparationGate, retainPreparationGate, publishPreparationGate } from './preparation-gate.ts';
import { assertStagedInput, type StagedAdmission } from './preparation-input.ts';
import type { PreparedSource } from './preparation-source.ts';
import type { PreparationExecutionOptions } from './preparation-execution.ts';
import type { SourceReservation } from './preparation-ledger-state.ts';

async function reclaimEmpty(options: PreparationExecutionOptions, record: SourceReservation,
  result: WorkerAttemptResultV3): Promise<void> {
  if (!record.gate) throw new Error('BUSTER_PREPARATION_EMPTY_GATE_PROOF_INVALID');
  await options.ledger.beginEmptyGateReclaim(record.admissionId, preparationDigest(result));
  await removeEmptyPreparationGate(options.command.sourceRoot, record.admissionId, record.gate);
  await options.ledger.released(record.admissionId);
}

async function restoreCompleted(options: PreparationExecutionOptions, record: SourceReservation,
  result: WorkerAttemptResultV3): Promise<void> {
  if (!record.gate) throw new Error('BUSTER_PREPARATION_RECOVERY_REQUIRED');
  if (record.phase === 'empty-gate-reclaiming') {
    if (preparationDigest(result) !== record.emptyGateResultDigest) throw new Error('BUSTER_PREPARATION_EMPTY_GATE_PROOF_INVALID');
    await reclaimEmpty(options, record, result);
    return;
  }
  if (record.phase === 'staging') {
    await restoreStaging(options, record, result);
    return;
  }
  if (!['reserved', 'prepared', 'published'].includes(record.phase)
    || result.specialistResult?.schemaId !== 'buster-preparation-result.v1') {
    throw new Error('BUSTER_PREPARATION_RECOVERY_REQUIRED');
  }
  const prepared = result.specialistResult.values as unknown as PreparedSource;
  assertPreparedSource(prepared.source, prepared.job);
  if (prepared.source.admissionId !== record.admissionId
    || prepared.source.attemptSpecDigest !== record.attemptSpecDigest
    || prepared.source.preparationUid !== record.slot) throw new Error('BUSTER_PREPARATION_RESULT_IDENTITY_INVALID');
  await options.ledger.prepared(prepared.source);
  await options.ledger.published(prepared.source);
  await publishPreparationGate(options.command.sourceRoot, record.admissionId, record.gate);
  await options.ledger.releasePublishedSlot(prepared.source);
}

async function restoreStaging(options: PreparationExecutionOptions, record: SourceReservation,
  result: WorkerAttemptResultV3): Promise<void> {
  if (record.input === null && result.specialistResult?.schemaId === 'buster-declined-input-result.v1'
    && preparationDigest(result.specialistResult.values) === preparationDigest({ declined: true })) {
    await reclaimEmpty(options, record, result);
    return;
  }
  if (!record.gate || result.specialistResult?.schemaId !== 'buster-staged-input-result.v1') {
    throw new Error('BUSTER_PREPARATION_RECOVERY_REQUIRED');
  }
  const staged = result.specialistResult.values as unknown as StagedAdmission;
  assertStagedInput(staged.input, staged.job);
  if (preparationDigest(staged) !== preparationDigest(record.input)) throw new Error('BUSTER_PREPARATION_INPUT_BINDING_INVALID');
  await retainPreparationGate(options.command.sourceRoot, record.admissionId, record.gate);
  await options.ledger.retainInput(staged);
}


function canReclaimUnlaunched(record: SourceReservation, result: WorkerAttemptResultV3 | null,
  owner: WorkerOwnershipRecord | null): boolean {
  const neverLaunched = !owner || (['disposed', 'abandoned'].includes(owner.phase)
    && ['WORKER_NATIVE_ALLOCATION_NOT_LAUNCHED', 'WORKER_NATIVE_RESERVATION_NOT_LAUNCHED'].includes(owner.diagnosis ?? ''));
  return record.gate !== null && ['staging', 'reserved', 'empty-gate-reclaiming'].includes(record.phase)
    && record.input === null && result?.cleanup.state === 'not_required' && neverLaunched;
}

function canReclaimCompletedFailure(record: SourceReservation, result: WorkerAttemptResultV3 | null,
  owner: WorkerOwnershipRecord | null): boolean {
  // A validation/prepare failure may allocate no source. The marker-only
  // remover still rejects every host-created or foreign filesystem entry.
  return record.gate !== null && ['staging', 'reserved', 'empty-gate-reclaiming'].includes(record.phase)
    && result !== null && result.state !== 'completed' && result.cleanup.state === 'completed'
    && owner?.phase === 'disposed' && owner.finalObservation?.populated === false;
}

async function recoverReservation(options: PreparationExecutionOptions, record: SourceReservation): Promise<void> {
  const envelope = record.envelope;
  const result = await options.journal.readResult(envelope);
  const owner = await options.owner.record({ workerId: envelope.claim.workerId, attemptId: envelope.attemptId,
    claimId: envelope.claim.claimId, generation: envelope.claim.generation,
    profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest });
  if (canReclaimUnlaunched(record, result, owner) || canReclaimCompletedFailure(record, result, owner)) {
    await reclaimEmpty(options, record, result!);
    return;
  }
  if (!record.gate || !result || result.state !== 'completed' || result.cleanup.state !== 'completed'
    || owner?.phase !== 'disposed' || owner.finalObservation?.populated !== false) {
    throw new Error('BUSTER_PREPARATION_RECOVERY_REQUIRED');
  }
  await restoreCompleted(options, record, result);
}

/** Resume only positively bound completed phases; uncertain effects remain charged and fenced. */
export async function recoverPreparationLedger(options: PreparationExecutionOptions): Promise<void> {
  try {
    for (const record of await options.ledger.reservations()) {
      if (!record.slotReleased) await recoverReservation(options, record);
    }
  } catch (error) {
    options.owner.fenceAdmission();
    throw error;
  }
}
