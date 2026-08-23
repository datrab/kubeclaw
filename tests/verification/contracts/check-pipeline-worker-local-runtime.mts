import assert from 'node:assert/strict';
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
  now: () => new Date('2026-08-05T12:30:00Z') };
const worker = new LocalWorkerRuntime(options);
assert.equal(worker.state, 'starting');
assert.equal(worker.registration().capacity.available, 2);
assert.throws(() => worker.runAttempt(envelope(workerProfile), async () => undefined), /WORKER_LOCAL_NOT_READY/);
assert.equal(worker.markReady().lifecycleState, 'ready');

let finishFirst!: () => void;
let finishSecond!: () => void;
const firstEnvelope = envelope(workerProfile);
const secondEnvelope = envelope(workerProfile);
const first = worker.runAttempt(firstEnvelope, async () => new Promise<void>((resolve) => { finishFirst = resolve; }));
const second = worker.runAttempt(secondEnvelope, async () => new Promise<void>((resolve) => { finishSecond = resolve; }));
assert.deepEqual(worker.health().activeAttemptIds, [firstEnvelope.attemptId, secondEnvelope.attemptId]);
assert.throws(() => worker.runAttempt(envelope(workerProfile), async () => undefined), /WORKER_LOCAL_CAPACITY_EXHAUSTED/);
const draining = worker.drain();
assert.equal(worker.state, 'draining');
assert.throws(() => worker.runAttempt(envelope(workerProfile), async () => undefined), /WORKER_LOCAL_NOT_READY/);
await Promise.resolve();
finishFirst(); finishSecond();
await Promise.all([first, second, draining]);
assert.equal(worker.state, 'stopped');
assert.equal(worker.health().capacity.active, 0);

const cancelling = new LocalWorkerRuntime({ ...options, capacity: 1, drainTimeoutMs: 5, cancellationTimeoutMs: 100 });
cancelling.markReady();
let sawCancellation = false;
const cancelledEnvelope = envelope(workerProfile);
const cancelledAttempt = cancelling.runAttempt(cancelledEnvelope, async (signal) => new Promise<void>((resolve) => {
  signal.addEventListener('abort', () => { sawCancellation = true; setTimeout(resolve, 5); }, { once: true });
}));
await cancelling.drain();
await cancelledAttempt;
assert.equal(sawCancellation, true);
assert.equal(cancelling.state, 'stopped');

const unhealthy = new LocalWorkerRuntime({ ...options, capacity: 1 });
unhealthy.markReady();
assert.equal(unhealthy.markUnhealthy().lifecycleState, 'unhealthy');
assert.throws(() => unhealthy.runAttempt(envelope(workerProfile), async () => undefined), /WORKER_LOCAL_NOT_READY/);
assert.equal(unhealthy.stop().lifecycleState, 'stopped');

const validation = new LocalWorkerRuntime({ ...options, capacity: 1 });
validation.markReady();
assert.throws(() => validation.runAttempt(envelope(workerProfile, 'worker:other'), async () => undefined),
  /WORKER_LOCAL_CLAIM_WORKER_MISMATCH/);
const wrongProfile = { ...workerProfile, profileId: 'buster.other' };
wrongProfile.profileDigest = workerProfileDigest(wrongProfile);
assert.throws(() => validation.runAttempt(envelope(wrongProfile), async () => undefined),
  /WORKER_LOCAL_PROFILE_UNSUPPORTED/);
const expiredClaim = envelope(workerProfile);
expiredClaim.claim.expiresAt = '2026-08-05T12:29:00Z';
expiredClaim.attemptSpecDigest = workerAttemptSpecDigest(expiredClaim);
assert.throws(() => validation.runAttempt(expiredClaim, async () => undefined), /WORKER_LOCAL_CLAIM_EXPIRED/);
const futureClaim = envelope(workerProfile);
futureClaim.claim.claimedAt = '2026-08-05T12:31:00Z';
futureClaim.attemptSpecDigest = workerAttemptSpecDigest(futureClaim);
assert.throws(() => validation.runAttempt(futureClaim, async () => undefined), /WORKER_LOCAL_CLAIM_NOT_ACTIVE/);
const expiredQueue = envelope(workerProfile);
expiredQueue.queueDeadline = '2026-08-05T12:30:00Z';
expiredQueue.attemptSpecDigest = workerAttemptSpecDigest(expiredQueue);
assert.throws(() => validation.runAttempt(expiredQueue, async () => undefined), /WORKER_LOCAL_QUEUE_DEADLINE_EXPIRED/);
let deferredClockReads = 0;
const deferredWorker = new LocalWorkerRuntime({ ...options, capacity: 1,
  now: () => new Date(++deferredClockReads >= 5 ? '2026-08-05T12:30:00.002Z' : '2026-08-05T12:30:00Z') });
