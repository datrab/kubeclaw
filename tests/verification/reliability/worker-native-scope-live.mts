import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileWorkerOwnershipStore } from '../../../skills/worker/core/worker/ownership-store.ts';
import { NativeWorkerOwnership } from '../../../skills/worker/core/worker/native-worker-ownership.ts';
import { runNativeWorkerProcess } from '../../../skills/worker/core/worker/native-worker-process.ts';
import { readNativeWorkerNodeIdentity } from '../../../skills/worker/core/worker/native-node-identity.ts';
import { NativeWorkerResourceScope } from '../../../skills/worker/core/worker/native-resource-scope.ts';
import { NativeAttemptJournal } from '../../../skills/worker/core/worker/native-attempt-journal.ts';
import { executeNativeWorkerAttempt } from '../../../skills/worker/core/worker/native-attempt-executor.ts';
import { prismNativeAttempt } from '../../../skills/prism/engine/worker-envelope.ts';
import { workerAttemptSpecDigest } from '@kubeclaw/pipeline-worker-core-contract';

const root = process.env.KUBECLAW_WORKER_TEST_CGROUP_ROOT;
if (!root) throw new Error('KUBECLAW_WORKER_TEST_CGROUP_ROOT is required; native scope checks cannot be skipped');
const fixture = fileURLToPath(new URL('../../fixtures/worker-native-scope-child.mjs', import.meta.url));
const limits = { memoryBytes: 256 * 1024 * 1024, tasks: 2048 };

function line(child: ChildProcessWithoutNullStreams, expected: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let bytes = '';
    const cleanup = () => {
      clearTimeout(timer); child.stdout.off('data', receive); child.off('exit', exit); child.off('error', error);
    };
    const error = (cause: Error) => { cleanup(); reject(cause); };
    const exit = () => error(new Error(`Native workload exited before ${expected}`));
    const receive = (value: Buffer) => {
      bytes += value.toString('utf8');
      if (bytes.length > 4096) return error(new Error('Native workload output exceeded bound'));
      if (bytes.split('\n').includes(expected)) { cleanup(); resolve(); }
    };
    const timer = setTimeout(() => error(new Error(`Native workload did not report ${expected}`)), 10000);
    child.stdout.on('data', receive); child.once('exit', exit); child.once('error', error);
  });
}

