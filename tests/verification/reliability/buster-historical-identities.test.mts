import assert from 'node:assert/strict';
import test from 'node:test';
import { assertHistoricalImportDescriptor, assertHistoricalImportReceipt } from '../../../skills/buster/engine/test-gates/preparation-historical-reference.ts';
import { assertHistoricalImmutableTreeObservation, assertHistoricalImmutableRuntimeObservation } from '../../../skills/buster/engine/test-gates/preparation-historical-source.ts';

const digest = `sha256:${'a'.repeat(64)}`;
const descriptor = { schemaVersion: 'buster-historical-import-descriptor.v1', originalStoreDigest: digest,
  originalStoreBytes: 100, originalStoreDevice: 1, originalStoreInode: 2 };
const receipt = { schemaVersion: 'buster-historical-import-receipt.v1', importId: 'a'.repeat(32), descriptor,
  preparationUid: 1003, attemptSpecDigest: digest, recordCount: 1, wireCount: 1, wireBytes: 100,
  manifestDigest: digest, initialV2StoreDigest: digest, nativeResultDigest: digest };
const filesystemUuid = '00000000-0000-4000-8000-000000000001';
const observation = { filesystemUuid, schemaVersion: 'buster-legacy-immutable-tree.v1', device: 1, inode: 3, mountId: 4,
  inventoryDigest: digest, store: { device: 1, inode: 2, bytes: 100, digest },
  bytes: 100, entries: 3, resultBytes: 0, resultEntries: 0 };

// Decoder-only fixtures: neither these values nor a checksum authorizes migration.
for (const row of [
  { name: 'historical descriptor', value: descriptor, validate: assertHistoricalImportDescriptor,
    fields: ['originalStoreDigest', 'originalStoreBytes', 'originalStoreDevice', 'originalStoreInode'] },
  { name: 'historical group receipt', value: receipt, validate: assertHistoricalImportReceipt,
    fields: ['importId', 'attemptSpecDigest', 'manifestDigest', 'initialV2StoreDigest', 'nativeResultDigest', 'recordCount', 'wireCount', 'wireBytes'] },
  { name: 'immutable observation', value: observation,
    validate: (value: unknown) => assertHistoricalImmutableTreeObservation(value, 100, 3),
    fields: ['filesystemUuid', 'inventoryDigest', 'device', 'inode', 'mountId', 'bytes', 'entries', 'resultBytes', 'resultEntries'] },
]) {
  test(`${row.name} accepts its exact shape and refuses JSON identity coercion`, () => {
    assert.doesNotThrow(() => row.validate(row.value));
    for (const field of row.fields) {
      const value = row.value as Record<string, unknown>;
      for (const replacement of [[value[field]], null, {}, true]) {
        assert.throws(() => row.validate({ ...value, [field]: replacement }), /BUSTER_HISTORICAL/);
      }
    }
    assert.throws(() => row.validate({ ...row.value, extra: true }), /BUSTER_HISTORICAL/);
  });
}
test('immutable observation refuses nested coercion, inconsistent totals and insufficient caller limits', () => {
  for (const field of ['device','inode','bytes','digest']) {
    const store = observation.store as Record<string, unknown>;
    assert.throws(() => assertHistoricalImmutableTreeObservation({ ...observation,
      store: { ...store, [field]: [store[field]] } }, 100, 3), /BUSTER_HISTORICAL/);
  }
  assert.throws(() => assertHistoricalImmutableTreeObservation(observation, 99, 3), /BUSTER_HISTORICAL/);
  assert.throws(() => assertHistoricalImmutableTreeObservation(observation, 100, 2), /BUSTER_HISTORICAL/);
  assert.throws(() => assertHistoricalImmutableTreeObservation({ ...observation, resultBytes: 101 }, 100, 3), /BUSTER_HISTORICAL/);
});

test('runtime observation has its own UUID-bound shape and cannot masquerade as plan evidence', () => {
  const runtime = { schemaVersion: 'buster-legacy-immutable-runtime.v1', filesystemUuid,
    device: 1, inode: 5, mountId: 4, inventoryDigest: digest, bytes: 0, entries: 1 };
  assert.doesNotThrow(() => assertHistoricalImmutableRuntimeObservation(runtime, 1, 1));
  assert.throws(() => assertHistoricalImmutableTreeObservation(runtime, 1, 1), /BUSTER_HISTORICAL/);
  assert.throws(() => assertHistoricalImmutableRuntimeObservation(observation, 100, 3), /BUSTER_HISTORICAL/);
  for (const invalid of [[filesystemUuid], '', null, '00000000-0000-0000-0000-000000000000']) {
    assert.throws(() => assertHistoricalImmutableRuntimeObservation({ ...runtime, filesystemUuid: invalid }, 1, 1), /BUSTER_HISTORICAL/);
  }
});


