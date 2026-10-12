import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../../../skills/worker/core/worker/digest.ts';
import { FileWorkerOwnershipStore, type WorkerOwnershipRecord } from '../../../skills/worker/core/worker/ownership-store.ts';
import { NativeWorkerOwnershipLease } from '../../../skills/worker/core/worker/native-worker-ownership.ts';
import type { NativeWorkerResourceScope } from '../../../skills/worker/core/worker/native-resource-scope.ts';

// Original durable store and GNU flock; explicit scope-method model only.
// This proves error ordering and retained metadata, never kernel drain/enforcement.
async function fixture(maximumBytes: number, preexisting = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-quiescence-metadata-'));
  const store = new FileWorkerOwnershipStore(root, { maximumRecords: 10, maximumBytes });
  let record: WorkerOwnershipRecord;
  if (preexisting) {
    // Explicit previously accepted overcommit, installed before opening it through
    // this policy. New admissions must reject this quota, never recreate the state.
    const scopeName = 'worker-11111111-1111-1111-1111-111111111111';
    const binding = { scopeName, bootId: '11111111-1111-1111-1111-111111111111', device: 1, inode: 2 };
    record = { identity: { workerId: 'independent', attemptId: 'race', claimId: 'claim', generation: 1,
      profileDigest: `sha256:${'1'.repeat(64)}`, attemptSpecDigest: `sha256:${'2'.repeat(64)}` },
    scopeName, revision: 5, phase: 'running', binding, diagnosis: null, finalObservation: null,
    topology: { kind: 'aggregate.v1', children: [{ name: 'host', limits: { memoryBytes: 4096, tasks: 4 },
      binding: { ...binding, scopeName: 'host', inode: 3 } }] } };
    await fs.writeFile(path.join(root, 'owners.json'), canonicalJson({ schemaVersion: 'worker-ownership-store.v3', hostIdentity: null, records: [record] }));
  } else {
    record = await store.reserve({ workerId: 'independent', attemptId: 'race', claimId: 'claim', generation: 1,
      profileDigest: `sha256:${'1'.repeat(64)}`, attemptSpecDigest: `sha256:${'2'.repeat(64)}` });
    const binding = { scopeName: record.scopeName, bootId: '11111111-1111-1111-1111-111111111111', device: 1, inode: 2 };
    record = await store.transition(record, 'allocated', { binding });
    record = await store.transition(record, 'running');
    record = await store.reserveChild(record, 'host', { memoryBytes: 4096, tasks: 4 });
    record = await store.bindChild(record, 'host', { ...binding, scopeName: 'host', inode: 3 });
  }
  const events: string[] = []; const settled: boolean[] = [];
  const scopeModel = {
    verifyChildren() { events.push('verify'); },
    async terminateAndDrain() {
      events.push('drain');
      return { unit: 'linux-tasks' as const, cpuTimeMicroseconds: 1, maximumMemoryBytes: 1,
        maximumTasks: 1, populated: false, oomKills: 0, taskLimitHits: 0 };
    },
    disposeChildren() { events.push('remove-children'); }, dispose() { events.push('remove-parent'); },
  };
  const options = { store, cgroupRoot: root, nodeIdentity: 'model', drainTimeoutMs: 1000,
    poolLimits: { memoryBytes: 8192, tasks: 8, cpuQuotaMicroseconds: 1000, cpuPeriodMicroseconds: 1000 } };
  const lease = (current = record) => new NativeWorkerOwnershipLease(scopeModel as unknown as NativeWorkerResourceScope,
    current, options, failed => settled.push(failed));
  return { root, store, record, events, settled, scopeModel, lease,
    cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

function containsMessage(error: unknown, text: string): boolean {
  return error instanceof Error && (error.message.includes(text)
    || error instanceof AggregateError && error.errors.some(inner => containsMessage(inner, text)));
}

test('preexisting metadata saturation still reaches modeled drain and never disposes or releases', async () => {
  // A fixed historical-store quota, not a newly admitted or subsequently lowered budget.
  const f = await fixture(826, true);
  try {
    const file = path.join(f.root, 'owners.json'); const before = await fs.readFile(file);
    assert.equal(before.byteLength, 826);
    for (let attempt = 0; attempt < 2; attempt++) {
      const [current] = await f.store.records(); assert(current);
      await assert.rejects(f.lease(current).finish(), error => containsMessage(error, 'CAPACITY_EXCEEDED'));
      assert.deepEqual(await fs.readFile(file), before);
    }
    assert.deepEqual(f.events, ['verify', 'drain', 'verify', 'drain']);
    assert.deepEqual(f.settled, [true, true]);
    assert.equal((await f.store.records())[0]?.finalObservation, null);
    // Restart/retry with unchanged saturated capacity is explicitly not recovery.
  } finally { await f.cleanup(); }
});

test('metadata I/O failure retains failed ownership after modeled drain and can retry when storage recovers', async () => {
  const f = await fixture(65536); const transition = f.store.transition.bind(f.store);
  f.store.transition = async (record, phase, change) => {
    if (phase === 'quiescing') throw new Error('injected-storage-EIO');
    return transition(record, phase, change);
  };
  try {
    await assert.rejects(f.lease().finish(), /injected-storage-EIO/);
    assert.deepEqual(f.events, ['verify', 'drain']); assert.deepEqual(f.settled, [true]);
    const [unresolved] = await f.store.records(); assert(unresolved);
    assert.equal(unresolved.phase, 'unresolved'); assert.equal(unresolved.finalObservation, null);
    f.store.transition = transition;
    await f.lease(unresolved).finish();
    assert.deepEqual(f.events, ['verify', 'drain', 'verify', 'drain', 'remove-children', 'remove-parent']);
    assert.deepEqual(f.settled, [true, false]); assert.equal((await f.store.records())[0]?.phase, 'disposed');
  } finally { f.store.transition = transition; await f.cleanup(); }
});

test('unknown-child verification failure prevents modeled subtree mutation', async () => {
  const f = await fixture(65536);
  f.scopeModel.verifyChildren = () => { throw new Error('WORKER_NATIVE_UNKNOWN_CHILD'); };
  try {
    await assert.rejects(f.lease().finish(), /UNKNOWN_CHILD/);
    assert.deepEqual(f.events, []); assert.deepEqual(f.settled, [true]);
    assert.equal((await f.store.records())[0]?.finalObservation, null);
  } finally { await f.cleanup(); }
});
