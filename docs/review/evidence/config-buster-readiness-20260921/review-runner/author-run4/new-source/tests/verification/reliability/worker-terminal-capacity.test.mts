import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileWorkerOwnershipStore, type WorkerOwnershipRecord } from '../../../skills/worker/core/worker/ownership-store.ts';
import { ownershipTerminalCapacityBytes } from '../../../skills/worker/core/worker/ownership-capacity.ts';
import { decodeOwnershipState, type WorkerOwnershipState } from '../../../skills/worker/core/worker/ownership-state.ts';
import { canonicalJson } from '../../../skills/worker/core/worker/digest.ts';

const maximum = Number.MAX_SAFE_INTEGER;
const boot = '00000000-0000-0000-0000-000000000000';
const maximumObservation = { unit: 'linux-tasks' as const, cpuTimeMicroseconds: maximum, maximumMemoryBytes: maximum,
  maximumTasks: maximum, populated: false, oomKills: maximum, taskLimitHits: maximum };
const identity = (index: number) => ({ workerId: 'capacity', attemptId: `attempt:${index}`, claimId: `claim:${index}`, generation: 1,
  profileDigest: `sha256:${'1'.repeat(64)}`, attemptSpecDigest: `sha256:${'2'.repeat(64)}` });
function record(index: number): WorkerOwnershipRecord {
  return { identity: identity(index), scopeName: `worker-00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
    revision: 1, phase: 'reserved', binding: null, diagnosis: null, finalObservation: null,
    topology: { kind: 'aggregate.v1', children: [] } };
}
function state(records: WorkerOwnershipRecord[], hostIdentity: string | null = null): WorkerOwnershipState {
  return { schemaVersion: 'worker-ownership-store.v3', hostIdentity, records };
}
async function fixture(maximumBytes: number) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ownership-terminal-capacity-'));
  return { root, file: path.join(root, 'owners.json'),
    store: new FileWorkerOwnershipStore(root, { maximumRecords: 32, maximumBytes }),
    cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

// Metadata-domain fixtures only: maximum numbers below are not kernel observations.
test('exact-fit owner admission covers actual persisted maximal terminal bytes; one byte less rejects before write', async () => {
  const bytes = ownershipTerminalCapacityBytes(state([record(0)]));
  const exact = await fixture(bytes); const short = await fixture(bytes - 1);
  try {
    await assert.rejects(short.store.reserve(identity(0)), /CAPACITY_EXCEEDED/);
    await assert.rejects(fs.stat(short.file), { code: 'ENOENT' });
    const reserved = await exact.store.reserve(identity(0));
    assert.equal(ownershipTerminalCapacityBytes(state([reserved])), bytes);
    assert.deepEqual(await exact.store.reserve(identity(0)), reserved, 'replay does not require another reservation');
    // A valid historical revision near the numeric boundary avoids billions of
    // transitions while exercising the original writer's final 16-digit revision.
    const highRevision = { ...reserved, revision: maximum - 4 };
    await fs.writeFile(exact.file, canonicalJson(state([highRevision])));
    await exact.store.bindHostIdentity('h'.repeat(256), boot);
    let current = await exact.store.transition(highRevision, 'allocated', {
      binding: { scopeName: reserved.scopeName, bootId: boot, device: maximum, inode: maximum },
    });
    current = await exact.store.transition(current, 'quiescing');
    current = await exact.store.transition(current, 'empty', { finalObservation: maximumObservation });
    current = await exact.store.transition(current, 'unresolved', { diagnosis: '\u0000'.repeat(4096) });
    assert.equal(Buffer.byteLength(canonicalJson(current.diagnosis)), 24578);
    const persisted = await fs.readFile(exact.file);
    assert.equal(persisted.byteLength, bytes, 'actual durable serializer must attain the reserved boundary');
    assert.equal(persisted.toString(), canonicalJson(state([current], 'h'.repeat(256))));
    assert.deepEqual((await new FileWorkerOwnershipStore(exact.root, { maximumRecords: 32, maximumBytes: bytes }).records())[0], current);
  } finally { await exact.cleanup(); await short.cleanup(); }
});

test('competing owner admissions cannot consume the same global terminal capacity', async () => {
  const f = await fixture(ownershipTerminalCapacityBytes(state([record(0)])));
  try {
    const other = new FileWorkerOwnershipStore(f.root, { maximumRecords: 32,
      maximumBytes: ownershipTerminalCapacityBytes(state([record(0)])) });
    const outcomes = await Promise.allSettled([f.store.reserve(identity(0)), other.reserve(identity(1))]);
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    assert.match(String((outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult).reason), /CAPACITY_EXCEEDED/);
    assert.equal((await f.store.records()).length, 1);
  } finally { await f.cleanup(); }
});

function running(index: number): WorkerOwnershipRecord {
  const value = record(index);
  return { ...value, revision: 3, phase: 'running',
    binding: { scopeName: value.scopeName, bootId: boot, device: 7, inode: 8 + index } };
}
const helper = (index: number) => ({ name: `helper-00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
  limits: { memoryBytes: 4096, tasks: 4 }, binding: null });

