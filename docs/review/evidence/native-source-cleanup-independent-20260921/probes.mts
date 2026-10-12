import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cleanupFixture, persistCleanup } from '../../../../tests/verification/reliability/native-cleanup-fixture.mts';
import { recoverNativeWorkerAttempts } from '../../../../skills/worker/core/worker/native-attempt-recovery.ts';
import { validateRecord } from '../../../../skills/worker/core/worker/ownership-state.ts';

async function fixture() {
  const f = await cleanupFixture();
  const previous = f.records.get(f.cleanup.attemptId)!;
  const scopeName = 'worker-00000000-0000-4000-8000-000000000003';
  f.records.set(f.cleanup.attemptId, { ...previous, scopeName,
    binding: { ...previous.binding!, scopeName, inode: 3 } });
  for (const record of f.records.values()) validateRecord(record);
  await persistCleanup(f);
  return f;
}

test('distinct valid modeled lifetimes reconcile without changing original persisted metadata', async () => {
  const f = await fixture();
  try {
    const originalFile = path.join(f.root, 'original', 'metadata', 'records', 'store.json');
    const before = await fs.readFile(originalFile);
    const capability = { journal: f.cleanupJournal, cleanupProfileDigest: f.cleanup.profile.profileDigest,
      reconcile: async (input: { ownership: { finalObservation: unknown } }) => {
        input.ownership.finalObservation = null;
        capability.journal = f.journal;
        capability.cleanupProfileDigest = `sha256:${'f'.repeat(64)}`;
        return f.cleanup;
      } };
    await recoverNativeWorkerAttempts(f.journal, f.owner, capability);
    assert.equal(f.fenced(), false);
    assert.deepEqual(await fs.readFile(originalFile), before);
  } finally { await f.dispose(); }
});

for (const mode of ['abandoned', 'no-binding', 'populated', 'foreign-identity', 'different-counters']) {
  test(`separately sealed success cannot hide ${mode} cleanup ownership`, async () => {
    const f = await fixture();
    try {
      const record = f.records.get(f.cleanup.attemptId)!;
      const changed = mode === 'abandoned' ? { ...record, phase: 'abandoned' as const }
        : mode === 'no-binding' ? { ...record, binding: null }
        : mode === 'populated' ? { ...record, finalObservation: { ...record.finalObservation!, populated: true } }
        : mode === 'foreign-identity' ? { ...record, identity: { ...record.identity, generation: record.identity.generation + 1 } }
        : { ...record, finalObservation: { ...record.finalObservation!, maximumTasks: 2 } };
      f.records.set(f.cleanup.attemptId, changed);
      await assert.rejects(recoverNativeWorkerAttempts(f.journal, f.owner, {
        journal: f.cleanupJournal, cleanupProfileDigest: f.cleanup.profile.profileDigest, reconcile: async () => f.cleanup,
      }), /WORKER_NATIVE_RECONCILIATION_(OWNERSHIP|RESULT)_UNPROVEN/);
      assert.equal(f.fenced(), true);
      assert.deepEqual(await f.journal.readResult(f.original), f.result);
    } finally { await f.dispose(); }
  });
}
