import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import type { WorkerAttemptEnvelopeV1, WorkerProfileV1 } from '../../../contracts/pipeline-worker-core/v1/src/types.ts';
import { workerAttemptSpecDigest, workerProfileDigest } from '../../../contracts/pipeline-worker-core/v1/src/digest.ts';
import { LocalWorkerRuntime } from '../../../skills/worker/core/worker/local-runtime.ts';

const contentDigest = `sha256:${'a'.repeat(64)}`;

function profile(): WorkerProfileV1 {
  const unsigned = {
    schemaVersion: 'worker-profile.v1' as const,
    profileId: 'buster.local',
    workerType: 'buster',
    coreContractId: 'kubeclaw.worker-core@1',
    engine: { engineId: 'buster', contractId: 'kubeclaw.buster@1', engineVersion: '1.0.0', contentDigest },
    capabilities: ['provider.execute'],
  };
  return { ...unsigned, profileDigest: workerProfileDigest(unsigned) };
}

let attemptNumber = 0;
function envelope(workerProfile: WorkerProfileV1, workerId = 'worker:buster:local'): WorkerAttemptEnvelopeV1 {
  attemptNumber += 1;
  const attemptId = `attempt:local:${attemptNumber}`;
  const unsigned = {
    schemaVersion: 'worker-attempt-envelope.v1' as const,
    protocolVersion: 'worker-protocol.v1' as const,
    pipelineRunId: 'run:local', moduleId: 'app', gateId: null, planId: 'plan:local', nodeId: `node:${attemptNumber}`,
    executionId: `execution:${attemptNumber}`, attemptId, attemptNumber,
    claim: { schemaVersion: 'attempt-claim.v1' as const, claimId: `claim:${attemptNumber}`, attemptId,
      generation: 1, workerId, claimedAt: '2026-08-05T12:00:00Z', expiresAt: '2026-08-05T14:00:00Z' },
    profile: workerProfile, packages: [], grantedCapabilities: [],
    limits: { timeoutMs: 1000, cleanupTimeoutMs: 1000, cpuMillis: 1000, memoryBytes: 1024,
      processes: 1, logBytes: 1024, resultBytes: 1024, evidenceBytes: 1024, evidenceFiles: 1 },
    inputs: [], operation: { contractId: 'kubeclaw.test@1', inputSchemaId: 'kubeclaw.test.v1',
      inputSchemaDigest: contentDigest, values: {} },
    cancellationId: `cancel:${attemptNumber}`, issuedAt: '2026-08-05T12:00:00Z',
    queueDeadline: '2026-08-05T13:00:00Z',
  };
  return { ...unsigned, attemptSpecDigest: workerAttemptSpecDigest(unsigned) };
}

const workerProfile = profile();
const options = { workerId: 'worker:buster:local', workerType: 'buster', coreVersion: '1.0.0',
  protocolVersions: ['worker-protocol.v1'] as const, profiles: [workerProfile], capacity: 2,
  drainTimeoutMs: 300000, cancellationTimeoutMs: 30000, replayLimit: 65536,
  now: () => new Date('2026-08-05T12:30:00Z') };

for (const [field, maximum, code] of [
  ['drainTimeoutMs', 2_147_483_647, 'WORKER_LOCAL_DRAIN_TIMEOUT_INVALID'],
  ['cancellationTimeoutMs', 2_147_483_647, 'WORKER_LOCAL_CANCELLATION_TIMEOUT_INVALID'],
  ['replayLimit', 1_000_000, 'WORKER_LOCAL_REPLAY_LIMIT_INVALID'],
] as const) {
  test(`Core requires explicit valid ${field}`, () => {
    for (const value of [undefined, null, true, '1', 0, -1, 1.5, maximum + 1, NaN, Infinity]) {
      const candidate: Record<string, unknown> = { ...options, [field]: value };
      if (value === undefined) delete candidate[field];
      assert.throws(() => new LocalWorkerRuntime(candidate as unknown as typeof options),
        new RegExp(code), `${field}=${String(value)}`);
    }
    for (const value of [1, maximum]) {
      assert.doesNotThrow(() => new LocalWorkerRuntime({ ...options, [field]: value }));
    }
  });
}

for (const policy of [
  { drainTimeoutMs: 10, cancellationTimeoutMs: 40, replayLimit: 1 },
  { drainTimeoutMs: 40, cancellationTimeoutMs: 10, replayLimit: 2 },
]) {
  test(`real drain/cancellation ${policy.drainTimeoutMs}/${policy.cancellationTimeoutMs}`, { timeout: 5_000 }, async () => {
    const runtime = new LocalWorkerRuntime({ ...options, ...policy });
    runtime.markReady();
    let release!: () => void;
    let aborted!: () => void;
    const abortedPromise = new Promise<void>(resolve => { aborted = resolve; });
    let abortAt = 0;
    const attempt = runtime.runAttempt(envelope(workerProfile), signal => new Promise<void>(resolve => {
      release = resolve;
      signal.addEventListener('abort', () => { abortAt = performance.now(); aborted(); }, { once: true });
    }));
    const start = performance.now();
    const drain = assert.rejects(runtime.drain(), /WORKER_LOCAL_DRAIN_TIMEOUT/);
    assert.equal(runtime.state, 'draining');
    await abortedPromise;
    assert(abortAt - start >= policy.drainTimeoutMs - 1, 'drain deadline must precede abort');
    await drain;
    assert.equal(runtime.state, 'unhealthy', 'unsettled real attempt exceeds cancellation budget');
    assert(performance.now() - abortAt >= policy.cancellationTimeoutMs - 1);
    release();
    await attempt;
    assert.equal(runtime.health().activeAttemptIds.length, 0);
  });
  test(`real replay saturation/reclaim ${policy.replayLimit}`, async () => {
    let now = new Date('2026-08-05T12:30:00Z');
    const runtime = new LocalWorkerRuntime({ ...options, ...policy, now: () => now });
    runtime.markReady();
    for (let index = 0; index < policy.replayLimit; index++) {
      await runtime.runAttempt(envelope(workerProfile), async () => undefined);
    }
    assert.throws(() => runtime.runAttempt(envelope(workerProfile), async () => undefined),
      /WORKER_LOCAL_REPLAY_CAPACITY_EXHAUSTED/);
    now = new Date('2026-08-05T14:00:00Z');
    const expired = envelope(workerProfile);
    const renewed = { ...expired, claim: { ...expired.claim, claimedAt: now.toISOString(), expiresAt: '2026-08-05T15:00:00Z' },
      issuedAt: now.toISOString(), queueDeadline: '2026-08-05T14:30:00Z' };
    const fresh = { ...renewed, attemptSpecDigest: workerAttemptSpecDigest(renewed) };
    await runtime.runAttempt(fresh, async () => undefined);
    await runtime.drain();
    assert.equal(runtime.state, 'stopped');
  });
}