test('competing children on different owners reserve future binding and terminal bytes globally', async () => {
  const first = running(0); const second = running(1);
  const prospective = { ...first, topology: { ...first.topology, children: [helper(0)] } };
  const maximumBytes = ownershipTerminalCapacityBytes(state([prospective, second]));
  const f = await fixture(maximumBytes);
  try {
    const allocated: WorkerOwnershipRecord[] = [];
    for (let index = 0; index < 2; index++) {
      let current = await f.store.reserve(identity(index));
      current = await f.store.transition(current, 'allocated', { binding: { ...running(index).binding!, scopeName: current.scopeName } });
      allocated.push(await f.store.transition(current, 'running'));
    }
    const outcomes = await Promise.allSettled(allocated.map((current, index) =>
      f.store.reserveChild(current, helper(index).name, helper(index).limits)));
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    assert.match(String((outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult).reason), /CAPACITY_EXCEEDED/);
    const records = await f.store.records(); assert.equal(records.flatMap(current => current.topology.children).length, 1);
    const parent = records.find(current => current.topology.children.length)!;
    const child = parent.topology.children[0]!;
    await f.store.bindChild(parent, child.name, { ...parent.binding!, scopeName: child.name, inode: maximum });
    assert.ok((await fs.stat(f.file)).size <= maximumBytes);
    const highRevisions = (await f.store.records()).map(current => ({ ...current, revision: maximum - 3 }));
    await fs.writeFile(f.file, canonicalJson(state(highRevisions)));
    await f.store.bindHostIdentity('h'.repeat(256), boot);
    for (let current of highRevisions) {
      current = await f.store.transition(current, 'quiescing');
      current = await f.store.transition(current, 'empty', { finalObservation: maximumObservation });
      await f.store.transition(current, 'unresolved', { diagnosis: '\u0000'.repeat(4096) });
    }
    assert.equal((await fs.readFile(f.file)).byteLength, maximumBytes,
      'both owners plus the formerly unbound child reach the actual reserved terminal boundary');
  } finally { await f.cleanup(); }
});

test('terminal records retain actual bytes; all historical formats remain readable without rewriting', async () => {
  for (const version of [1, 2, 3]) {
    const terminal = { ...running(0), phase: 'disposed' as const };
    const { topology: _topology, ...v2 } = terminal;
    const { finalObservation: _observation, ...v1 } = v2;
    const historical = version === 1 ? { schemaVersion: 'worker-ownership-store.v1', records: [v1] }
      : { schemaVersion: `worker-ownership-store.v${version}`, hostIdentity: null, records: [version === 2 ? v2 : terminal] };
    const decoded = decodeOwnershipState(historical, 32);
    const maximumBytes = ownershipTerminalCapacityBytes({ ...decoded, records: [...decoded.records, record(1)] });
    const f = await fixture(maximumBytes);
    try {
      const before = JSON.stringify(historical); await fs.writeFile(f.file, before);
      assert.deepEqual(await f.store.records(), decoded.records); assert.equal(await fs.readFile(f.file, 'utf8'), before);
      await f.store.reserve(identity(1));
      const reopened = await f.store.records(); assert.equal(reopened.length, 2);
      assert.deepEqual(reopened[0], decoded.records[0]);
      assert.equal(JSON.parse(await fs.readFile(f.file, 'utf8')).schemaVersion, 'worker-ownership-store.v3');
    } finally { await f.cleanup(); }
  }
});

test('preexisting overcommit blocks admission but preserves reads, lifecycle attempts and host provenance fencing', async () => {
  for (const hostIdentity of [null, 'already-bound-host']) {
    const original = running(0); const initial = state([original], hostIdentity);
    const encoded = canonicalJson(initial);
    // Predetermined existing-store fixture and unchanged quota, not lowered after admission.
    const f = await fixture(Buffer.byteLength(encoded));
    try {
      await fs.writeFile(f.file, encoded);
      assert.deepEqual(await f.store.records(), [original]);
      assert.deepEqual(await f.store.reserve(identity(0)), original);
      await assert.rejects(f.store.reserve(identity(1)), /CAPACITY_EXCEEDED/);
      await assert.rejects(f.store.reserveChild(original, helper(0).name, helper(0).limits), /CAPACITY_EXCEEDED/);
      if (hostIdentity === null) await assert.rejects(f.store.bindHostIdentity('h'.repeat(256), boot), /CAPACITY_EXCEEDED/);
      else await f.store.bindHostIdentity(hostIdentity, boot);
      await assert.rejects(f.store.transition(original, 'quiescing'), /CAPACITY_EXCEEDED/);
      assert.equal(await fs.readFile(f.file, 'utf8'), encoded);
    } finally { await f.cleanup(); }
  }
});
