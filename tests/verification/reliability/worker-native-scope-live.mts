import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { NativeWorkerResourceScope } from '../../../skills/worker/core/worker/native-resource-scope.ts';

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
