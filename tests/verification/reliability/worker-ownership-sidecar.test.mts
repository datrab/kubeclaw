import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileWorkerOwnershipStore, type WorkerOwnershipIdentity } from '../../../skills/worker/core/worker/ownership-store.ts';
import { ownershipTerminalCapacityBytes } from '../../../skills/worker/core/worker/ownership-capacity.ts';

// Real storage/fence/quota controls only; no cgroup or native retirement claim.
const identity: WorkerOwnershipIdentity = { workerId: 'worker:metadata', attemptId: 'attempt:metadata', claimId: 'claim:metadata',
  generation: 1, profileDigest: `sha256:${'1'.repeat(64)}`, attemptSpecDigest: `sha256:${'2'.repeat(64)}` };
const limits = { maximumRecords: 32, maximumBytes: 65536 };
async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ownership-sidecars-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const metadata = path.join(root, 'associations'); await fs.mkdir(metadata);
  const bytes = () => sync.readdirSync(metadata).reduce((sum, name) => sum + sync.statSync(path.join(metadata, name)).size, 0);
  const base = new FileWorkerOwnershipStore(root, limits);
  const record = await base.reserve(identity);
  const file = path.join(root, 'owners.json'), before = await fs.readFile(file);
  const future = ownershipTerminalCapacityBytes(JSON.parse(before.toString('utf8')));
  return { root, metadata, bytes, record, file, before, future };
}

test('association addition reserves future terminal bytes, not current owners.json size', async t => {
  const f = await fixture(t), ceiling = f.future + 32;
  assert.ok(f.before.byteLength + 33 < ceiling, 'current bytes would wrongly allow the extra association');
  const store = new FileWorkerOwnershipStore(f.root, { ...limits, maximumBytes: ceiling }, f.bytes);
  let entered = false;
  await assert.rejects(store.withMetadataReservation(33, () => { entered = true; }), /CAPACITY_EXCEEDED/);
  assert.equal(entered, false);
  assert.deepEqual(await fs.readdir(f.metadata), []);
  assert.deepEqual(await fs.readFile(f.file), f.before);
  const association = path.join(f.metadata, 'exact');
  await store.withMetadataReservation(32, () => { sync.writeFileSync(association, Buffer.alloc(32)); });
  const inode = sync.statSync(association).ino;
  await store.withMetadataReservation(0, () => {});
  assert.equal(sync.statSync(association).ino, inode, 'exact orphan retry adds no bytes/replacement');
});

test('native reserve and later lifecycle writes retain sidecar charges under the original ceiling', async t => {
  const f = await fixture(t), ceiling = f.future + 32;
  const store = new FileWorkerOwnershipStore(f.root, { ...limits, maximumBytes: ceiling }, f.bytes);
  await store.withMetadataReservation(32, () => { sync.writeFileSync(path.join(f.metadata, 'original'), Buffer.alloc(32)); });
  await assert.rejects(store.reserve({ ...identity, attemptId: 'attempt:next' }), /CAPACITY_EXCEEDED/);
  assert.deepEqual(await fs.readFile(f.file), f.before);
  const terminal = await store.transition(f.record, 'unresolved', { diagnosis: '\0'.repeat(4096) });
  assert.equal(terminal.phase, 'unresolved');
  assert.ok((await fs.stat(f.file)).size + f.bytes() <= ceiling);
  assert.equal(f.bytes(), 32, 'lifecycle never erases association accounting');
});

test('a retained unaccounted metadata overflow denies lifecycle writes without losing either file', async t => {
  const f = await fixture(t);
  const association = path.join(f.metadata, 'unaccounted');
  await fs.writeFile(association, Buffer.alloc(limits.maximumBytes));
  const store = new FileWorkerOwnershipStore(f.root, limits, f.bytes);
  await assert.rejects(store.transition(f.record, 'unresolved', { diagnosis: 'still unresolved' }), /CAPACITY_EXCEEDED/);
  assert.deepEqual(await fs.readFile(f.file), f.before);
  assert.equal((await fs.stat(association)).size, limits.maximumBytes);
});

test('competing sidecar instances serialize against the same ownership metadata fence', async t => {
  const f = await fixture(t), ceiling = f.future + 64;
  const attempts = await Promise.allSettled([0, 1, 2].map(index => {
    const store = new FileWorkerOwnershipStore(f.root, { ...limits, maximumBytes: ceiling }, f.bytes);
    return store.withMetadataReservation(32, () => { sync.writeFileSync(path.join(f.metadata, String(index)), Buffer.alloc(32)); });
  }));
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 2);
  assert.equal(f.bytes(), 64);
  assert.equal(attempts.filter(result => result.status === 'rejected').length, 1);
  assert.deepEqual(await fs.readFile(f.file), f.before);
});

test('unknown/invalid sidecar accounting never silently becomes a zero-byte default', async t => {
  const f = await fixture(t);
  for (const invalid of [NaN, -1, 0.5, undefined]) {
    const store = new FileWorkerOwnershipStore(f.root, limits, () => invalid as number);
    await assert.rejects(store.reserve({ ...identity, attemptId: 'attempt:invalid' }), /CAPACITY_EXCEEDED/);
    assert.deepEqual(await fs.readFile(f.file), f.before);
  }
  const missing = new FileWorkerOwnershipStore(f.root, limits, () => { throw new Error('ORIGINAL_METADATA_UNRESOLVED'); });
  await assert.rejects(missing.withMetadataReservation(0, () => assert.fail('missing original metadata admitted')), /ORIGINAL_METADATA_UNRESOLVED/);
  assert.deepEqual(await fs.readFile(f.file), f.before);
});
