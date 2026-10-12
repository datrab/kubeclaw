import {
  canonicalJson, checkWorkerNativeResultBinding, sha256Digest,
  validateWorkerResourceContractV3, type WorkerAttemptEnvelopeV3, type WorkerAttemptResultV3,
} from '@kubeclaw/pipeline-worker-core-contract';
import type { NativeAttemptJournal } from './native-attempt-journal.ts';
import type { NativeWorkerOwnership } from './native-worker-ownership.ts';
import type { WorkerOwnershipRecord } from './ownership-store.ts';
import { journalIdentity } from './native-journal-state.ts';
import { finalizeNativeWorkerResult } from './native-result.ts';

const contractId = 'kubeclaw.native-source-cleanup@1';
const inputSchemaId = 'native-source-cleanup-input.v1';
const inputSchemaDigest = sha256Digest({ schemaVersion: inputSchemaId,
  fields: ['reconciles', 'effectsDigest'], referenceFields: [
    'envelopeDigest', 'attemptId', 'attemptSpecDigest', 'profileDigest', 'claimId',
    'claimGeneration', 'workerId', 'resultDigest', 'receipt',
  ] });
export const nativeSourceCleanupResultSchema = Object.freeze({
  schemaId: 'native-source-cleanup-result.v1',
  schemaDigest: sha256Digest({ schemaVersion: 'native-source-cleanup-result.v1', fields: ['reconciliationDigest'] }),
});

export interface NativeCleanupReconciliation {
  readonly journal: NativeAttemptJournal;
  readonly cleanupProfileDigest: string;
  /** The role must durably bind this cleanup before launch under its publication fence. */
  reconcile(input: Readonly<{
    envelope: WorkerAttemptEnvelopeV3;
    result: WorkerAttemptResultV3;
    ownership: WorkerOwnershipRecord;
  }>): Promise<WorkerAttemptEnvelopeV3 | null>;
  /** Lookup only, after ordinary recovery; must not launch cleanup of a cleanup. */
  resolveFailedCleanup?(input: Readonly<{
    envelope: WorkerAttemptEnvelopeV3;
    result: WorkerAttemptResultV3;
  }>): Promise<Readonly<{
    original: WorkerAttemptEnvelopeV3;
    successfulCleanup: WorkerAttemptEnvelopeV3;
  }> | null>;
}

/** Fixed source-only proof identity; this never changes the original failed receipt. */
export function nativeSourceCleanupOperation(envelope: WorkerAttemptEnvelopeV3,
  result: WorkerAttemptResultV3, effectsDigest: string): WorkerAttemptEnvelopeV3['operation'] {
  if (!/^sha256:[a-f0-9]{64}$/u.test(effectsDigest)) throw new Error('WORKER_NATIVE_RECONCILIATION_EFFECTS_INVALID');
  return { contractId, inputSchemaId, inputSchemaDigest, values: {
    reconciles: { envelopeDigest: sha256Digest(envelope), attemptId: envelope.attemptId,
      attemptSpecDigest: envelope.attemptSpecDigest, profileDigest: envelope.profile.profileDigest,
      claimId: envelope.claim.claimId, claimGeneration: envelope.claim.generation,
      workerId: envelope.claim.workerId, resultDigest: result.resultDigest,
      receipt: { receiptId: result.receipt.receiptId, receiptDigest: result.receipt.receiptDigest } },
    effectsDigest,
  } };
}

async function quiescentOwner(owner: NativeWorkerOwnership, envelope: WorkerAttemptEnvelopeV3): Promise<WorkerOwnershipRecord> {
  const identity = journalIdentity(envelope);
  const record = await owner.record(identity);
  if (!record || canonicalJson(record.identity) !== canonicalJson(identity) || record.phase !== 'disposed'
    || record.binding === null || record.finalObservation === null || record.finalObservation.populated) {
    throw new Error('WORKER_NATIVE_RECONCILIATION_OWNERSHIP_UNPROVEN');
  }
  return record;
}

function validateCleanupEnvelope(cleanup: WorkerAttemptEnvelopeV3, envelope: WorkerAttemptEnvelopeV3,
  result: WorkerAttemptResultV3, profileDigest: string): void {
  validateWorkerResourceContractV3('workerAttemptEnvelope', cleanup);
  const effectsDigest = cleanup.operation.values.effectsDigest;
  if (typeof effectsDigest !== 'string' || cleanup.profile.profileDigest !== profileDigest
    || cleanup.attemptId === envelope.attemptId || cleanup.claim.claimId === envelope.claim.claimId
    || cleanup.attemptSpecDigest === envelope.attemptSpecDigest
    || canonicalJson(cleanup.operation) !== canonicalJson(nativeSourceCleanupOperation(envelope, result, effectsDigest))) {
    throw new Error('WORKER_NATIVE_RECONCILIATION_BINDING_INVALID');
  }
}

