import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawnSync, type SpawnSyncReturns, type ChildProcessWithoutNullStreams } from 'node:child_process';
import test from 'node:test';
import { NativeWorkerResourceScope } from '../../../skills/worker/core/worker/native-resource-scope.ts';
import { NativeWorkerOwnership } from '../../../skills/worker/core/worker/native-worker-ownership.ts';
import { FileWorkerOwnershipStore } from '../../../skills/worker/core/worker/ownership-store.ts';
import { readNativeWorkerNodeIdentity } from '../../../skills/worker/core/worker/native-node-identity.ts';

// This suite requires an actual prepared cgroup-v2 root and root supervisor.
// It never creates ordinary-directory substitutes or skips an unavailable host.
const root = process.env.KUBECLAW_WORKER_TEST_CGROUP_ROOT;
const launcher = process.env.KUBECLAW_WORKER_TEST_LAUNCHER;
const nodeIdentityFile = process.env.KUBECLAW_WORKER_TEST_NODE_IDENTITY_FILE;
const poolFile = process.env.KUBECLAW_WORKER_TEST_POOL_LIMITS_FILE;
if (!root || !launcher || !nodeIdentityFile || !poolFile) throw new Error('Native topology tests require the real delegated host configuration');
const poolLimits = JSON.parse(await fs.readFile(poolFile, 'utf8'));
const limits = { memoryBytes: 128 * 1024 * 1024, tasks: 64 };
const identity = { workerId: 'worker:topology', attemptId: 'attempt:topology', claimId: 'claim:topology', generation: 1,
  profileDigest: `sha256:${'1'.repeat(64)}`, attemptSpecDigest: `sha256:${'2'.repeat(64)}` };
const hostCode = 'const fs=require("node:fs"); console.log(fs.readFileSync("/proc/self/cgroup","utf8").trim()); setInterval(()=>{},1000);';

function membership(child: ChildProcessWithoutNullStreams): Promise<string> {
  child.stderr.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => { clearTimeout(timer); child.stdout.off('data', receive); child.off('exit', exited); child.off('error', failed); };
    const failed = (error: Error) => { cleanup(); reject(error); };
    const exited = () => failed(new Error('Native process exited before reporting membership'));
    const receive = (data: Buffer) => {
      value += data.toString();
      if (value.length > 4096) return failed(new Error('Native membership output exceeded bound'));
      if (value.includes('\n')) { cleanup(); resolve(value.trim()); }
    };
    const timer = setTimeout(() => failed(new Error('Native membership deadline exceeded')), 10000);
    child.stdout.on('data', receive); child.once('exit', exited); child.once('error', failed);
  });
}

async function fixture() {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'native-topology-live-'));
  const store = new FileWorkerOwnershipStore(stateRoot, { maximumRecords: 32, maximumBytes: 131072 });
  return { stateRoot, store, options: { cgroupRoot: root!, store,
    nodeIdentity: readNativeWorkerNodeIdentity(nodeIdentityFile!), drainTimeoutMs: 5000, poolLimits },
  command: { launcher: launcher!, uid: 1000, gid: 1000, executable: process.execPath,
    arguments: ['-e', hostCode], cwd: '/', environment: {} } };
}

