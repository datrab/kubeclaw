import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileWorkerOwnershipStore } from '../../../../skills/worker/core/worker/ownership-store.ts';
import { NativeWorkerOwnershipLease } from '../../../../skills/worker/core/worker/native-worker-ownership.ts';
import { NativeProcessLaunches } from '../../../../skills/worker/core/worker/native-process-launches.ts';

// Real filesystem/store/locking, synthetic identity and scope-method model ONLY.
// These probes establish JS lifecycle fencing, never cgroup enforcement.
const identity = { workerId: 'independent', attemptId: 'race', claimId: 'claim', generation: 1,
  profileDigest: `sha256:${'1'.repeat(64)}`, attemptSpecDigest: `sha256:${'2'.repeat(64)}` };
const limits = { memoryBytes: 4096, tasks: 4 };
const binding = { scopeName: '', bootId: '11111111-1111-1111-1111-111111111111', device: 1, inode: 2 };
const final = { unit: 'linux-tasks', cpuTimeMicroseconds: 0, maximumMemoryBytes: 0,
  maximumTasks: 0, populated: false, oomKills: 0, taskLimitHits: 0 };
const command = { launcher: '/never-executed', executable: '/never-executed', uid: 1000, gid: 1000, cwd: '/', arguments: [], environment: {} };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function fixture(maximumBytes = 65536) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'independent-native-topology-'));
  const store = new FileWorkerOwnershipStore(root, { maximumRecords: 10, maximumBytes });
  let record = await store.reserve(identity);
  record = await store.transition(record, 'allocated', { binding: { ...binding, scopeName: record.scopeName } });
  const events: string[] = [];
  let ino = 3;
  const scope = {
    verifyChildren() { events.push('verify'); }, childLimits() { return limits; },
    createChild(child: any) { events.push('create:' + child.name); return { ...binding, scopeName: child.name, inode: ino++ }; },
    childLaunchArguments(child: any) { assert(child.binding); return [child.name]; },
    async terminateAndDrain() { events.push('drain'); return final; },
    disposeChildren() { events.push('remove-children'); }, dispose() { events.push('remove-parent'); },
  };
  const lease = new NativeWorkerOwnershipLease(scope as any, record, { store, drainTimeoutMs: 1000 } as any);
  return { root, store, record, lease, scope, events, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}
async function modelProcesses<T>(operation: () => Promise<T>) {
  const spawn = NativeProcessLaunches.prototype.spawn, drain = NativeProcessLaunches.prototype.drain;
  const launches: string[] = [];
  NativeProcessLaunches.prototype.spawn = function (_binary: any, args: any) { launches.push(args[0]); return {} as any; };
  NativeProcessLaunches.prototype.drain = async function () {};
  try { return await operation.call(null, launches); } finally { NativeProcessLaunches.prototype.spawn = spawn; NativeProcessLaunches.prototype.drain = drain; }
}

test('two genuinely concurrent same-revision child reservations produce exactly one durable winner', async () => {
  const f = await fixture();
  try {
    const running = await f.store.transition(f.record, 'running');
    const results = await Promise.allSettled(['host', 'helper-22222222-2222-2222-2222-222222222222']
      .map(name => f.store.reserveChild(running, name, limits)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.match(String((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason), /CAS_CONFLICT/);
    assert.equal((await f.store.records())[0]!.topology.children.length, 1);
  } finally { await f.cleanup(); }
});

test('finish during durable host reservation prevents creation and launch, retaining reserved child', async () => modelProcesses(async (launches: any) => {
  const f = await fixture(); const entered = deferred(), release = deferred();
  const original = f.store.reserveChild.bind(f.store);
  f.store.reserveChild = async (...args) => { const result = await original(...args); entered.resolve(); await release.promise; return result; };
  try {
    const launched = f.lease.launch(command); const rejected = assert.rejects(launched, /LAUNCH_FENCED/);
    await entered.promise; const completed = f.lease.finish(); release.resolve(); await rejected; await completed;
    assert.deepEqual(launches, []); assert.equal(f.events.some(v => v.startsWith('create:')), false);
    const record = (await f.store.records())[0]!;
    assert.equal(record.phase, 'disposed'); assert.equal(record.topology.children[0]!.binding, null);
    assert.ok(f.events.indexOf('drain') < f.events.indexOf('remove-children'));
    assert.ok(f.events.indexOf('remove-children') < f.events.indexOf('remove-parent'));
  } finally { release.resolve(); await f.cleanup(); }
}));

test('finish during helper binding waits for CAS and refuses that helper plus queued helper', async () => modelProcesses(async (launches: any) => {
  const f = await fixture(); const entered = deferred(), release = deferred();
  try {
    await f.lease.launch(command);
    const original = f.store.bindChild.bind(f.store);
    f.store.bindChild = async (...args) => { const result = await original(...args); entered.resolve(); await release.promise; return result; };
    const authority = f.lease.launchAuthority();
    const helper = authority.launch(command); const queued = authority.launch(command);
    const rejections = Promise.all([assert.rejects(helper, /LAUNCH_FENCED/), assert.rejects(queued, /LAUNCH_FENCED/)]);
    await entered.promise; const completed = f.lease.finish(); release.resolve(); await rejections; await completed;
    assert.deepEqual(launches, ['host']);
    const record = (await f.store.records())[0]!;
    assert.equal(record.phase, 'disposed'); assert.equal(record.topology.children.length, 2);
    assert(record.topology.children.every(child => child.binding));
  } finally { release.resolve(); await f.cleanup(); }
}));

test('concurrent lease helpers serialize durable reservations without lost children', async () => modelProcesses(async (launches: any) => {
  const f = await fixture();
  try {
    await f.lease.launch(command); const authority = f.lease.launchAuthority();
    await Promise.all(Array.from({ length: 6 }, () => authority.launch(command)));
    await f.lease.finish();
    const record = (await f.store.records())[0]!;
    assert.equal(record.phase, 'disposed'); assert.equal(record.topology.children.length, 7);
    assert.equal(new Set(launches).size, 7); assert(record.topology.children.every(child => child.binding));
  } finally { await f.cleanup(); }
}));

test('historical lease launch refuses before touching any scope method', async () => {
  const f = await fixture();
  try {
    const legacy = { ...f.record, topology: { kind: 'legacy-leaf', children: [] } };
    const scope = new Proxy({}, { get() { throw new Error('LEGACY_SCOPE_TOUCHED'); } });
    const lease = new NativeWorkerOwnershipLease(scope as any, legacy as any, { store: f.store } as any);
    await assert.rejects(lease.launch(command), /LEGACY_LAUNCH_FORBIDDEN/);
  } finally { await f.cleanup(); }
});

test('review diagnostic: a full child metadata store currently prevents subtree drain', async () => modelProcesses(async () => {
  // Fixed before admission; no runtime lowering of the configured quota.
  const f = await fixture(826);
  try {
    await f.lease.launch(command);
    const [running] = await f.store.records();
    const bytes = (await fs.stat(path.join(f.root, 'owners.json'))).size;
    assert.equal(bytes, 826); assert.equal(running!.phase, 'running');
    await assert.rejects(f.lease.finish(), /RECONCILIATION_RECORD_FAILED/);
    assert.equal(f.events.includes('drain'), false);
    assert.equal((await f.store.records())[0]!.phase, 'running');
    console.log('DIAGNOSTIC: full store prevents subtree kill/drain; it is not a kernel test. bytes=' + bytes);
  } finally { await f.cleanup(); }
}));