// Actual retained-file reads, not a stop receipt or authorization fixture.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { digestHistoricalFile, historicalSnapshotChunks } from '../../../skills/buster/engine/test-gates/preparation-historical-ledger.ts';

async function retainedSnapshot(t: test.TestContext) {
  assert.equal(process.getuid?.(), 0, 'requires actual isolated root, never a simulated identity');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'historical-retained-read-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'records'));
  const file = path.join(root, 'records', 'store.json');
  const bytes = Buffer.alloc(65537, 97);
  await fs.writeFile(file, bytes, { mode: 0o600 });
  // Keep a real previously opened writer to exercise post-seal drift without
  // relying on CAP_DAC_OVERRIDE (UID0 alone does not grant it).
  const writer = await fs.open(file, 'r+');
  t.after(() => writer.close());
  await fs.chmod(file, 0o400);
  const descriptor = await digestHistoricalFile(file, bytes.length);
  return { root, file, bytes, descriptor, writer };
}

test('retained snapshot streams all original bytes, enforces descriptor and restores original reads', async t => {
  const f = await retainedSnapshot(t);
  const collect = async () => { const chunks = []; for await (const chunk of historicalSnapshotChunks(f.root, f.descriptor)) chunks.push(chunk); return Buffer.concat(chunks); };
  assert.deepEqual(await collect(), f.bytes);
  await assert.rejects(async () => { for await (const _ of historicalSnapshotChunks(f.root, { ...f.descriptor, originalStoreBytes: 0 })) {} }, /BUSTER_HISTORICAL/);
  await assert.rejects(digestHistoricalFile(f.file, f.bytes.length - 1), /BUSTER_HISTORICAL_STORE_LIMIT/);
  assert.deepEqual(await collect(), f.bytes);
});

for (const change of ['replace', 'symlink', 'hardlink', 'append', 'truncate', 'permissions', 'same-size-content'] as const) {
  test(`retained snapshot rejects ${change} across its async yield, even after final bytes`, async t => {
    const f = await retainedSnapshot(t), iterator = historicalSnapshotChunks(f.root, f.descriptor);
    assert.equal((await iterator.next()).value?.length, 65536);
    // Finish all original bytes before mutation: EOF must still validate the source.
    assert.equal((await iterator.next()).value?.length, 1);
    if (change === 'replace' || change === 'symlink') {
      await fs.rename(f.file, f.file + '.old');
      if (change === 'replace') await fs.writeFile(f.file, f.bytes, { mode: 0o400 });
      else await fs.symlink(f.file + '.old', f.file);
    } else if (change === 'hardlink') await fs.link(f.file, f.file + '.linked');
    else if (change === 'append') await f.writer.write(Buffer.from('extra'), 0, 5, f.bytes.length);
    else if (change === 'truncate') await f.writer.truncate(1);
    else if (change === 'permissions') await fs.chmod(f.file, 0o600);
    else { const bytes = Buffer.from(f.bytes); bytes[0] = 98; await f.writer.write(bytes, 0, bytes.length, 0); }
    await assert.rejects(iterator.next(), /BUSTER_HISTORICAL_SOURCE_CHANGED/);
  });
}

// Deterministically place real filesystem mutations at the final async name
// observation. Neither file bytes/stats nor UID/source authority are mocked.
for (const reader of ['snapshot', 'digest'] as const) for (const mutation of ['permissions', 'content', 'hardlink'] as const) {
  test(`retained ${reader} rejects ${mutation} drift during final pathname observation`, async t => {
    const f = await retainedSnapshot(t);
    const originalLstat = fs.lstat;
    let observed = false;
    fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
      if (!observed && args[0] === f.file) {
        observed = true;
        if (mutation === 'permissions') await fs.chmod(f.file, 0o600);
        if (mutation === 'content') await f.writer.write(Buffer.from('z'), 0, 1, 0);
        if (mutation === 'hardlink') await fs.link(f.file, `${f.file}.link`);
      }
      return originalLstat(...args);
    }) as typeof fs.lstat;
    try {
      await assert.rejects(async () => {
        if (reader === 'digest') await digestHistoricalFile(f.file, f.bytes.length);
        else for await (const _ of historicalSnapshotChunks(f.root, f.descriptor)) {}
      }, /BUSTER_HISTORICAL_SOURCE_CHANGED/);
      assert.equal(observed, true);
    } finally { fs.lstat = originalLstat; }
    if (mutation === 'hardlink') await fs.unlink(`${f.file}.link`);
    if (mutation === 'content') await f.writer.write(f.bytes, 0, f.bytes.length, 0);
    await fs.chmod(f.file, 0o400);
    const restored = await digestHistoricalFile(f.file, f.bytes.length);
    const chunks = [];
    for await (const chunk of historicalSnapshotChunks(f.root, restored)) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), f.bytes);
  });
}