test('production host and concurrent helpers occupy distinct owned leaves with aggregate counters and subtree drain', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const rootPolicy = await Promise.all(['memory.max', 'pids.max', 'cpu.max', 'cgroup.subtree_control']
      .map(name => fs.readFile(path.join(root!, name), 'utf8')));
    await NativeWorkerOwnership.supervise(f.options, async owner => {
      const lease = await owner.allocate(identity, limits);
      const host = await lease.launch(f.command); const hostExit = once(host, 'exit');
      const hostMembership = await membership(host);
      const authority = lease.launchAuthority();
      const helpers = await Promise.all([authority.launch({ ...f.command, resourceLimits: { memoryBytes: limits.memoryBytes / 2, tasks: 32 } }),
        authority.launch({ ...f.command, resourceLimits: { memoryBytes: limits.memoryBytes / 2, tasks: 32 } })]);
      const exits = helpers.map(child => once(child, 'exit'));
      const helperMembership = await Promise.all(helpers.map(membership));
      const [record] = await f.store.records(); assert(record?.binding);
      assert.equal(record.topology.kind, 'aggregate.v1'); assert.equal(record.topology.children.length, 3);
      const hostBinding = record.topology.children.find(child => child.name === 'host')!.binding!;
      for (const invalid of ['parent', 'child']) {
        const rejected: SpawnSyncReturns<string> = spawnSync(launcher!, [path.join(root!, record.scopeName, 'host'), String(record.binding.device),
          String(record.binding.inode + (invalid === 'parent' ? 1 : 0)), String(hostBinding.device),
          String(hostBinding.inode + (invalid === 'child' ? 1 : 0)), '1000', '1000', process.execPath,
          '-e', 'console.log("must-not-execute")'], { encoding: 'utf8',
          env: { ...process.env, KUBECLAW_NATIVE_SUPERVISOR_PID: String(process.pid) } });
        assert.equal(rejected.status, 125); assert.equal(rejected.stdout, '');
        assert.match(rejected.stderr, /WORKER_NATIVE_LAUNCH_BINDING_INVALID/);
      }
      assert.ok(hostMembership.endsWith(`/${record.scopeName}/host`));
      assert.equal(new Set(helperMembership).size, 2);
      const aggregate = path.join(root!, record.scopeName);
      assert.equal((await fs.readFile(path.join(aggregate, 'cgroup.procs'), 'utf8')).trim(), '');
      for (const child of record.topology.children) {
        assert(child.binding);
        const stat = await fs.stat(path.join(aggregate, child.name));
        assert.equal(stat.ino, child.binding.inode); assert.equal(stat.dev, child.binding.device);
        if (child.name !== 'host') {
          assert.ok(helperMembership.some(value => value.endsWith(`/${record.scopeName}/${child.name}`)));
          assert.equal((await fs.readFile(path.join(aggregate, child.name, 'pids.max'), 'utf8')).trim(), '32');
        }
      }
      const childTasks = await Promise.all(record.topology.children.map(child =>
        fs.readFile(path.join(aggregate, child.name, 'pids.current'), 'utf8').then(Number)));
      const totalTasks = childTasks.reduce((sum, count) => sum + count, 0);
      assert.equal(Number(await fs.readFile(path.join(aggregate, 'pids.current'), 'utf8')), totalTasks);
      const before = lease.observe(); assert.equal(before.populated, true);
      assert.ok(before.maximumTasks >= totalTasks && totalTasks > Math.max(...childTasks),
        'the parent must account for all three live leaf groups together');
      assert.ok(before.maximumMemoryBytes > 0);
      const finishing = lease.finish();
      await assert.rejects(authority.launch(f.command), /LAUNCH_FENCED/);
      const final = await finishing; await Promise.all([hostExit, ...exits]);
      assert.equal(final.populated, false); assert.ok(final.cpuTimeMicroseconds >= before.cpuTimeMicroseconds);
      assert.ok(final.maximumMemoryBytes >= before.maximumMemoryBytes);
      const [disposed] = await f.store.records(); assert.equal(disposed?.phase, 'disposed');
      assert.deepEqual(disposed?.finalObservation, final);
      await assert.rejects(fs.stat(aggregate), { code: 'ENOENT' });
    });
    assert.deepEqual(await Promise.all(['memory.max', 'pids.max', 'cpu.max', 'cgroup.subtree_control']
      .map(name => fs.readFile(path.join(root!, name), 'utf8'))), rootPolicy);
  } finally { await fs.rm(f.stateRoot, { recursive: true, force: true }); }
});

async function recoverableFixture() {
  const f = await fixture();
  let record = await f.store.reserve(identity);
  const scope = NativeWorkerResourceScope.createReserved(root!, record.scopeName, limits);
  record = await f.store.transition(record, 'allocated', { binding: scope.binding() });
  record = await f.store.transition(record, 'running');
  record = await f.store.reserveChild(record, 'host', limits);
  const binding = scope.createChild(record.topology.children[0]!);
  record = await f.store.bindChild(record, 'host', binding);
  return { ...f, scope, record, aggregate: path.join(root!, record.scopeName) };
}

