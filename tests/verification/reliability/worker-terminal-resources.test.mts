import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkerAttemptExecutor, type WorkerAttemptOperation } from '../../../skills/worker/core/worker/attempt-executor.ts';
import { workerAttemptSpecDigest, workerProfileDigest } from '../../../skills/worker/core/worker/digest.ts';
import { checkWorkerResourceResultBinding, type WorkerAttemptEnvelopeV1, type WorkerAttemptEnvelopeV2 } from '@kubeclaw/pipeline-worker-core-contract';
import { envelope } from './worker-deadline-fixture.mts';

function cpuMillis(baseline: NodeJS.CpuUsage): number {
  const usage = process.cpuUsage(baseline);
  return Math.ceil((usage.user + usage.system) / 1000);
}

function consumeCpu(): void {
  const baseline = process.cpuUsage();
  while (cpuMillis(baseline) < 200) pbkdf2Sync('native CPU workload', 'salt', 10_000, 32, 'sha256');
}

// The workload is deliberately local synchronous CPU and file I/O in this
// serial test process. It spawns no children and makes no assertion about
// production Prism/Buster attribution or native cgroup enforcement.
async function run(phase: 'execute' | 'cleanup' | 'finalize' | 'none', failFinalMeasurement = false, v2 = false) {
  const root = await mkdtemp(join(tmpdir(), 'worker-terminal-resource-'));
  const attempt = envelope(60_000, 3000);
  attempt.limits = { ...attempt.limits, timeoutMs: 5000, cpuMillis: phase === 'none' ? 100_000 : 100 };
  attempt.attemptSpecDigest = workerAttemptSpecDigest(attempt);
  let baseline = process.cpuUsage();
  const measurements: number[] = [];
  let finalizationStarted = false;
  const operation: WorkerAttemptOperation = {
    prepare() { baseline = process.cpuUsage(); return undefined; },
    async execute({ signal }) {
      await writeFile(join(root, 'operation'), 'executed', { signal });
      if (phase === 'execute') consumeCpu();
      return { summary: 'Native file and CPU operation', specialistResult: {
        schemaId: 'kubeclaw.file.v1', schemaDigest: attempt.operation.inputSchemaDigest, values: { done: true },
      }, evidence: [], exitCode: 0, signal: null };
    },
    async terminate() { await writeFile(join(root, 'terminated'), 'settled'); },
    async measure({ signal }) {
      signal.throwIfAborted();
      // Actual I/O failure after finalization must not certify the early sample.
      if (failFinalMeasurement && finalizationStarted) await readFile(join(root, 'absent-resource-observation'));
      const cpuTimeMs = cpuMillis(baseline);
      measurements.push(cpuTimeMs);
      return { cpuTimeMs, maximumMemoryBytes: process.resourceUsage().maxRSS * 1024, maximumProcesses: 1 };
    },
    async cleanup({ signal }) {
      if (phase === 'cleanup') consumeCpu();
      await writeFile(join(root, 'cleanup'), 'settled', { signal });
    },
    async finalizeResult({ signal, specialistResult }) {
      finalizationStarted = true;
      if (phase === 'finalize') consumeCpu();
      await writeFile(join(root, 'finalized'), 'settled', { signal });
      return specialistResult;
    },
  };
  try {
    const result = v2 ? await executeV2(attempt, operation) : await new WorkerAttemptExecutor({ envelope: attempt, operation }).execute();
    assert.equal(await readFile(join(root, 'cleanup'), 'utf8'), 'settled');
    return { result, measurements, finalizationStarted };
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function executeV2(attempt: WorkerAttemptEnvelopeV1, operation: WorkerAttemptOperation) {
  const { cpuMillis, memoryBytes, processes, ...limits } = attempt.limits;
  const profile = { ...attempt.profile, schemaVersion: 'worker-profile.v2' as const,
    resourceCapabilities: { schemaVersion: 'worker-resource-capabilities.v1' as const,
      cpuTimeMs: { scope: 'serial-test-process-window', unit: 'milliseconds' as const, measurement: 'measured' as const },
      maximumMemoryBytes: { scope: 'test-process-lifetime-peak-rss', unit: 'bytes' as const, measurement: 'measured' as const },
      maximumProcesses: { scope: 'single-process-test-workload', unit: 'processes' as const, measurement: 'measured' as const },
    } };
  profile.profileDigest = workerProfileDigest(profile);
  const accepted: WorkerAttemptEnvelopeV2 = { ...attempt, schemaVersion: 'worker-attempt-envelope.v2', profile, limits,
    resourceBudgets: { schemaVersion: 'worker-resource-budgets.v1', cpuTimeMs: { state: 'requested', limit: cpuMillis },
      maximumMemoryBytes: { state: 'requested', limit: memoryBytes }, maximumProcesses: { state: 'requested', limit: processes } } };
  accepted.attemptSpecDigest = workerAttemptSpecDigest(accepted);
  const owned: WorkerAttemptOperation<WorkerAttemptEnvelopeV2> = {
    prepare: () => operation.prepare(attempt.limits),
    execute: context => operation.execute({ ...context, attempt }),
    terminate: () => operation.terminate(),
    cleanup: context => operation.cleanup!({ ...context, attempt }),
    finalizeResult: context => operation.finalizeResult!({ ...context, attempt }),
    async measure(context) {
      const value = await operation.measure(context);
      return { cpuTimeMs: { status: 'observed', value: value.cpuTimeMs },
        maximumMemoryBytes: { status: 'observed', value: value.maximumMemoryBytes },
        maximumProcesses: { status: 'observed', value: value.maximumProcesses } };
    },
  };
  const result = await new WorkerAttemptExecutor({ envelope: accepted, operation: owned }).execute();
  assert.equal(checkWorkerResourceResultBinding(accepted, result).ok, true);
  return result;
}

for (const phase of ['cleanup', 'finalize'] as const) test(`real CPU consumed only during ${phase} is included in the terminal budget`, async () => {
  const { result, measurements } = await run(phase);
  assert.equal(measurements.length, 2);
  assert(measurements[0]! < 100, `execution unexpectedly consumed ${measurements[0]} ms`);
  assert(measurements[1]! >= 200);
  assert.equal(result.error?.code, 'WORKER_CPU_LIMIT');
  assert.equal(result.resources.cpuTimeMs, measurements[1]);
  assert.equal(result.state, 'errored');
});

test('early native CPU overrun still prevents optional report finalization', async () => {
  const { result, measurements, finalizationStarted } = await run('execute');
  assert.equal(result.error?.code, 'WORKER_CPU_LIMIT');
  assert.equal(finalizationStarted, false);
  assert.equal(measurements.length, 2);
});

test('missing final observation cannot reuse a successful early CPU sample', async () => {
  const { result, measurements, finalizationStarted } = await run('none', true);
  assert.equal(finalizationStarted, true);
  assert.equal(measurements.length, 1);
  assert.equal(result.error?.code, 'WORKER_RESOURCE_MEASUREMENT_INVALID');
  assert.equal(result.resources.cpuTimeMs, undefined);
});

test('successful native operation publishes its final cumulative sample', async () => {
  const { result, measurements } = await run('none');
  assert.equal(result.state, 'completed', JSON.stringify(result.error));
  assert.equal(measurements.length, 2);
  assert(measurements[1]! >= measurements[0]!);
  assert.equal(result.resources.cpuTimeMs, measurements[1]);
});

test('V2 late native CPU overrun fails and retains exact accepted policy binding', async () => {
  const { result, measurements } = await run('finalize', false, true);
  assert.equal(result.error?.code, 'WORKER_RESOURCE_LIMIT');
  assert.equal(result.resources.cpuTimeMs, measurements[1]);
});

test('V2 missing final observation replaces earlier observations with unavailable facts', async () => {
  const { result } = await run('none', true, true);
  assert.equal(result.schemaVersion, 'worker-attempt-result.v2');
  if (result.schemaVersion !== 'worker-attempt-result.v2') throw new Error('Expected V2 receipt');
  assert.equal(result.error?.code, 'WORKER_RESOURCE_MEASUREMENT_INVALID');
  for (const metric of ['cpuTimeMs', 'maximumMemoryBytes', 'maximumProcesses'] as const) {
    assert.equal(result.resources[metric], undefined);
    assert.equal(result.resourceAccounting.observations[metric].status, 'unavailable');
  }
});
