import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import test from 'node:test';
import { runNativeWorkerProcess, type NativeWorkerProcessLimits } from '../../../skills/worker/core/worker/native-worker-process.ts';
import type { NativeWorkerOwnership } from '../../../skills/worker/core/worker/native-worker-ownership.ts';
import { validateChildLimits } from '../../../skills/worker/core/worker/ownership-children.ts';
import type { NativeWorkerResourceObservation } from '../../../skills/worker/core/worker/native-resource-observation.ts';

const policy: NativeWorkerProcessLimits = { memoryBytes: 1048576, tasks: 8, cpuTimeMs: 100,
  timeoutMs: 2000, pollIntervalMs: 10, maximumInputBytes: 16, maximumOutputBytes: 16, closeTimeoutMs: 1000 };
const identity = { workerId: 'test', attemptId: 'attempt', claimId: 'claim', generation: 1,
  profileDigest: 'a'.repeat(64), attemptSpecDigest: 'b'.repeat(64) };
const empty: NativeWorkerResourceObservation = { unit: 'linux-tasks', cpuTimeMicroseconds: 0,
  maximumMemoryBytes: 0, maximumTasks: 0, populated: false, oomKills: 0, taskLimitHits: 0 };

// Explicit ownership model: real process I/O/timers, no kernel accounting proof.
function modeledOwner(program: string, observation = empty) {
  let child: ChildProcessWithoutNullStreams | undefined;
  let allocations = 0;
  let finishes = 0;
  const owner = { allocate: async (actualIdentity: unknown, limits: unknown) => {
    allocations++;
    assert.deepEqual(actualIdentity, identity);
    validateChildLimits(limits);
    assert.deepEqual(limits, { memoryBytes: policy.memoryBytes, tasks: policy.tasks });
    return { launch: async () => {
      child = spawn(process.execPath, ['-e', program], { stdio: 'pipe' });
      return child;
    }, launchAuthority: () => undefined, observe: () => observation,
    finish: async () => { finishes++; child?.kill('SIGKILL'); return observation; } };
  } } as unknown as NativeWorkerOwnership;
  return { owner, allocations: () => allocations, finishes: () => finishes };
}

async function execute(program: string, changes: Partial<NativeWorkerProcessLimits> = {}, observation = empty) {
  const model = modeledOwner(program, observation);
  const result = await runNativeWorkerProcess({ owner: model.owner, identity, limits: { ...policy, ...changes },
    command: {} as Parameters<typeof runNativeWorkerProcess>[0]['command'], input: Buffer.from('hello') });
  assert.equal(model.allocations(), 1);
  assert.ok(model.finishes() >= 1);
  return result;
}

test('full process policy reaches real child I/O with only scope limits allocated', async () => {
  const result = await execute('process.stdin.pipe(process.stdout)');
  assert.equal(result.fault, null);
  assert.equal(Buffer.from(result.stdout).toString(), 'hello');
});

test('process input budget rejects before allocating a scope', async () => {
  const model = modeledOwner('process.exit(0)');
  await assert.rejects(runNativeWorkerProcess({ owner: model.owner, identity,
    limits: { ...policy, maximumInputBytes: 1 }, command: {} as Parameters<typeof runNativeWorkerProcess>[0]['command'],
    input: Buffer.from('hello') }), /WORKER_NATIVE_INPUT_LIMIT/);
  assert.equal(model.allocations(), 0);
});

test('real child output and deadline still use the complete process policy', async () => {
  const output = await execute('process.stdin.resume(); process.stdout.write("x".repeat(17)); setInterval(() => {}, 1000)');
  assert.equal(output.fault, 'WORKER_NATIVE_OUTPUT_LIMIT');
  const deadline = await execute('process.stdin.resume(); setInterval(() => {}, 1000)', { timeoutMs: 100 });
  assert.equal(deadline.fault, 'WORKER_ATTEMPT_TIMEOUT');
});

test('modeled measured CPU policy remains enforced after scope projection', async () => {
  const result = await execute('process.stdin.resume(); setInterval(() => {}, 1000)', {},
    { ...empty, cpuTimeMicroseconds: policy.cpuTimeMs * 1000 + 1 });
  assert.equal(result.fault, 'WORKER_CPU_LIMIT');
});