test('real empty child recovery survives a persisted removal boundary without losing aggregate counters', { timeout: 30000 }, async () => {
  const f = await recoverableFixture();
  try {
    let record = await f.store.transition(f.record, 'quiescing');
    const final = await f.scope.terminateAndDrain(5000);
    record = await f.store.transition(record, 'empty', { finalObservation: final });
    // Model the exact crash boundary after one real rmdir and before parent disposal.
    // This is a persisted-boundary recovery test, not a claim of SIGKILL injection.
    await fs.rmdir(path.join(f.aggregate, 'host'));
    await NativeWorkerOwnership.supervise(f.options, async () => {});
    const [disposed] = await f.store.records();
    assert.equal(disposed?.phase, 'disposed'); assert.deepEqual(disposed?.finalObservation, final);
    assert.deepEqual(disposed?.topology.children, record.topology.children);
    await assert.rejects(fs.stat(f.aggregate), { code: 'ENOENT' });
  } finally { await cleanupRecoverable(f); }
});

test('unknown real child prevents recovery admission and is never recursively deleted', { timeout: 30000 }, async () => {
  const f = await recoverableFixture(); const foreign = path.join(f.aggregate, 'unexpected');
  try {
    await fs.mkdir(foreign);
    let admitted = false;
    await assert.rejects(NativeWorkerOwnership.supervise(f.options, async () => { admitted = true; }), /UNKNOWN_CHILD/);
    assert.equal(admitted, false); assert.equal((await fs.stat(foreign)).isDirectory(), true);
    // The test created this group; only the test removes it after the refusal.
    await fs.rmdir(foreign);
    await NativeWorkerOwnership.supervise(f.options, async () => {});
    assert.equal((await f.store.records())[0]?.phase, 'disposed');
  } finally {
    try { await fs.rmdir(foreign); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await cleanupRecoverable(f);
  }
});

async function cleanupRecoverable(f: Awaited<ReturnType<typeof recoverableFixture>>): Promise<void> {
  let exists = true;
  try { await fs.stat(f.aggregate); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    exists = false;
  }
  if (exists) {
    await f.scope.terminateAndDrain(5000);
    f.scope.disposeChildren(f.record.topology.children);
    f.scope.dispose();
  }
  await fs.rm(f.stateRoot, { recursive: true, force: true });
}

test('reserved unbound real empty helper is drained without fabricating a launch binding', { timeout: 30000 }, async () => {
  const f = await recoverableFixture();
  try {
    const name = 'helper-22222222-2222-2222-2222-222222222222';
    const record = await f.store.reserveChild(f.record, name, limits);
    f.scope.createChild(record.topology.children.find(child => child.name === name)!);
    await NativeWorkerOwnership.supervise(f.options, async () => {});
    const [disposed] = await f.store.records();
    assert.equal(disposed?.phase, 'disposed');
    assert.equal(disposed?.topology.children.find(child => child.name === name)?.binding, null);
    await assert.rejects(fs.stat(f.aggregate), { code: 'ENOENT' });
  } finally {
    // Include the durable unbound reservation if an assertion/recovery failed.
    const [record] = await f.store.records();
    if (record) f.record = record;
    await cleanupRecoverable(f);
  }
});

test('a missing bound real child before durable quiescence fences recovery admission', { timeout: 30000 }, async () => {
  const f = await recoverableFixture();
  try {
    await fs.rmdir(path.join(f.aggregate, 'host'));
    let admitted = false;
    await assert.rejects(NativeWorkerOwnership.supervise(f.options, async () => { admitted = true; }), /OWNED_CHILD_MISSING/);
    assert.equal(admitted, false);
    const [record] = await f.store.records();
    assert.equal(record?.phase, 'unresolved'); assert.equal(record?.finalObservation, null);
  } finally { await cleanupRecoverable(f); }
});

async function localEvent(group: string, file: string, field: string): Promise<number> {
  const text = await fs.readFile(path.join(group, file), 'utf8');
  const value = text.split('\n').find(line => line.startsWith(field + ' '))?.split(' ')[1];
  assert.match(value ?? '', /^\d+$/u);
  return Number(value);
}

async function boundedExit(child: ChildProcessWithoutNullStreams): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([once(child, 'exit'), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Native pressure workload did not exit')), 10000);
    })]);
  } finally { clearTimeout(timer); }
}

