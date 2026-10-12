import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { cleanupFixture, persistCleanup, redigest, modeledOwner, observation } from '../../../../tests/verification/reliability/native-cleanup-fixture.mts';
import { envelope } from '../../../../tests/verification/reliability/native-journal-capacity-fixture.mts';
import { interruptedNativeWorkerResult } from '../../../../skills/worker/core/worker/native-result.ts';
import { resolveFailedNativeCleanup } from '../../../../skills/worker/core/worker/native-cleanup-reconciliation.ts';

async function files(root: string): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  for (const entry of await fs.readdir(root, {recursive:true, withFileTypes:true})) {
    if (entry.isFile() && entry.name !== '.write-lock') {
      const file = path.join(entry.parentPath, entry.name); result.set(file, await fs.readFile(file));
    }
  }
  return result;
}
async function fixture(field?: string, differentEffect = false) {
  const f = await cleanupFixture();
  const retry = structuredClone(envelope('fresh-independent-retry'));
  retry.profile = structuredClone(f.cleanup.profile);
  retry.operation = structuredClone(f.cleanup.operation);
  if (differentEffect) retry.operation.values.effectsDigest = `sha256:${'c'.repeat(64)}`;
  redigest(retry);
  if (field) {
    const reference = f.cleanup.operation.values.reconciles as Record<string, unknown>;
    const target = field.startsWith('receipt') ? reference.receipt as Record<string, unknown> : reference;
    target[field] = field === 'claimGeneration' ? Number(target[field]) + 1
      : field.endsWith('Digest') ? `sha256:${'d'.repeat(64)}` : `${target[field]}-foreign`;
    redigest(f.cleanup);
  }
  f.records.set(f.cleanup.attemptId, modeledOwner(f.cleanup));
  f.records.set(retry.attemptId, modeledOwner(retry)); // Coherent ownership even for the foreign-effects candidate.
  const failed = await f.cleanupJournal.withAttempt(f.cleanup, context => f.cleanupJournal.seal(f.cleanup,
    interruptedNativeWorkerResult(f.cleanup, new Date(context.acceptedAt), 'FRESH_FAILED_PREDECESSOR', observation, false)));
  await persistCleanup({...f, cleanup:retry});
  const capability = {journal:f.cleanupJournal, cleanupProfileDigest:f.cleanup.profile.profileDigest,
    reconcile:async () => {throw new Error('RECURSIVE_CLEANUP_FORBIDDEN');},
    resolveFailedCleanup:async () => ({original:f.original, successfulCleanup:retry})};
  return {...f,retry,failed,capability};
}
for (const field of ['envelopeDigest','attemptId','attemptSpecDigest','profileDigest','claimId','claimGeneration','workerId','resultDigest','receiptId','receiptDigest']) {
  test(`fresh predecessor rejects foreign ${field} with coherent ownership`, {timeout:10000}, async () => {
    const f = await fixture(field);
    try { await assert.rejects(resolveFailedNativeCleanup(f.journal,f.owner,f.cleanup,f.failed,f.capability), /RECONCILIATION_BINDING_INVALID/); }
    finally {await f.dispose();}
  });
}
test('fresh coherent retry rejects different effects rather than incidental identity failure', {timeout:10000}, async () => {
  const f = await fixture(undefined,true);
  try {await assert.rejects(resolveFailedNativeCleanup(f.journal,f.owner,f.cleanup,f.failed,f.capability), /RECONCILIATION_PREDECESSOR_INVALID/);}
  finally {await f.dispose();}
});
test('fresh retry checks final ownership counters against real archived process counters', {timeout:10000}, async () => {
  const f = await fixture();
  try {
    const owned = modeledOwner(f.retry); owned.finalObservation = {...observation,maximumTasks:2};
    f.records.set(f.retry.attemptId,owned);
    await assert.rejects(resolveFailedNativeCleanup(f.journal,f.owner,f.cleanup,f.failed,f.capability), /RECONCILIATION_RESULT_UNPROVEN/);
  } finally {await f.dispose();}
});
test('fresh lookup reenters predecessor stripe and repeat keeps every existing file byte unchanged', {timeout:10000}, async () => {
  const f = await fixture();
  try {
    const before = await files(f.root); let lookups = 0;
    const capability = {...f.capability,resolveFailedCleanup:async () => {
      await f.cleanupJournal.withAttempt(f.cleanup, async context => assert.equal(context.newlyAccepted,false));
      lookups++; return {original:f.original,successfulCleanup:f.retry};
    }};
    for (let attempt=0;attempt<2;attempt++) assert.equal(await resolveFailedNativeCleanup(f.journal,f.owner,f.cleanup,f.failed,capability),true);
    assert.equal(lookups,2);
    for (const [file,bytes] of before) assert.deepEqual(await fs.readFile(file),bytes,file);
    assert.equal(f.fenced(),false);
  } finally {await f.dispose();}
});
