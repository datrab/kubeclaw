import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256Digest, type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import type { WorkerOwnershipIdentity } from './ownership-store.ts';
import type { NativeWorkerProcessResult } from './native-worker-process.ts';
import { identityValid, exact } from './ownership-state.ts';
import { validateNativeWorkerResourceObservation } from './native-resource-observation.ts';

export interface NativeAttemptJournalLimits {
  readonly maximumRecords: number;
  readonly maximumStateBytes: number;
  readonly maximumTotalBytes: number;
  readonly maximumInputBytes: number;
  readonly maximumOutputBytes: number;
  readonly maximumResultBytes: number;
}

interface BlobReference { readonly digest: string; readonly sizeBytes: number }
type ProcessRecord = Omit<NativeWorkerProcessResult, 'stdout' | 'stderr'> & { stdout: BlobReference; stderr: BlobReference };
export interface NativeAttemptJournalState {
  readonly schemaVersion: 'native-attempt-journal.v1';
  readonly identity: WorkerOwnershipIdentity;
  readonly envelopeDigest: string;
  readonly envelope: BlobReference;
  readonly acceptedAt: string;
  readonly reservationBytes: number;
  readonly process: ProcessRecord | null;
  readonly processCompletedAt: string | null;
  readonly result: BlobReference | null;
}

export function journalIdentity(envelope: WorkerAttemptEnvelopeV3): WorkerOwnershipIdentity {
  return { workerId: envelope.claim.workerId, attemptId: envelope.attemptId, claimId: envelope.claim.claimId,
    generation: envelope.claim.generation, profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest };
}

export function journalKey(envelope: WorkerAttemptEnvelopeV3): string {
  return sha256Digest([envelope.claim.workerId, envelope.attemptId, envelope.claim.generation]);
}

function blobReference(value: unknown): void {
  exact(value, ['digest', 'sizeBytes']);
  if (typeof value.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value.digest)
    || !Number.isSafeInteger(value.sizeBytes) || Number(value.sizeBytes) < 0) throw new Error('WORKER_NATIVE_JOURNAL_BLOB_INVALID');
}

export function validateJournalState(value: unknown): asserts value is NativeAttemptJournalState {
  exact(value, ['schemaVersion', 'identity', 'envelopeDigest', 'envelope', 'acceptedAt', 'reservationBytes', 'process', 'processCompletedAt', 'result']);
  if (value.schemaVersion !== 'native-attempt-journal.v1' || typeof value.acceptedAt !== 'string'
    || !Number.isFinite(Date.parse(value.acceptedAt)) || !Number.isSafeInteger(value.reservationBytes) || Number(value.reservationBytes) < 1) {
    throw new Error('WORKER_NATIVE_JOURNAL_STATE_INVALID');
  }
  identityValid(value.identity);
  blobReference(value.envelope);
  if (value.envelopeDigest !== (value.envelope as BlobReference).digest) throw new Error('WORKER_NATIVE_JOURNAL_ENVELOPE_DIGEST_INVALID');
  if (value.result !== null) blobReference(value.result);
  if (value.process !== null) {
    validateProcess(value.process);
    if (typeof value.processCompletedAt !== 'string' || !Number.isFinite(Date.parse(value.processCompletedAt))) throw new Error('WORKER_NATIVE_JOURNAL_COMPLETION_TIME_INVALID');
  } else if (value.processCompletedAt !== null) throw new Error('WORKER_NATIVE_JOURNAL_COMPLETION_TIME_INVALID');
}

function validateProcess(value: unknown): void {
  exact(value, ['schemaVersion', 'stdout', 'stderr', 'exitCode', 'signal', 'fault', 'resources']);
  if (value.schemaVersion !== 'worker-native-process-result.v1') throw new Error('WORKER_NATIVE_JOURNAL_PROCESS_INVALID');
  blobReference(value.stdout); blobReference(value.stderr);
  validateNativeWorkerResourceObservation(value.resources);
  if (value.resources.populated) throw new Error('WORKER_NATIVE_JOURNAL_PROCESS_NOT_QUIESCENT');
  if (value.exitCode !== null && (!Number.isInteger(value.exitCode) || Number(value.exitCode) < 0 || Number(value.exitCode) > 255)) throw new Error('WORKER_NATIVE_JOURNAL_EXIT_INVALID');
  if (value.exitCode !== 0 && value.fault === null) throw new Error('WORKER_NATIVE_JOURNAL_MISSING_PROCESS_FAILURE');
  for (const key of ['signal', 'fault']) {
    if (value[key] !== null && (typeof value[key] !== 'string' || value[key].length < 1 || value[key].length > 4096)) throw new Error('WORKER_NATIVE_JOURNAL_FAULT_INVALID');
  }
}

/** Count actual retained bytes, including crash leftovers, before new admission. */
export async function usedJournalBytes(root: string): Promise<number> {
  let total = 0;
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { pending.push(file); continue; }
      if (!entry.isFile()) throw new Error('WORKER_NATIVE_JOURNAL_PATH_INVALID');
      total += await retainedFileSize(file);
      if (!Number.isSafeInteger(total)) throw new Error('WORKER_NATIVE_JOURNAL_CAPACITY_EXCEEDED');
    }
  }
  return total;
}

async function retainedFileSize(file: string): Promise<number> {
  try { return (await fs.lstat(file)).size; }
  catch (error) {
    // Atomic durable writes may unlink their temporary name during this scan.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}