for (const resource of ['memory', 'tasks'] as const) {
  test(`real helper ${resource} exhaustion reaches aggregate events without killing unrelated leaves`, { timeout: 30000 }, async () => {
    const f = await fixture();
    try {
      await NativeWorkerOwnership.supervise(f.options, async owner => {
        // Test vectors, not new production defaults: the parent must have room
        // for three hosts so pressure reaches the stricter helper ceiling first.
        const lease = await owner.allocate(identity, { memoryBytes: 256 * 1024 * 1024, tasks: 64 });
        const host = await lease.launch(f.command); const hostExit = once(host, 'exit');
        await membership(host);
        const authority = lease.launchAuthority();
        const idle = await authority.launch(f.command); const idleExit = once(idle, 'exit');
        await membership(idle);
        const before = lease.observe();
        const program = resource === 'memory'
          ? 'const bytes=Buffer.alloc(128*1024*1024,1);setInterval(()=>console.log(bytes.length),1000);'
          : 'const {spawn}=require("node:child_process");let reported=false;for(let i=0;i<64;i++)'
            + 'spawn("/bin/sleep",["30"],{stdio:"ignore"}).on("error",error=>{'
            + 'if(error.code!=="EAGAIN")throw error;if(!reported){reported=true;console.log("task-denied");}});setInterval(()=>{},1000);';
        const pressure = await authority.launch({ ...f.command, arguments: ['-e', program],
          resourceLimits: { memoryBytes: 64 * 1024 * 1024, tasks: 16 } });
        pressure.stderr.resume();
        const pressureExit = boundedExit(pressure);
        // Keep the promise observed while waiting for the task-denial message.
        void pressureExit.catch(() => {});
        if (resource === 'memory') {
          pressure.stdout.resume();
          assert.deepEqual(await pressureExit, [null, 'SIGKILL']);
        } else assert.match(await membership(pressure), /task-denied/u);
        const [record] = await f.store.records(); assert(record);
        const aggregate = path.join(root!, record.scopeName);
        const child = record.topology.children.at(-1)!;
        const leaf = path.join(aggregate, child.name);
        const file = resource === 'memory' ? 'memory.events.local' : 'pids.events.local';
        const field = resource === 'memory' ? 'oom_kill' : 'max';
        const local = await localEvent(leaf, file, field);
        assert.ok(local > 0, 'actual kernel enforcement must occur in the pressure leaf');
        assert.equal(await localEvent(aggregate, file, field), 0, 'the aggregate ceiling must not be the exhausted ceiling');
        const observed = lease.observe();
        if (resource === 'memory') assert.ok(observed.oomKills >= before.oomKills + local);
        else assert.ok(observed.taskLimitHits >= before.taskLimitHits + local);
        assert.equal(host.exitCode, null); assert.equal(host.signalCode, null);
        assert.equal(idle.exitCode, null); assert.equal(idle.signalCode, null);
        const final = await lease.finish();
        await Promise.all([hostExit, idleExit, pressureExit]);
        assert.equal(final.populated, false);
        assert.deepEqual((await f.store.records())[0]?.finalObservation, final);
        await assert.rejects(fs.stat(aggregate), { code: 'ENOENT' });
      });
    } finally { await fs.rm(f.stateRoot, { recursive: true, force: true }); }
  });
}