async function workload(scope: NativeWorkerResourceScope) {
  const child = spawn(process.execPath, [fixture, scope.launcherPath()], { stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  // Keep a failed spawn observed even while the readiness wait owns the error.
  void exited.catch(() => {});
  child.stderr.resume();
  try { await line(child, 'ready'); }
  catch (error) { child.kill('SIGKILL'); throw error; }
  return { child, exited };
}

test('actual parallel scopes have independent CPU and retain final counters after drain', { timeout: 30000 }, async () => {
  const scopes: NativeWorkerResourceScope[] = [];
  const children: ChildProcessWithoutNullStreams[] = [];
  try {
    const hot = NativeWorkerResourceScope.create(root, limits); scopes.push(hot);
    const idle = NativeWorkerResourceScope.create(root, limits); scopes.push(idle);
    const active = await workload(hot); children.push(active.child);
    const waiting = await workload(idle); children.push(waiting.child);
    const hotBefore = hot.observe(); const idleBefore = idle.observe();
    const worked = line(active.child, 'worked'); active.child.stdin.write('work\n'); await worked;
    const hotAfter = hot.observe(); const idleAfter = idle.observe();
    const hotCpu = hotAfter.cpuTimeMicroseconds - hotBefore.cpuTimeMicroseconds;
    const idleCpu = idleAfter.cpuTimeMicroseconds - idleBefore.cpuTimeMicroseconds;
    assert.ok(hotCpu > 0 && hotCpu > idleCpu, 'CPU must belong to the executing scope');
    assert.equal(hotAfter.unit, 'linux-tasks');
    assert.ok(hotAfter.maximumTasks >= 1);
    assert.ok(hotAfter.maximumMemoryBytes > 0);
    assert.throws(() => hot.dispose(), /WORKER_NATIVE_SCOPE_NOT_QUIESCENT/u);
    const final = await hot.terminateAndDrain(5000);
    await active.exited;
    assert.equal(final.populated, false);
    assert.ok(final.cpuTimeMicroseconds >= hotAfter.cpuTimeMicroseconds);
    assert.ok(final.maximumMemoryBytes >= hotAfter.maximumMemoryBytes);
    assert.equal(hot.observe().populated, false);
    assert.throws(() => hot.launcherPath(), /WORKER_NATIVE_SCOPE_QUIESCING/u);
    hot.dispose(); hot.dispose();
    assert.throws(() => hot.observe(), /WORKER_NATIVE_SCOPE_DISPOSED/u);
    const idleFinal = await idle.terminateAndDrain(5000);
    await waiting.exited; assert.equal(idleFinal.populated, false); idle.dispose();
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    const failures: unknown[] = [];
    for (const scope of scopes) {
      try { await scope.terminateAndDrain(5000); scope.dispose(); }
      catch (error) {
        if (!(error instanceof Error) || error.message !== 'WORKER_NATIVE_SCOPE_DISPOSED') failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, 'Native scope test cleanup failed');
  }
});

test('production launcher and durable owner account the whole host and fence exact replay', { timeout: 30000 }, async () => {
  const launcher = process.env.KUBECLAW_WORKER_TEST_LAUNCHER;
  if (!launcher || !path.isAbsolute(launcher)) throw new Error('KUBECLAW_WORKER_TEST_LAUNCHER must name the compiled production launcher');
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-native-live-'));
  const store = new FileWorkerOwnershipStore(stateRoot, { maximumRecords: 32, maximumBytes: 65536 });
  const identity = { workerId: 'worker:live', attemptId: 'attempt:live', claimId: 'claim:live', generation: 1,
    profileDigest: `sha256:${'1'.repeat(64)}`, attemptSpecDigest: `sha256:${'2'.repeat(64)}` };
  const identityFile = process.env.KUBECLAW_WORKER_TEST_NODE_IDENTITY_FILE;
  if (!identityFile) throw new Error('KUBECLAW_WORKER_TEST_NODE_IDENTITY_FILE must name the trusted mounted host identity');
  const poolFile = process.env.KUBECLAW_WORKER_TEST_POOL_LIMITS_FILE;
  if (!poolFile) throw new Error('KUBECLAW_WORKER_TEST_POOL_LIMITS_FILE must bind the actual prepared aggregate pool');
  const poolLimits = JSON.parse(await fs.readFile(poolFile, 'utf8'));
  const ownership = { cgroupRoot: root, store, nodeIdentity: readNativeWorkerNodeIdentity(identityFile), drainTimeoutMs: 5000, poolLimits };
  try {
    await NativeWorkerOwnership.supervise(ownership, async owner => {
      const result = await runNativeWorkerProcess({ owner, identity,
        limits: { ...limits, cpuTimeMs: 10000, timeoutMs: 15000, pollIntervalMs: 20,
          maximumInputBytes: 4096, maximumOutputBytes: 16384, closeTimeoutMs: 5000 },
        command: { launcher, uid: 1000, gid: 1000, executable: process.execPath,
          arguments: [fileURLToPath(new URL('../../fixtures/worker-native-process-child.mjs', import.meta.url))],
          cwd: '/', environment: {} },
        input: Buffer.from(JSON.stringify({ iterations: 500000 })),
      });
      assert.equal(result.fault, null, Buffer.from(result.stderr).toString());
      assert.equal(result.exitCode, 0);
      const facts = JSON.parse(Buffer.from(result.stdout).toString());
      assert.equal(facts.uid, 1000); assert.equal(facts.gid, 1000);
      // Node includes the effective GID in getgroups(), even after setgroups(0, NULL).
      assert.deepEqual(facts.groups, [1000]);
      const records = await store.records();
      assert.equal(records.length, 1); assert.equal(records[0]!.phase, 'disposed');
      assert.ok(facts.membership.includes(records[0]!.scopeName));
      assert.equal(result.resources.unit, 'linux-tasks');
      assert.equal(result.resources.populated, false);
      assert.deepEqual(records[0]!.finalObservation, result.resources,
        'final kernel evidence must survive scope disposal in the durable owner record');
      assert.ok(result.resources.cpuTimeMicroseconds > 0);
      assert.ok(result.resources.maximumTasks > 1, 'Node threads must be counted as tasks');
      await assert.rejects(owner.allocate(identity, limits), /WORKER_NATIVE_IDENTITY_ALREADY_USED/u);
    });
    await NativeWorkerOwnership.supervise(ownership, async owner => {
      await assert.rejects(owner.allocate(identity, limits), /WORKER_NATIVE_IDENTITY_ALREADY_USED/u);
      const fullIdentity = { ...identity, attemptId: 'attempt:full-pool' };
      const full = await owner.allocate(fullIdentity, { memoryBytes: poolLimits.memoryBytes, tasks: poolLimits.tasks });
      const before = await store.records();
      await assert.rejects(owner.allocate({ ...identity, attemptId: 'attempt:over-capacity' }, limits), /WORKER_NATIVE_CAPACITY_EXCEEDED/u);
      assert.deepEqual(await store.records(), before, 'aggregate rejection must precede durable owner reservation');
      assert.equal(owner.isReady(), true);
      await capacityReceipt(owner, stateRoot, launcher);
      assert.deepEqual(await store.records(), before, 'journal rejection must not allocate a native owner');
      await full.finish();
      const replacement = await owner.allocate({ ...identity, attemptId: 'attempt:capacity-returned' }, limits);
      await replacement.finish();
    });
  } finally { await fs.rm(stateRoot, { recursive: true, force: true }); }
});

async function capacityReceipt(owner: NativeWorkerOwnership, stateRoot: string, launcher: string): Promise<void> {
  const artifact = { artifactId: 'input:pool-capacity', type: 'prism-engine-input', mediaType: 'application/json',
    contentDigest: `sha256:${'1'.repeat(64)}`, sizeBytes: 2, storageUrl: 'https://control.example/input' };
  const envelope = prismNativeAttempt('render', artifact, 'pool-capacity');
  envelope.resourceBudgets.maximumMemoryBytes = { state: 'requested', limit: limits.memoryBytes };
  envelope.resourceBudgets.maximumTasks = { state: 'requested', limit: limits.tasks };
  envelope.resourceBudgets.cpuTimeMs = { state: 'requested', limit: 10000 };
  envelope.attemptSpecDigest = workerAttemptSpecDigest(envelope);
  const journal = new NativeAttemptJournal(path.join(stateRoot, 'capacity-journal'), {
    maximumRecords: 32, maximumStateBytes: 262144, maximumTotalBytes: 8388608,
    maximumInputBytes: 65536, maximumOutputBytes: 65536, maximumResultBytes: 65536,
  });
  const input = { envelope, journal, process: { owner,
    limits: { ...limits, cpuTimeMs: 10000, timeoutMs: 15000, pollIntervalMs: 20,
      maximumInputBytes: 65536, maximumOutputBytes: 65536, closeTimeoutMs: 5000 },
    command: { launcher, uid: 1000, gid: 1000, executable: process.execPath,
      arguments: [fileURLToPath(new URL('../../fixtures/worker-native-process-child.mjs', import.meta.url))], cwd: '/', environment: {} },
  } };
  const result = await executeNativeWorkerAttempt(input);
  assert.equal(result.error?.code, 'WORKER_NATIVE_CAPACITY_EXCEEDED');
  assert.equal(result.cleanup.state, 'not_required');
  assert.equal(owner.isReady(), true);
  assert.deepEqual(await executeNativeWorkerAttempt(input), result, 'capacity-failure receipt replays exactly');
}