deferredWorker.markReady();
const deferredEnvelope = envelope(workerProfile);
deferredEnvelope.queueDeadline = '2026-08-05T12:30:00.001Z';
deferredEnvelope.attemptSpecDigest = workerAttemptSpecDigest(deferredEnvelope);
let deferredStarted = false;
const deferredAttempt = deferredWorker.runAttempt(deferredEnvelope, async () => { deferredStarted = true; });
await assert.rejects(deferredAttempt, /WORKER_LOCAL_QUEUE_DEADLINE_EXPIRED/);
assert.equal(deferredStarted, false, 'the queue deadline is checked again before work starts');
deferredWorker.stop();
const duplicateEnvelope = envelope(workerProfile);
await validation.runAttempt(duplicateEnvelope, async () => undefined);
assert.throws(() => validation.runAttempt(duplicateEnvelope, async () => undefined), /WORKER_LOCAL_ATTEMPT_DUPLICATE/);

let replayNow = new Date('2026-08-05T12:30:00Z');
const boundedReplayWorker = new LocalWorkerRuntime({ ...options, capacity: 1, replayLimit: 1, now: () => replayNow });
boundedReplayWorker.markReady();
const rememberedEnvelope = envelope(workerProfile);
rememberedEnvelope.claim.expiresAt = '2026-08-05T12:31:00Z';
rememberedEnvelope.attemptSpecDigest = workerAttemptSpecDigest(rememberedEnvelope);
await boundedReplayWorker.runAttempt(rememberedEnvelope, async () => undefined);
assert.throws(() => boundedReplayWorker.runAttempt(envelope(workerProfile), async () => undefined),
  /WORKER_LOCAL_REPLAY_CAPACITY_EXHAUSTED/, 'the replay guard has a fixed memory bound');
replayNow = new Date('2026-08-05T12:31:00Z');
await boundedReplayWorker.runAttempt(envelope(workerProfile), async () => undefined);
boundedReplayWorker.stop();

const realTimeWorker = new LocalWorkerRuntime({ ...options, capacity: 1, now: () => new Date() });
realTimeWorker.markReady();
const expiringEnvelope = envelope(workerProfile);
const issued = new Date();
expiringEnvelope.issuedAt = issued.toISOString();
expiringEnvelope.claim.claimedAt = issued.toISOString();
expiringEnvelope.claim.expiresAt = new Date(issued.getTime() + 10).toISOString();
expiringEnvelope.queueDeadline = new Date(issued.getTime() + 1000).toISOString();
expiringEnvelope.attemptSpecDigest = workerAttemptSpecDigest(expiringEnvelope);
let claimExpiryObserved = false;
await assert.rejects(realTimeWorker.runAttempt(expiringEnvelope, async (signal) => new Promise<void>((resolve) => {
  signal.addEventListener('abort', () => { claimExpiryObserved = true; resolve(); }, { once: true });
})), /WORKER_LOCAL_CLAIM_EXPIRED/);
assert.equal(claimExpiryObserved, true, 'an active attempt is cancelled when its claim expires');
realTimeWorker.stop();

const lateResultWorker = new LocalWorkerRuntime({ ...options, capacity: 1, now: () => new Date() });
lateResultWorker.markReady();
const lateResultEnvelope = envelope(workerProfile);
const lateIssued = new Date();
lateResultEnvelope.issuedAt = lateIssued.toISOString();
lateResultEnvelope.claim.claimedAt = lateIssued.toISOString();
lateResultEnvelope.claim.expiresAt = new Date(lateIssued.getTime() + 10).toISOString();
lateResultEnvelope.queueDeadline = new Date(lateIssued.getTime() + 1000).toISOString();
lateResultEnvelope.attemptSpecDigest = workerAttemptSpecDigest(lateResultEnvelope);
await assert.rejects(lateResultWorker.runAttempt(lateResultEnvelope,
  async () => new Promise((resolve) => setTimeout(() => resolve('late'), 20))), /WORKER_LOCAL_CLAIM_EXPIRED/);
lateResultWorker.stop();

console.log(JSON.stringify({ ok: true, phase: '5.5-D', states: ['starting', 'ready', 'draining', 'stopped', 'unhealthy'] }));