test('a registered real child name with a different inode blocks recovery and preserves the replacement', { timeout: 30000 }, async () => {
  const f = await recoverableFixture();
  const host = path.join(f.aggregate, 'host');
  // Pin the old inode so removal/recreation cannot accidentally recycle it.
  const original = await fs.open(host, 'r');
  let replaced = false;
  try {
    await fs.rmdir(host); await fs.mkdir(host); replaced = true;
    const replacement = await fs.stat(host);
    assert.notEqual(replacement.ino, f.record.topology.children[0]!.binding!.inode);
    let admitted = false;
    await assert.rejects(NativeWorkerOwnership.supervise(f.options, async () => { admitted = true; }), /CHILD_BINDING_CHANGED/);
    assert.equal(admitted, false);
    assert.equal((await fs.stat(host)).ino, replacement.ino, 'recovery must preserve the unbound replacement');
    assert.equal((await f.store.records())[0]?.phase, 'unresolved');
  } finally {
    await original.close();
    // Only this test owns the intentionally substituted empty cgroup.
    if (replaced) await fs.rmdir(host);
    await cleanupRecoverable(f);
  }
});

test('a nested real cgroup under an owned leaf blocks recovery without recursive deletion', { timeout: 30000 }, async () => {
  const f = await recoverableFixture();
  const nested = path.join(f.aggregate, 'host', 'unexpected-nested');
  try {
    await fs.mkdir(nested);
    let admitted = false;
    await assert.rejects(NativeWorkerOwnership.supervise(f.options, async () => { admitted = true; }), /UNKNOWN_CHILD/);
    assert.equal(admitted, false); assert.equal((await fs.stat(nested)).isDirectory(), true);
    await fs.rmdir(nested);
    await NativeWorkerOwnership.supervise(f.options, async () => {});
    assert.equal((await f.store.records())[0]?.phase, 'disposed');
  } finally {
    try { await fs.rmdir(nested); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await cleanupRecoverable(f);
  }
});

test('real descendant is drained despite injected quiescing persistence failure, with groups retained for recovery', { timeout: 30000 }, async () => {
  const f = await fixture(); const transition = f.store.transition.bind(f.store);
  try {
    await assert.rejects(NativeWorkerOwnership.supervise(f.options, async owner => {
      const lease = await owner.allocate(identity, limits);
      const program = 'const {spawn}=require("node:child_process");const child=spawn("/bin/sleep",["30"],{stdio:"ignore"});'
        + 'child.on("spawn",()=>console.log(child.pid));child.on("error",error=>{throw error});setInterval(()=>{},1000);';
      const host = await lease.launch({ ...f.command, arguments: ['-e', program] });
      const hostExit = once(host, 'exit');
      const descendant = await membership(host); assert.match(descendant, /^\d+$/u);
      const [record] = await f.store.records(); assert(record);
      const aggregate = path.join(root!, record.scopeName);
      const members = (await fs.readFile(path.join(aggregate, 'host', 'cgroup.procs'), 'utf8')).trim().split('\n');
      assert.ok(members.includes(descendant), 'the actual long-lived descendant must be present before the fault');
      f.store.transition = async (current, phase, change) => {
        if (phase === 'quiescing') throw new Error('injected-quiescing-persistence-failure');
        return transition(current, phase, change);
      };
      await assert.rejects(lease.finish(), /injected-quiescing-persistence-failure/);
      await hostExit;
      assert.match(await fs.readFile(path.join(aggregate, 'cgroup.events'), 'utf8'), /^populated 0$/mu);
      assert.equal((await fs.stat(path.join(aggregate, 'host'))).isDirectory(), true);
      const [retained] = await f.store.records();
      assert.equal(retained?.phase, 'unresolved'); assert.equal(retained?.finalObservation, null);
      assert.equal(owner.isReady(), false, 'failed finalization must not return pool capacity');
    }), /WORKER_NATIVE_SUPERVISOR_UNRESOLVED/);
    f.store.transition = transition;
    await NativeWorkerOwnership.supervise(f.options, async () => {});
    const [disposed] = await f.store.records(); assert(disposed);
    assert.equal(disposed.phase, 'disposed'); assert.equal(disposed.finalObservation?.populated, false);
    await assert.rejects(fs.stat(path.join(root!, disposed.scopeName)), { code: 'ENOENT' });
  } finally {
    f.store.transition = transition;
    // Restore only the injected method, then use the original recovery path for cleanup.
    await NativeWorkerOwnership.supervise(f.options, async () => {});
    await fs.rm(f.stateRoot, { recursive: true, force: true });
  }
});
