import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson } from '@kubeclaw/pipeline-worker-core-contract';
import { recoverNativeWorkerAttempts } from '../../../skills/worker/core/worker/native-attempt-recovery.ts';
import { cleanupFixture, persistCleanup, redigest } from './native-cleanup-fixture.mts';

test('recovery requires its own sealed cleanup archive and preserves the original failed receipt', async () => {
  const f = await cleanupFixture();
  try {
    const original = canonicalJson(await f.journal.readResult(f.original));
    await persistCleanup(f);
    let called = 0;
    const capability = { journal: f.cleanupJournal, cleanupProfileDigest: f.cleanup.profile.profileDigest,
      reconcile: async () => {
        called++;
        await f.journal.withAttempt(f.original, async context => assert.equal(context.newlyAccepted, false));
        return f.cleanup;
      } };
    await recoverNativeWorkerAttempts(f.journal, f.owner, capability);
    await recoverNativeWorkerAttempts(f.journal, f.owner, capability);
    assert.equal(called, 2); assert.equal(f.fenced(), false);
    assert.equal(canonicalJson(await f.journal.readResult(f.original)), original);
  } finally { await f.dispose(); }
});

for (const mode of ['no-hook', 'declined', 'missing-result', 'wrong-profile', 'original-live', 'cleanup-live',
  'missing-original', 'missing-cleanup', 'wrong-reference', 'unknown-key', 'bad-output', 'different-accounting', 'callback-mutation']) {
  test(`cleanup recovery handles ${mode}`, async () => {
    const f = await cleanupFixture();
    try {
      if (mode === 'wrong-reference') {
        (f.cleanup.operation.values.reconciles as Record<string, unknown>).resultDigest = `sha256:${'b'.repeat(64)}`;
        redigest(f.cleanup);
      }
      if (mode === 'unknown-key') { f.cleanup.operation.values.extra = true; redigest(f.cleanup); }
      if (mode !== 'missing-result') await persistCleanup(f,
        mode === 'different-accounting' ? result => {
          result.resources.maximumTasks = 2;
          result.resourceAccounting.observations.maximumTasks = { status: 'observed', value: 2 };
        } : undefined, mode === 'bad-output');
      if (mode === 'original-live') f.records.set(f.original.attemptId, { ...f.records.get(f.original.attemptId)!, phase: 'running' });
      if (mode === 'cleanup-live') f.records.set(f.cleanup.attemptId, { ...f.records.get(f.cleanup.attemptId)!, phase: 'running' });
      if (mode === 'missing-original') f.records.delete(f.original.attemptId);
      if (mode === 'missing-cleanup') f.records.delete(f.cleanup.attemptId);
      const capability = { journal: f.cleanupJournal,
        cleanupProfileDigest: mode === 'wrong-profile' ? `sha256:${'f'.repeat(64)}` : f.cleanup.profile.profileDigest,
        reconcile: async (input: { result: { resultDigest: string } }) => {
          if (mode === 'callback-mutation') input.result.resultDigest = 'mutated';
          return mode === 'declined' ? null : f.cleanup;
        } };
      const run = recoverNativeWorkerAttempts(f.journal, f.owner, mode === 'no-hook' ? undefined : capability);
      if (['no-hook', 'declined', 'callback-mutation'].includes(mode)) await run;
      else await assert.rejects(run, /RECONCILIATION/);
      assert.equal(f.fenced(), mode !== 'callback-mutation');
      assert.deepEqual(await f.journal.readResult(f.original), f.result);
    } finally { await f.dispose(); }
  });
}

for (const field of ['envelopeDigest', 'attemptId', 'attemptSpecDigest', 'profileDigest', 'claimId',
  'claimGeneration', 'workerId', 'resultDigest', 'receiptId', 'receiptDigest']) {
  test(`cleanup cannot reconcile a foreign ${field}`, async () => {
    const f = await cleanupFixture();
    try {
      const reference = f.cleanup.operation.values.reconciles as Record<string, unknown>;
      const target = field.startsWith('receipt') ? reference.receipt as Record<string, unknown> : reference;
      target[field] = field === 'claimGeneration' ? Number(target[field]) + 1
        : field.endsWith('Digest') ? `sha256:${'d'.repeat(64)}` : `${target[field]}-foreign`;
      redigest(f.cleanup);
      await persistCleanup(f);
      await assert.rejects(recoverNativeWorkerAttempts(f.journal, f.owner, {
        journal: f.cleanupJournal, cleanupProfileDigest: f.cleanup.profile.profileDigest,
        reconcile: async () => f.cleanup,
      }), /RECONCILIATION_BINDING_INVALID/);
      assert.equal(f.fenced(), true);
      assert.deepEqual(await f.journal.readResult(f.original), f.result);
    } finally { await f.dispose(); }
  });
}
