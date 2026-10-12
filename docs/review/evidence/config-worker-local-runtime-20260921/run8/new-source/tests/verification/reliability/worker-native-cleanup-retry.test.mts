import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { canonicalJson, sha256Digest, type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { NativeAttemptJournal } from '../../../skills/worker/core/worker/native-attempt-journal.ts';
import { recoverNativeWorkerAttempts } from '../../../skills/worker/core/worker/native-attempt-recovery.ts';
import { interruptedNativeWorkerResult } from '../../../skills/worker/core/worker/native-result.ts';
import { cleanupFixture, modeledOwner, observation, persistCleanup, redigest } from './native-cleanup-fixture.mts';
import { envelope, limits } from './native-journal-capacity-fixture.mts';

async function retryFixture(cleanupFirst: boolean) {
  const f = await cleanupFixture();
  const journal = new NativeAttemptJournal(path.join(f.root, 'shared'), limits);
  const copyOriginal = () => journal.withAttempt(f.original, () => journal.seal(f.original, f.result));
  if (!cleanupFirst) await copyOriginal();
  const failedResult = await journal.withAttempt(f.cleanup, context => journal.seal(f.cleanup,
    interruptedNativeWorkerResult(f.cleanup, new Date(context.acceptedAt), 'TEST_CLEANUP_INTERRUPTED', observation, false)));
  if (cleanupFirst) await copyOriginal();
  const retry = structuredClone(envelope('reconciliation-successful-retry'));
  retry.profile = structuredClone(f.cleanup.profile);
  retry.operation = structuredClone(f.cleanup.operation);
  redigest(retry);
  f.records.set(retry.attemptId, modeledOwner(retry));
  return { ...f, journal, failedResult, retry };
}

type RetryFixture = Awaited<ReturnType<typeof retryFixture>>;
async function sealRetry(f: RetryFixture, cleanup: WorkerAttemptEnvelopeV3 = f.retry, corrupt = false) {
  const existing = await f.journal.readResult(cleanup);
  return existing ?? persistCleanup({ ...f, cleanup, cleanupJournal: f.journal }, undefined, corrupt);
}

for (const cleanupFirst of [false, true]) {
  test(`same-journal retry resolves immutable predecessor, cleanup inserted first=${cleanupFirst}`, async () => {
    const f = await retryFixture(cleanupFirst);
    try {
      const original = canonicalJson(await f.journal.readResult(f.original));
      const predecessor = canonicalJson(await f.journal.readResult(f.cleanup));
      let ordinaryRecovered = false;
      let lookups = 0;
      const capability = { journal: f.journal, cleanupProfileDigest: f.cleanup.profile.profileDigest,
        reconcile: async () => { await sealRetry(f); ordinaryRecovered = true; return f.retry; },
        resolveFailedCleanup: async (input: { envelope: WorkerAttemptEnvelopeV3 }) => {
          assert.equal(ordinaryRecovered, true);
          assert.equal(sha256Digest(input.envelope), sha256Digest(f.cleanup));
          lookups++;
          return { original: f.original, successfulCleanup: f.retry };
        } };
      await recoverNativeWorkerAttempts(f.journal, f.owner, capability);
      await recoverNativeWorkerAttempts(f.journal, f.owner, capability);
      assert.equal(lookups, 2);
      assert.equal(f.fenced(), false);
      assert.equal(canonicalJson(await f.journal.readResult(f.original)), original);
      assert.equal(canonicalJson(await f.journal.readResult(f.cleanup)), predecessor);
    } finally { await f.dispose(); }
  });
}

for (const mode of ['missing-lookup', 'missing-association', 'wrong-effect', 'wrong-original',
  'predecessor-as-success', 'missing-retry', 'failed-retry', 'unarchived-retry', 'bad-output', 'live-predecessor', 'live-retry']) {
  test(`same-journal cleanup resolution rejects ${mode}`, async () => {
    const f = await retryFixture(true);
    try {
      const successor = structuredClone(f.retry);
      if (mode === 'wrong-effect') { successor.operation.values.effectsDigest = `sha256:${'b'.repeat(64)}`; redigest(successor); f.records.set(successor.attemptId, modeledOwner(successor)); }
      if (mode === 'live-predecessor') f.records.set(f.cleanup.attemptId, { ...modeledOwner(f.cleanup), phase: 'running' });
      if (mode === 'live-retry') f.records.set(successor.attemptId, { ...modeledOwner(successor), phase: 'running' });
      if (mode === 'failed-retry') await f.journal.withAttempt(successor, context => f.journal.seal(successor,
        interruptedNativeWorkerResult(successor, new Date(context.acceptedAt), 'TEST_RETRY_FAILED', observation, false)));
      else if (mode === 'unarchived-retry') {
        const completed = await persistCleanup({ ...f, cleanup: successor });
        await f.journal.withAttempt(successor, () => f.journal.seal(successor, completed));
      } else if (mode !== 'missing-retry') await sealRetry(f, successor, mode === 'bad-output');
      const capability = { journal: f.journal, cleanupProfileDigest: f.cleanup.profile.profileDigest,
        // A declined ordinary recovery already keeps admission fenced. The deferred
        // lookup must still reject invalid evidence rather than accepting it.
        reconcile: async () => null,
        ...(mode === 'missing-lookup' ? {} : { resolveFailedCleanup: async () => mode === 'missing-association' ? null : ({
          original: mode === 'wrong-original' ? successor : f.original,
          successfulCleanup: mode === 'predecessor-as-success' ? f.cleanup : successor,
        }) }) };
      const recovery = recoverNativeWorkerAttempts(f.journal, f.owner, capability);
      if (['missing-lookup', 'missing-association'].includes(mode)) await recovery;
      else await assert.rejects(recovery, /RECONCILIATION/);
      assert.equal(f.fenced(), true);
      assert.deepEqual(await f.journal.readResult(f.cleanup), f.failedResult);
      assert.deepEqual(await f.journal.readResult(f.original), f.result);
    } finally { await f.dispose(); }
  });
}