/** Role-side durable release must follow these same archived-result and ownership checks. */
export async function verifyNativeSourceCleanupResult(journal: NativeAttemptJournal, owner: NativeWorkerOwnership,
  cleanup: WorkerAttemptEnvelopeV3): Promise<void> {
  const result = await journal.readResult(cleanup);
  const archived = await journal.readProcess(cleanup);
  const ownership = await quiescentOwner(owner, cleanup);
  if (!result || !archived || archived.process.fault !== null || archived.process.exitCode !== 0
    || archived.process.signal !== null || result.state !== 'completed' || result.cleanup.state !== 'completed'
    || !checkWorkerNativeResultBinding(cleanup, result).ok
    || canonicalJson(ownership.finalObservation) !== canonicalJson(archived.process.resources)) {
    throw new Error('WORKER_NATIVE_RECONCILIATION_RESULT_UNPROVEN');
  }
  const expected = { ...nativeSourceCleanupResultSchema,
    values: { reconciliationDigest: sha256Digest(cleanup.operation.values) } };
  if (canonicalJson(result.specialistResult) !== canonicalJson(expected)) {
    throw new Error('WORKER_NATIVE_RECONCILIATION_RESULT_BINDING_INVALID');
  }
  // A separately sealed success cannot replace an invalid or different process
  // output. Reuse the actual executor finalizer, including measured accounting.
  await journal.withAttempt(cleanup, async context => {
    const recovered = finalizeNativeWorkerResult(cleanup, archived.process,
      new Date(context.acceptedAt), new Date(archived.completedAt));
    if (recovered.resultDigest !== result.resultDigest) {
      throw new Error('WORKER_NATIVE_RECONCILIATION_ARCHIVE_MISMATCH');
    }
  });
}

/** Called outside the original journal stripe. A failure leaves admission fenced. */
export async function reconcileNativeCleanup(owner: NativeWorkerOwnership, envelope: WorkerAttemptEnvelopeV3,
  result: WorkerAttemptResultV3, capability: NativeCleanupReconciliation): Promise<boolean> {
  if (envelope.operation.contractId === contractId || result.cleanup.state !== 'failed'
    || !checkWorkerNativeResultBinding(envelope, result).ok) {
    throw new Error('WORKER_NATIVE_RECONCILIATION_ORIGINAL_INVALID');
  }
  const journal = capability.journal;
  const profileDigest = capability.cleanupProfileDigest;
  const ownership = await quiescentOwner(owner, envelope);
  const candidate = await capability.reconcile(structuredClone({ envelope, result, ownership }));
  if (candidate === null) return false;
  const cleanup = structuredClone(candidate);
  validateCleanupEnvelope(cleanup, envelope, result, profileDigest);
  await verifyNativeSourceCleanupResult(journal, owner, cleanup);
  return true;
}


/** A failed cleanup receipt remains failed; a separate exact proof resolves its source effect. */
export async function resolveFailedNativeCleanup(originalJournal: NativeAttemptJournal,
  owner: NativeWorkerOwnership, failed: WorkerAttemptEnvelopeV3,
  failedResult: WorkerAttemptResultV3, capability: NativeCleanupReconciliation): Promise<boolean> {
  if (failed.operation.contractId !== contractId || failedResult.cleanup.state !== 'failed'
    || !checkWorkerNativeResultBinding(failed, failedResult).ok) {
    throw new Error('WORKER_NATIVE_RECONCILIATION_PREDECESSOR_INVALID');
  }
  const { resolveFailedCleanup, journal, cleanupProfileDigest } = capability;
  if (!resolveFailedCleanup) return false;
  const candidate = await resolveFailedCleanup(structuredClone({ envelope: failed, result: failedResult }));
  if (candidate === null) return false;
  const { original, successfulCleanup } = structuredClone(candidate);
  validateWorkerResourceContractV3('workerAttemptEnvelope', original);
  const originalResult = await originalJournal.readResult(original);
  if (original.operation.contractId === contractId || !originalResult || originalResult.cleanup.state !== 'failed') {
    throw new Error('WORKER_NATIVE_RECONCILIATION_ORIGINAL_INVALID');
  }
  validateCleanupEnvelope(failed, original, originalResult, cleanupProfileDigest);
  validateCleanupEnvelope(successfulCleanup, original, originalResult, cleanupProfileDigest);
  if (failed.operation.values.effectsDigest !== successfulCleanup.operation.values.effectsDigest
    || failed.attemptId === successfulCleanup.attemptId
    || failed.claim.claimId === successfulCleanup.claim.claimId) {
    throw new Error('WORKER_NATIVE_RECONCILIATION_PREDECESSOR_INVALID');
  }
  await quiescentOwner(owner, original);
  await quiescentOwner(owner, failed);
  await verifyNativeSourceCleanupResult(journal, owner, successfulCleanup);
  return true;
}