// Publication sequencing only: journal/owner responses are explicitly modeled.
// These controls do NOT prove a sealed native result, stop authority or import.
import { historicalResultReceipt, publishHistoricalImport } from '../../../skills/buster/engine/test-gates/preparation-historical-publication.ts';
import { preparationDigest } from '../../../skills/buster/engine/test-gates/preparation-header.ts';
import type { PreparationExecutionOptions } from '../../../skills/buster/engine/test-gates/preparation-execution.ts';
import type { WorkerAttemptResultV3 } from '@kubeclaw/pipeline-worker-core-contract';

test('historical publication joins original journal before native quiescence or filesystem publication', async () => {
  assert.equal(process.getuid?.(), 0, 'root precondition is real, not mocked');
  const { schemaVersion: _schema, nativeResultDigest: _native, ...summary } = receipt;
  const result = { state: 'completed', cleanup: { state: 'completed' },
    specialistResult: { schemaId: 'buster-historical-import-result.v1',
      schemaDigest: preparationDigest({ schemaVersion: 'buster-historical-import-result.v1' }), values: summary } } as unknown as WorkerAttemptResultV3;
  const binding = { preparationUid: 1003 as const, device: 1, inode: 2, markerDigest: digest };
  const envelope = { claim: { workerId: 'worker', claimId: 'claim', generation: 1 },
    attemptId: 'original', profile: { profileDigest: digest }, attemptSpecDigest: digest };
  let retained: unknown = null, ownerReads = 0, journalReads = 0;
  let phase = 'historical-reserved';
  const options = {
    ledger: { reservations: async () => [{ admissionId: receipt.importId, attemptSpecDigest: receipt.attemptSpecDigest,
      slot: receipt.preparationUid, historicalDescriptor: descriptor, gate: binding, envelope, phase }] },
    journal: { readResult: async (original: unknown) => { assert.equal(original, envelope); journalReads++; return retained; } },
    owner: { record: async () => { ownerReads++; return null; } },
  } as unknown as PreparationExecutionOptions;
  // Released/other lifecycle reservations retain identity metadata, but must
  // never mutate a candidate and only then fail the retainedHistorical transition.
  retained = structuredClone(result);
  for (const invalid of ['released', 'staging', 'prepared', 'published', 'repository-released', '']) {
    phase = invalid;
    await assert.rejects(publishHistoricalImport(options, '/must-not-publish', result, binding),
      /BUSTER_HISTORICAL_RESULT_UNBOUND/);
    assert.equal(journalReads, 0, 'invalid lifecycle must reject before journal/owner or filesystem work');
    assert.equal(ownerReads, 0);
  }
  phase = 'historical-reserved';
  for (const candidate of [null, { ...result, summary: 'different retained journal bytes' }]) {
    retained = candidate;
    await assert.rejects(publishHistoricalImport(options, '/must-not-publish', result, binding),
      /BUSTER_HISTORICAL_JOURNAL_RESULT_REQUIRED/);
    assert.equal(ownerReads, 0, 'unjoined journal must not even consult native ownership');
  }
  retained = structuredClone(result);
  assert.equal(preparationDigest(retained), preparationDigest(result));
  await assert.rejects(publishHistoricalImport(options, '/must-not-publish', result, binding),
    /BUSTER_HISTORICAL_QUIESCENCE_UNPROVEN/);
  assert.equal(ownerReads, 1, 'matching journal is necessary but never sufficient for publication');
  assert.equal(journalReads, 3);
  phase = 'retained-historical';
  await assert.rejects(publishHistoricalImport(options, '/must-not-publish', result, binding),
    /BUSTER_HISTORICAL_QUIESCENCE_UNPROVEN/);
  assert.equal(ownerReads, 2, 'retained retry still requires original quiescence');
  assert.equal(journalReads, 4);
});

// The original native host emits the digest of its exact result schema version.
// A known ID alone must not relabel another specialist schema as this result.
test('historical result requires the original native specialist schema identity', () => {
  const { schemaVersion: _schema, nativeResultDigest: _native, ...summary } = receipt;
  const specialistResult = { schemaId: 'buster-historical-import-result.v1',
    schemaDigest: preparationDigest({ schemaVersion: 'buster-historical-import-result.v1' }), values: summary };
  const result = { state: 'completed', cleanup: { state: 'completed' }, specialistResult } as unknown as WorkerAttemptResultV3;
  assert.equal(historicalResultReceipt(result).nativeResultDigest, preparationDigest(result));
  for (const invalid of [undefined, null, digest, [specialistResult.schemaDigest],
    preparationDigest({ schemaVersion: 'buster-historical-import-result.v2' })]) {
    assert.throws(() => historicalResultReceipt({ ...result,
      specialistResult: { ...specialistResult, schemaDigest: invalid } } as unknown as WorkerAttemptResultV3),
    /BUSTER_HISTORICAL_RESULT_INVALID/);
  }
  assert.equal(historicalResultReceipt(result).nativeResultDigest, preparationDigest(result));
});
