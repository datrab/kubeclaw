import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { FileWorkerOwnershipStore, type WorkerOwnershipIdentity } from '../../../skills/worker/core/worker/ownership-store.ts';
import { NativeWorkerOwnership } from '../../../skills/worker/core/worker/native-worker-ownership.ts';

const identity: WorkerOwnershipIdentity = {
  workerId: 'worker:test', attemptId: 'attempt:test', claimId: 'claim:test', generation: 1,
  profileDigest: `sha256:${'1'.repeat(64)}`, attemptSpecDigest: `sha256:${'2'.repeat(64)}`,
};
const limits = { maximumRecords: 32, maximumBytes: 65536 };

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-owners-'));
  return { root, store: new FileWorkerOwnershipStore(root, limits), cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

test('concurrent durable reservations converge and survive reopening', async () => {
  const f = await fixture();
  try {
    const other = new FileWorkerOwnershipStore(f.root, limits);
    const [one, two] = await Promise.all([f.store.reserve(identity), other.reserve(identity)]);
    assert.deepEqual(one, two);
    assert.deepEqual(await new FileWorkerOwnershipStore(f.root, limits).records(), [one]);
    await assert.rejects(other.reserve({ ...identity, claimId: 'claim:foreign' }), /WORKER_OWNERSHIP_CONFLICT/u);
    await assert.rejects(other.reserve({ ...identity, generation: 2 }), /WORKER_OWNERSHIP_RECONCILIATION_REQUIRED/u);
  } finally { await f.cleanup(); }
});

test('caller mutation after reserve starts cannot change persisted identity', async () => {
  const f = await fixture();
  try {
    const input = { ...identity };
    const pending = f.store.reserve(input);
    input.claimId = 'claim:mutated';
    const record = await pending;
    assert.equal(record.identity.claimId, identity.claimId);
    assert.equal((await f.store.records())[0]?.identity.claimId, identity.claimId);
  } finally { await f.cleanup(); }
});

test('metadata lifecycle is fenced and disposed identities cannot execute again', async () => {
  const f = await fixture();
  try {
    const reserved = await f.store.reserve(identity);
    const stat = await fs.stat(f.root);
    const bootId = (await fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
    // A real directory identity exercises storage bindings only, not cgroup ownership.
    let record = await f.store.transition(reserved, 'allocated', {
      binding: { scopeName: reserved.scopeName, bootId, device: stat.dev, inode: stat.ino },
    });
    await assert.rejects(f.store.transition(reserved, 'allocated', { binding: record.binding! }), /WORKER_OWNERSHIP_CAS_CONFLICT/u);
    await assert.rejects(f.store.transition(record, 'disposed'), /WORKER_OWNERSHIP_TRANSITION_INVALID/u);
    record = await f.store.transition(record, 'running');
    record = await f.store.transition(record, 'quiescing');
    record = await f.store.transition(record, 'empty');
    record = await f.store.transition(record, 'disposed');
    assert.deepEqual(await f.store.reserve(identity), record);
    await assert.rejects(f.store.transition(record, 'running'), /WORKER_OWNERSHIP_TRANSITION_INVALID/u);
    const next = await f.store.reserve({ ...identity, generation: 3 });
    assert.notEqual(next.scopeName, record.scopeName);
    await assert.rejects(f.store.reserve({ ...identity, generation: 2 }), /WORKER_OWNERSHIP_STALE_GENERATION/u);
  } finally { await f.cleanup(); }
});

test('unresolved ownership preserves diagnosis and blocks generation replacement', async () => {
  const f = await fixture();
  try {
    const reserved = await f.store.reserve(identity);
    await assert.rejects(f.store.transition(reserved, 'unresolved'), /WORKER_OWNERSHIP_DIAGNOSIS_REQUIRED/u);
    const unresolved = await f.store.transition(reserved, 'unresolved', { diagnosis: 'allocation interrupted before scope binding' });
    assert.equal(unresolved.diagnosis, 'allocation interrupted before scope binding');
    await assert.rejects(f.store.reserve({ ...identity, generation: 2 }), /WORKER_OWNERSHIP_RECONCILIATION_REQUIRED/u);
    assert.deepEqual(await new FileWorkerOwnershipStore(f.root, limits).records(), [unresolved]);
  } finally { await f.cleanup(); }
});

test('record quota fails atomically without losing existing ownership', async () => {
  const f = await fixture();
  try {
    const store = new FileWorkerOwnershipStore(f.root, { ...limits, maximumRecords: 1 });
    const record = await store.reserve(identity);
    const before = await fs.readFile(path.join(f.root, 'owners.json'));
    await assert.rejects(store.reserve({ ...identity, attemptId: 'attempt:other' }), /WORKER_OWNERSHIP_CAPACITY_EXCEEDED/u);
    assert.deepEqual(await fs.readFile(path.join(f.root, 'owners.json')), before);
    assert.deepEqual(await store.records(), [record]);
  } finally { await f.cleanup(); }
});

test('corrupt persisted ownership fails without overwriting the record', async () => {
  const f = await fixture();
  try {
    await f.store.reserve(identity);
    const file = path.join(f.root, 'owners.json');
    const bytes = Buffer.from('{"schemaVersion":');
    await fs.writeFile(file, bytes);
    await assert.rejects(f.store.reserve(identity), SyntaxError);
    assert.deepEqual(await fs.readFile(file), bytes);
  } finally { await f.cleanup(); }
});

test('abandoned admission preserves replay identity and requires a failure diagnosis', async () => {
  const f = await fixture();
  try {
    const reserved = await f.store.reserve(identity);
    await assert.rejects(f.store.transition(reserved, 'abandoned'), /WORKER_OWNERSHIP_DIAGNOSIS_REQUIRED/u);
    const abandoned = await f.store.transition(reserved, 'abandoned', { diagnosis: 'reservation never launched' });
    assert.deepEqual(await new FileWorkerOwnershipStore(f.root, limits).reserve(identity), abandoned);
    await assert.rejects(f.store.transition(abandoned, 'allocated'), /WORKER_OWNERSHIP_TRANSITION_INVALID/u);
    assert.equal((await f.store.reserve({ ...identity, generation: 2 })).phase, 'reserved');
  } finally { await f.cleanup(); }
});

test('supervisor holds a separate real kernel lock and SIGKILL releases it without erasing reservations', { timeout: 15000 }, async () => {
  const f = await fixture();
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../fixtures/worker-ownership-supervisor.mjs', import.meta.url)), f.root], { stdio: 'pipe' });
  const exited = once(child, 'exit');
  let contender: Promise<void> | undefined;
  try {
    const ready = await Promise.race([
      once(child.stdout, 'data').then(([bytes]) => String(bytes)),
      exited.then(() => { throw new Error('ownership fixture exited before acquiring lock'); }),
    ]);
    assert.equal(ready, 'locked\n');
    let acquired = false;
    contender = f.store.withSupervisor(async () => {
      acquired = true;
      const records = await f.store.records(); // Distinct store lock: this must not deadlock.
      assert.deepEqual(records.map(record => record.identity), [identity]);
    });
    await delay(100);
    assert.equal(acquired, false, 'concurrent supervisor must not enter admission');
    child.kill('SIGKILL');
    assert.deepEqual(await exited, [null, 'SIGKILL']);
    await contender;
    assert.equal(acquired, true);
    assert.equal((await f.store.records())[0]?.phase, 'reserved');
  } finally {
    child.kill('SIGKILL');
    await exited;
    await contender?.catch(() => undefined);
    await f.cleanup();
  }
});

test('native recovery rejects ordinary directories before exposing admission or modifying existing ownership', async () => {
  const f = await fixture();
  try {
    await f.store.reserve(identity);
    const before = await fs.readFile(path.join(f.root, 'owners.json'));
    let entered = false;
    await assert.rejects(NativeWorkerOwnership.supervise({ cgroupRoot: f.root, store: f.store, drainTimeoutMs: 1000 }, async () => {
      entered = true;
    }), /WORKER_NATIVE_ROOT_INVALID/u);
    assert.equal(entered, false);
    assert.deepEqual(await fs.readFile(path.join(f.root, 'owners.json')), before);
  } finally { await f.cleanup(); }
});
