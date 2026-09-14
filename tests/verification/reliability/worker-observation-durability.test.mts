import { currentTestCgroup } from './native-test-cgroup.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { FileWorkerOwnershipStore, type WorkerOwnershipRecord } from '../../../skills/worker/core/worker/ownership-store.ts';
import { observeNativeWorkerResources, validateNativeWorkerResourceObservation } from '../../../skills/worker/core/worker/native-resource-observation.ts';
import { readNativeWorkerNodeIdentity } from '../../../skills/worker/core/worker/native-node-identity.ts';

const limits = { maximumRecords: 32, maximumBytes: 65536 };

test('real kernel observation is validated without replacing absent counters with samples', () => {
  const observation = observeNativeWorkerResources(currentTestCgroup());
  validateNativeWorkerResourceObservation(observation);
  assert.equal(observation.unit, 'linux-tasks');
  assert.equal(observation.populated, true, 'this test process is in a populated real kernel scope');
  assert.throws(() => validateNativeWorkerResourceObservation({ ...observation, cpuTimeMicroseconds: Number.MAX_SAFE_INTEGER + 1 }), /OBSERVATION_INVALID/u);
  assert.throws(() => validateNativeWorkerResourceObservation({ ...observation, maximumTasks: -1 }), /OBSERVATION_INVALID/u);
  assert.throws(() => validateNativeWorkerResourceObservation({ ...observation, maximumProcesses: 1 }), /OBSERVATION_INVALID/u);
});

test('fsynced terminal metadata survives a real writer SIGKILL and cannot be resealed with different counters', { timeout: 15000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-observation-'));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../fixtures/worker-observation-writer.mjs', import.meta.url)), root], { stdio: 'pipe' });
  const exited = once(child, 'exit');
  try {
    let output = ''; let errors = '';
    child.stderr.on('data', bytes => { errors += String(bytes); });
    const received = new Promise<WorkerOwnershipRecord>((resolve, reject) => {
      child.stdout.on('data', bytes => {
        output += String(bytes);
        if (output.includes('\n')) resolve(JSON.parse(output.trim()) as WorkerOwnershipRecord);
      });
      child.once('exit', () => reject(new Error('writer exited before durable state: ' + errors)));
    });
    const committed = await received;
    child.kill('SIGKILL');
    assert.deepEqual(await exited, [null, 'SIGKILL']);
    const store = new FileWorkerOwnershipStore(root, limits);
    const [reopened] = await store.records();
    assert.deepEqual(reopened, committed);
    assert.equal(reopened?.phase, 'empty');
    assert.equal(reopened.finalObservation?.cpuTimeMicroseconds, 123456);
    await assert.rejects(store.transition(reopened, 'empty', { finalObservation: { ...reopened.finalObservation!, maximumTasks: 1 } }), /OBSERVATION_REWRITE_FORBIDDEN/u);
    const disposed = await store.transition(reopened, 'disposed');
    assert.deepEqual(disposed.finalObservation, committed.finalObservation);
    assert.deepEqual((await new FileWorkerOwnershipStore(root, limits).records())[0], disposed);
  } finally { child.kill('SIGKILL'); await exited; await fs.rm(root, { recursive: true, force: true }); }
});

test('legacy ownership remains readable without fabricating missing historical observations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-observation-legacy-'));
  try {
    const store = new FileWorkerOwnershipStore(root, limits);
    const record = await store.reserve({ workerId: 'old-worker', attemptId: 'old-attempt', claimId: 'old-claim', generation: 1,
      profileDigest: `sha256:${'a'.repeat(64)}`, attemptSpecDigest: `sha256:${'b'.repeat(64)}` });
    const { finalObservation: _observation, ...legacy } = record;
    const file = path.join(root, 'owners.json');
    const oldBytes = JSON.stringify({ schemaVersion: 'worker-ownership-store.v1', records: [legacy] });
    await fs.writeFile(file, oldBytes);
    const [reopened] = await store.records();
    assert.equal(reopened?.finalObservation, null);
    assert.equal(await fs.readFile(file, 'utf8'), oldBytes, 'reading does not rewrite a historical store');
    await store.transition(reopened!, 'abandoned', { diagnosis: 'reservation was never launched' });
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).schemaVersion, 'worker-ownership-store.v2');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('a moved ownership store cannot turn another host into a reboot proof', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-host-binding-'));
  try {
    const store = new FileWorkerOwnershipStore(root, limits);
    const boot = (await fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
    await store.bindHostIdentity('host:first', boot);
    const committed = await fs.readFile(path.join(root, 'owners.json'));
    await assert.rejects(new FileWorkerOwnershipStore(root, limits).bindHostIdentity('host:other', boot), /DIFFERENT_HOST_UNRESOLVED/u);
    assert.deepEqual(await fs.readFile(path.join(root, 'owners.json')), committed);
    // The store-level host fence survives reopening and permits a boot change
    // only for that same explicitly bound host. Kernel cleanup is a separate gate.
    await new FileWorkerOwnershipStore(root, limits).bindHostIdentity('host:first', '00000000-0000-4000-8000-000000000000');
    assert.deepEqual(await fs.readFile(path.join(root, 'owners.json')), committed);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('unbound legacy records from a different boot cannot be silently assigned to this host', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-legacy-host-'));
  try {
    const store = new FileWorkerOwnershipStore(root, limits);
    const record = await store.reserve({ workerId: 'worker:legacy', attemptId: 'attempt:legacy', claimId: 'claim:legacy', generation: 1,
      profileDigest: `sha256:${'c'.repeat(64)}`, attemptSpecDigest: `sha256:${'d'.repeat(64)}` });
    const stat = await fs.stat(root);
    const allocated = await store.transition(record, 'allocated', { binding: { scopeName: record.scopeName,
      bootId: '00000000-0000-4000-8000-000000000000', device: stat.dev, inode: stat.ino } });
    const { finalObservation: _observation, ...legacy } = allocated;
    const file = path.join(root, 'owners.json');
    const bytes = JSON.stringify({ schemaVersion: 'worker-ownership-store.v1', records: [legacy] });
    await fs.writeFile(file, bytes);
    const boot = (await fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
    await assert.rejects(store.bindHostIdentity('host:current', boot), /LEGACY_HOST_UNPROVEN/u);
    assert.equal(await fs.readFile(file, 'utf8'), bytes);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('host identity reader uses a real root-owned file and rejects mutable or redirected files', async () => {
  assert.match(readNativeWorkerNodeIdentity('/etc/machine-id'), /^native-node:[a-f0-9]{32}$/u);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-host-identity-'));
  try {
    const file = path.join(root, 'identity');
    await fs.writeFile(file, 'a'.repeat(32), { mode: 0o666 }); await fs.chmod(file, 0o666);
    assert.throws(() => readNativeWorkerNodeIdentity(file), /NODE_IDENTITY_NOT_TRUSTED/u);
    const alias = path.join(root, 'redirect'); await fs.symlink('/etc/machine-id', alias);
    assert.throws(() => readNativeWorkerNodeIdentity(alias), /ELOOP/u);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
