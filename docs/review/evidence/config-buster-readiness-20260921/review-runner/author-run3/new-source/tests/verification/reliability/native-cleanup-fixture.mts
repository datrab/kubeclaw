import fs from 'node:fs/promises';
import path from 'node:path';
import { envelope, limits, temporary } from './native-journal-capacity-fixture.mts';
import { canonicalJson, sha256Digest, workerAttemptSpecDigest, workerProfileDigest,
  workerAttemptResultDigest, type WorkerAttemptEnvelopeV3, type WorkerAttemptResultV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { NativeAttemptJournal } from '../../../skills/worker/core/worker/native-attempt-journal.ts';
import { NativeWorkerOutputSpool } from '../../../skills/worker/core/worker/native-output-spool.ts';
import { interruptedNativeWorkerResult, finalizeNativeWorkerResult } from '../../../skills/worker/core/worker/native-result.ts';
import { nativeSourceCleanupOperation, nativeSourceCleanupResultSchema } from '../../../skills/worker/core/worker/native-cleanup-reconciliation.ts';
import { journalIdentity } from '../../../skills/worker/core/worker/native-journal-state.ts';
import type { NativeWorkerOwnership } from '../../../skills/worker/core/worker/native-worker-ownership.ts';
import type { WorkerOwnershipRecord } from '../../../skills/worker/core/worker/ownership-store.ts';

// Ownership is explicitly modeled. Journals, locks, output and sealed bytes are real.
export const observation = { unit: 'linux-tasks' as const, cpuTimeMicroseconds: 1200,
  maximumMemoryBytes: 4096, maximumTasks: 1, populated: false, oomKills: 0, taskLimitHits: 0 };
export function modeledOwner(input: WorkerAttemptEnvelopeV3): WorkerOwnershipRecord {
  const identity = sha256Digest(input.attemptId).slice(7, 39);
  const scopeName = `worker-${identity.slice(0, 8)}-${identity.slice(8, 12)}-${identity.slice(12, 16)}-${identity.slice(16, 20)}-${identity.slice(20)}`;
  return { identity: journalIdentity(input), scopeName, revision: 6, phase: 'disposed', diagnosis: null,
    binding: { scopeName, bootId: '00000000-0000-4000-8000-000000000002', device: 1, inode: Number.parseInt(identity.slice(0, 8), 16) + 1 },
    finalObservation: structuredClone(observation), topology: { kind: 'legacy-leaf', children: [] } };
}
export function redigest(input: WorkerAttemptEnvelopeV3): void {
  input.profile.profileDigest = workerProfileDigest(input.profile);
  input.attemptSpecDigest = workerAttemptSpecDigest(input);
}
export async function cleanupFixture() {
  const root = await temporary();
  const original = structuredClone(envelope('reconciliation-original'));
  const journal = new NativeAttemptJournal(path.join(root, 'original'), limits);
  const result = await journal.withAttempt(original, context => journal.seal(original,
    interruptedNativeWorkerResult(original, new Date(context.acceptedAt), 'TEST_EXTERNAL_CLEANUP', observation, false)));
  const cleanup = structuredClone(envelope('reconciliation-cleanup'));
  cleanup.operation = nativeSourceCleanupOperation(original, result, `sha256:${'a'.repeat(64)}`);
  cleanup.profile.engine.contractId = cleanup.operation.contractId;
  redigest(cleanup);
  const cleanupJournal = new NativeAttemptJournal(path.join(root, 'cleanup'), limits);
  const records = new Map<string, WorkerOwnershipRecord>([
    [original.attemptId, modeledOwner(original)], [cleanup.attemptId, modeledOwner(cleanup)],
  ]);
  let fenced = false;
  const owner = { record: async (identity: { attemptId: string }) => structuredClone(records.get(identity.attemptId) ?? null),
    fenceAdmission: () => { fenced = true; } } as unknown as NativeWorkerOwnership;
  return { root, original, journal, result, cleanup, cleanupJournal, records, owner,
    fenced: () => fenced, dispose: () => fs.rm(root, { recursive: true, force: true }) };
}
export type CleanupFixture = Awaited<ReturnType<typeof cleanupFixture>>;

export async function persistCleanup(fixture: CleanupFixture,
  mutate?: (result: WorkerAttemptResultV3) => void, corruptOutput = false) {
  const { cleanup, cleanupJournal } = fixture;
  return cleanupJournal.withAttempt(cleanup, async context => {
    const started = new Date(context.acceptedAt);
    const provisional = interruptedNativeWorkerResult(cleanup, started, 'TEST_PLACEHOLDER', observation, false);
    provisional.state = 'completed'; provisional.error = null; provisional.summary = 'Source reconciled';
    provisional.cleanup = { state: 'completed', summary: null }; provisional.exitCode = 0;
    provisional.specialistResult = { ...nativeSourceCleanupResultSchema,
      values: { reconciliationDigest: sha256Digest(cleanup.operation.values) } };
    provisional.resources.resultBytes = Buffer.byteLength(JSON.stringify(provisional.specialistResult));
    provisional.resultDigest = workerAttemptResultDigest(provisional);
    const stdout = Buffer.from(corruptOutput ? 'invalid-output' : canonicalJson(provisional));
    const process = { schemaVersion: 'worker-native-process-result.v1' as const, stdout, stderr: Buffer.alloc(0),
      exitCode: 0, signal: null, fault: null, resources: structuredClone(observation) };
    const spool = await NativeWorkerOutputSpool.create(context.outputRoot, limits.maximumOutputBytes);
    await spool.append('stdout', stdout); await spool.close();
    const completed = new Date();
    await cleanupJournal.recordProcess(cleanup, process, completed);
    const sealed = corruptOutput ? provisional : finalizeNativeWorkerResult(cleanup, process, started, completed);
    mutate?.(sealed); sealed.resultDigest = workerAttemptResultDigest(sealed);
    return cleanupJournal.seal(cleanup, sealed);
  });
}
