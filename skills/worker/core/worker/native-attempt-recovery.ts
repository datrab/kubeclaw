import { canonicalJson, type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import type { WorkerAttemptResultV3 } from '@kubeclaw/pipeline-worker-core-contract';
import type { NativeAttemptJournal } from './native-attempt-journal.ts';
import type { NativeWorkerOwnership } from './native-worker-ownership.ts';
import { journalIdentity } from './native-journal-state.ts';
import { finalizeNativeWorkerResult, interruptedNativeWorkerResult } from './native-result.ts';
import { reconcileNativeCleanup, resolveFailedNativeCleanup, type NativeCleanupReconciliation } from './native-cleanup-reconciliation.ts';

/** Called only after native ownership recovery, before exposing HTTP admission. */
export async function recoverNativeWorkerAttempts(journal: NativeAttemptJournal, owner: NativeWorkerOwnership,
  reconciliation?: NativeCleanupReconciliation): Promise<void> {
  try {
    // The accepted journal is already bounded by its existing record/state limits.
    // Defer only failed cleanup rows so an earlier insertion cannot prevent the
    // original operation from producing its separately owned retry proof.
    const deferred: Array<{ envelope: WorkerAttemptEnvelopeV3; result: WorkerAttemptResultV3 }> = [];
    for await (const envelope of journal.acceptedEnvelopes()) {
      const result = await journal.withAttempt(envelope, async context => {
        const cached = await journal.readResult(envelope);
        if (cached) return cached;
        const recovered = await recoverNativeAttempt(journal, owner, envelope, new Date(context.acceptedAt), false);
        if (!recovered) throw new Error('WORKER_NATIVE_JOURNAL_RECOVERY_REQUIRED');
        return journal.seal(envelope, recovered);
      });
      if (result.cleanup.state === 'failed' && envelope.operation.contractId === 'kubeclaw.native-source-cleanup@1') {
        deferred.push({ envelope, result });
        continue;
      }
      if (result.cleanup.state === 'failed'
        && (!reconciliation || !await reconcileNativeCleanup(owner, envelope, result, reconciliation))) owner.fenceAdmission();
    }
    for (const { envelope, result } of deferred) {
      if (!reconciliation || !await resolveFailedNativeCleanup(journal, owner, envelope, result, reconciliation)) {
        owner.fenceAdmission();
      }
    }
  } catch (error) { owner.fenceAdmission(); throw error; }
}

export async function recoverNativeAttempt(journal: NativeAttemptJournal, ownership: NativeWorkerOwnership, envelope: WorkerAttemptEnvelopeV3,
  started: Date, newlyAccepted: boolean): Promise<WorkerAttemptResultV3 | null> {
  const owner = await ownership.record(journalIdentity(envelope));
  const archived = await journal.readProcess(envelope);
  if (archived) {
    if (!owner || owner.phase !== 'disposed' || owner.finalObservation === null
      || canonicalJson(owner.finalObservation) !== canonicalJson(archived.process.resources)) {
      throw new Error('WORKER_NATIVE_JOURNAL_OWNERSHIP_UNPROVEN');
    }
    return finalizeNativeWorkerResult(envelope, archived.process, started, new Date(archived.completedAt));
  }
  if (newlyAccepted && !owner) return null;
  if (owner && !['disposed', 'abandoned'].includes(owner.phase)) throw new Error('WORKER_NATIVE_RECOVERY_NOT_QUIESCENT');
  // The durable journal admission precedes ownership reservation. With intact
  // stores, a missing owner means no launch crossed that boundary.
  const notLaunched = !owner || ['WORKER_NATIVE_ALLOCATION_NOT_LAUNCHED', 'WORKER_NATIVE_RESERVATION_NOT_LAUNCHED'].includes(owner.diagnosis ?? '');
  return interruptedNativeWorkerResult(envelope, started, 'WORKER_NATIVE_INTERRUPTED_RESULT_UNAVAILABLE', owner?.finalObservation ?? null, notLaunched);
}
