import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileWorkerOwnershipStore } from '../../../skills/worker/core/worker/ownership-store.ts';
import { validateHierarchicalCgroupEvents } from '../../../skills/worker/core/worker/native-hierarchy-events.ts';
import { decodeOwnershipState } from '../../../skills/worker/core/worker/ownership-state.ts';

const identity = { workerId: 'worker:test', attemptId: 'attempt:children', claimId: 'claim:test', generation: 1,
  profileDigest: `sha256:${'1'.repeat(64)}`, attemptSpecDigest: `sha256:${'2'.repeat(64)}` };
const limits = { memoryBytes: 4096, tasks: 2 };

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-child-metadata-'));
  const store = new FileWorkerOwnershipStore(root, { maximumRecords: 8, maximumBytes: 65536 });
  let record = await store.reserve(identity);
  // Synthetic inode values validate metadata only, never kernel ownership or enforcement.
  record = await store.transition(record, 'allocated', { binding: { scopeName: record.scopeName,
    bootId: '11111111-1111-1111-1111-111111111111', device: 1, inode: 2 } });
  record = await store.transition(record, 'running');
  return { root, store, record, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

test('child reservations are durable, CAS-fenced, immutable after binding and charged to metadata quota', async () => {
  const f = await fixture();
  try {
    assert.equal(f.record.topology.kind, 'aggregate.v1');
    const requested = { ...limits };
    const pending = f.store.reserveChild(f.record, 'host', requested);
    requested.tasks = 100;
    let record = await pending;
    assert.equal(record.topology.children[0]!.limits.tasks, 2);
    await assert.rejects(f.store.reserveChild(f.record, 'helper-11111111-1111-1111-1111-111111111111', limits), /CAS_CONFLICT/);
    await assert.rejects(f.store.reserveChild(record, 'host', limits), /CHILD_RESERVATION_INVALID/);
    const childBinding = { ...record.binding!, scopeName: 'host', inode: 3 };
    record = await f.store.bindChild(record, 'host', childBinding);
    await assert.rejects(f.store.bindChild(record, 'host', childBinding), /REBIND_FORBIDDEN/);
    assert.deepEqual((await f.store.records())[0], record);
    const file = path.join(f.root, 'owners.json'); const before = await fs.readFile(file);
    const full = new FileWorkerOwnershipStore(f.root, { maximumRecords: 8, maximumBytes: before.byteLength });
    await assert.rejects(full.reserveChild(record, 'helper-22222222-2222-2222-2222-222222222222', limits), /CAPACITY_EXCEEDED/);
    assert.deepEqual(await fs.readFile(file), before);
    record = await f.store.transition(record, 'quiescing');
    await assert.rejects(f.store.reserveChild(record, 'helper-22222222-2222-2222-2222-222222222222', limits), /CHILD_RESERVATION_INVALID/);
  } finally { await f.cleanup(); }
});

test('strict topology decoder rejects unknown fields, names, duplicates and mismatched child identity', async () => {
  const f = await fixture();
  try {
    const record = await f.store.reserveChild(f.record, 'host', limits);
    const valid = { schemaVersion: 'worker-ownership-store.v3', hostIdentity: null, records: [record] };
    const mutations = [
      (r: any) => { r.topology.extra = true; },
      (r: any) => { r.topology.children[0].name = '../escape'; },
      (r: any) => { r.topology.children.push(r.topology.children[0]); },
      (r: any) => { r.topology.children[0].limits.tasks = true; },
      (r: any) => { r.topology.children[0].binding = { ...r.binding, scopeName: 'host', inode: 3, bootId: 'foreign' }; },
      (r: any) => { r.topology.children[0].binding = { ...r.binding, scopeName: 'host' }; },
      (r: any) => { r.topology.kind = 'legacy-leaf'; },
    ];
    for (const mutate of mutations) {
      const bad = structuredClone(valid); mutate(bad.records[0]);
      assert.throws(() => decodeOwnershipState(bad, 8), /WORKER_(OWNERSHIP|NATIVE)_/);
    }
  } finally { await f.cleanup(); }
});

test('v1 and v2 ownership decode explicitly as drain-only legacy leaves; child admission is forbidden', async () => {
  const f = await fixture();
  try {
    const { topology: _topology, ...historical } = f.record;
    for (const version of [1, 2]) {
      const { finalObservation: _observation, ...v1 } = historical;
      const state = version === 1 ? { schemaVersion: 'worker-ownership-store.v1', records: [v1] }
        : { schemaVersion: 'worker-ownership-store.v2', hostIdentity: null, records: [historical] };
      await fs.writeFile(path.join(f.root, 'owners.json'), JSON.stringify(state));
      const [decoded] = await f.store.records();
      assert.deepEqual(decoded!.topology, { kind: 'legacy-leaf', children: [] });
      await assert.rejects(f.store.reserveChild(decoded!, 'host', limits), /LEGACY_LAUNCH_FORBIDDEN/);
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.root, 'owners.json'), 'utf8')), state);
    }
  } finally { await f.cleanup(); }
});

test('mountinfo parser requires hierarchical events on the actual covering mount', () => {
  // Explicit parser vectors: these strings prove no native host capability.
  const line = '10 1 0:20 / /pool rw - cgroup2 cgroup rw';
  validateHierarchicalCgroupEvents(line, '/pool/worker-identity');
  for (const option of ['memory_localevents', 'pids_localevents']) {
    assert.throws(() => validateHierarchicalCgroupEvents(line + ',' + option, '/pool/worker-identity'), /HIERARCHICAL_EVENTS_REQUIRED/);
  }
  assert.throws(() => validateHierarchicalCgroupEvents(line, '/pool-other/worker'), /MOUNTINFO_INVALID/);
  assert.throws(() => validateHierarchicalCgroupEvents(line + '\n11 10 0:21 / /pool/nested rw - tmpfs tmpfs rw', '/pool/nested/worker'), /MOUNTINFO_INVALID/);
  assert.throws(() => validateHierarchicalCgroupEvents(line + '\n' + line, '/pool/worker'), /MOUNTINFO_INVALID/);
  assert.throws(() => validateHierarchicalCgroupEvents('malformed', '/pool/worker'), /MOUNTINFO_INVALID/);
  validateHierarchicalCgroupEvents('10 1 0:20 / /pool\\040space rw - cgroup2 cgroup rw', '/pool space/worker');
});
