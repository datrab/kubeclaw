import assert from 'node:assert/strict';
import {
  type WorkerAttemptEnvelopeV1,
  type WorkerEvidenceRefV1,
  type WorkerProfileV1,
} from '../../../contracts/pipeline-worker-core/v1/src/types.ts';
import {
  WorkerAttemptExecutor,
  type WorkerAttemptContext,
  type WorkerAttemptEvidenceResult,
  type WorkerAttemptOperation,
  type WorkerAttemptOperationResources,
  type WorkerAttemptOperationResult,
} from '../../../skills/worker/core/worker/attempt-executor.ts';
import {
  sha256Digest,
  sha256Text,
  workerAttemptSpecDigest,
  workerProfileDigest,
} from '../../../skills/worker/core/worker/digest.ts';

const schemaDigest = `sha256:${'b'.repeat(64)}`;
const packageDigest = `sha256:${'c'.repeat(64)}`;
let identity = 0;
const id = (): string => `id-${++identity}`;

function profile(): WorkerProfileV1 {
  const unsigned = {
    schemaVersion: 'worker-profile.v1' as const,
    profileId: 'buster.standard',
    workerType: 'buster',
    coreContractId: 'kubeclaw.worker-core@1',
    engine: {
      engineId: 'buster-test-engine',
      contractId: 'kubeclaw.buster-engine@1',
      engineVersion: '1.0.0',
      contentDigest: packageDigest,
    },
    capabilities: ['provider.execute'],
  };
  return { ...unsigned, profileDigest: workerProfileDigest(unsigned) };
}

function envelope(overrides: Partial<WorkerAttemptEnvelopeV1> = {}): WorkerAttemptEnvelopeV1 {
  const attemptId = overrides.attemptId ?? `attempt:unit:${id()}`;
  const workerProfile = profile();
  const unsigned = {
    schemaVersion: 'worker-attempt-envelope.v1' as const,
    protocolVersion: 'worker-protocol.v1' as const,
    pipelineRunId: 'run:unit',
    moduleId: 'api',
    gateId: 'test',
    planId: 'plan:unit',
    nodeId: 'unit',
    executionId: 'execution:unit',
    attemptId,
    attemptNumber: 1,
    claim: {
      schemaVersion: 'attempt-claim.v1' as const,
      claimId: `claim:${attemptId}`,
      attemptId,
      generation: 1,
      workerId: 'worker:buster:one',
      claimedAt: '2026-08-05T12:00:00Z',
      expiresAt: '2026-08-05T13:00:00Z',
    },
    profile: workerProfile,
    packages: [{ packageId: 'kubeclaw.unit-provider', packageVersion: '1.0.0', contentDigest: packageDigest }],
    grantedCapabilities: ['provider.execute'],
    limits: {
      timeoutMs: 1_000,
      cleanupTimeoutMs: 1_000,
      cpuMillis: 1_000,
      memoryBytes: 1_000_000,
      processes: 10,
      logBytes: 1_000,
      resultBytes: 1_000,
      evidenceBytes: 1_000,
      evidenceFiles: 10,
    },
    inputs: [],
    operation: {
      contractId: 'kubeclaw.test-attempt@1',
      inputSchemaId: 'kubeclaw.test-attempt-input.v1',
      inputSchemaDigest: schemaDigest,
      values: { providerContractId: 'kubeclaw.command-test@1' },
    },
    cancellationId: `cancel:${attemptId}`,
    issuedAt: '2026-08-05T12:00:00Z',
    queueDeadline: '2026-08-05T14:00:00Z',
    ...overrides,
  };
  const withoutDigest = { ...unsigned, attemptSpecDigest: '' };
  return { ...unsigned, attemptSpecDigest: workerAttemptSpecDigest(withoutDigest) };
}

const evidence = {
  evidenceId: 'report',
  type: 'report',
  artifact: {
    artifactId: 'artifact:report',
    type: 'report',
    mediaType: 'application/json',
    contentDigest: sha256Digest({ report: true }),
    sizeBytes: 10,
    storageUrl: 'artifact://report',
  },
} satisfies WorkerEvidenceRefV1;

function successResult(overrides: Partial<WorkerAttemptOperationResult> = {}): WorkerAttemptOperationResult {
  return {
    summary: 'Attempt passed.',
    specialistResult: { schemaId: 'kubeclaw.test-result.v1', schemaDigest, values: { outcome: 'passed' } },
    evidence: [evidence],
    exitCode: 0,
    signal: null,
    ...overrides,
  };
}

class Operation implements WorkerAttemptOperation {
  terminated = 0;
  cleaned = 0;
  readonly #run: WorkerAttemptOperation['execute'];
  readonly #useCleanup: boolean;
  readonly #resources: WorkerAttemptOperationResources;
  collectEvidence?: () => Promise<WorkerAttemptEvidenceResult>;
  prepared = 0;

  constructor(run: WorkerAttemptOperation['execute'], options: {
    cleanup?: boolean;
    resources?: WorkerAttemptOperationResources;
  } = {}) {
    this.#run = run;
    this.#useCleanup = options.cleanup ?? false;
    this.#resources = options.resources ?? { cpuTimeMs: 10, maximumMemoryBytes: 100, maximumProcesses: 1 };
  }

  async execute(context: Parameters<WorkerAttemptOperation['execute']>[0]) {
    return this.#run(context);
  }
  prepare(_limits: Parameters<WorkerAttemptOperation['prepare']>[0]) { this.prepared += 1; return undefined; }
  async terminate() { this.terminated += 1; }
  async measure() { return this.#resources; }
  async cleanup(_context: WorkerAttemptContext) { if (this.#useCleanup) this.cleaned += 1; }
}

const progress: number[] = [];
const logs: number[] = [];
const operation = new Operation(async (context) => {
  assert.equal(Object.isFrozen(context.attempt), true);
  context.log('stdout', 'hello\n');
  return successResult();
}, { cleanup: true });
const passed = await new WorkerAttemptExecutor({
  envelope: envelope(), operation, id,
  now: () => new Date('2026-08-05T12:30:00Z'),
  onProgress: (event) => { progress.push(event.sequence); },
  onLogPart: (part) => { logs.push(part.sequence); },
  storeFullLog: async () => ({ ...evidence, evidenceId: 'full-log', type: 'log', artifact: { ...evidence.artifact,
    artifactId: 'artifact:log', type: 'log', mediaType: 'text/plain', contentDigest: sha256Text('[stdout] hello\n'),
    sizeBytes: Buffer.byteLength('[stdout] hello\n') } }),
}).execute();
assert.equal(passed.state, 'completed');
assert.equal(passed.specialistResult?.values.outcome, 'passed');
assert.equal(passed.cleanup.state, 'completed');
assert.equal(operation.cleaned, 1);
assert.equal(operation.prepared, 1);
assert.deepEqual(progress, [0, 1, 2, 3, 4]);
assert.deepEqual(logs, [0, 1], 'live logs end with one terminal marker');
assert.equal(passed.evidence.length, 2);
assert.equal(passed.resources.logBytes, Buffer.byteLength('[stdout] hello\n'));
const { resultDigest: _resultDigest, receipt: _receipt, ...unsignedPassed } = passed;
assert.equal(passed.resultDigest, sha256Digest(unsignedPassed));
assert.match(passed.receipt.receiptDigest, /^sha256:[a-f0-9]{64}$/);

const collectedEvidence = structuredClone(evidence);
collectedEvidence.evidenceId = 'collected-report';
collectedEvidence.artifact.artifactId = 'artifact:collected-report';
const evidenceCollectionOperation = new Operation(async () => successResult({ evidence: [] }));
evidenceCollectionOperation.collectEvidence = async () => ({ evidence: [collectedEvidence] });
const evidenceCollectionResult = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: evidenceCollectionOperation, id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(evidenceCollectionResult.state, 'completed');
assert.deepEqual(evidenceCollectionResult.evidence.map((item) => item.evidenceId), ['collected-report']);
assert.equal(evidenceCollectionResult.resources.evidenceBytes, collectedEvidence.artifact.sizeBytes);

const reportedEvidenceFailureOperation = new Operation(async () => successResult({ evidence: [] }));
reportedEvidenceFailureOperation.collectEvidence = async () => ({
  evidence: [collectedEvidence],
  error: 'report storage failed',
});
const reportedEvidenceFailure = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: reportedEvidenceFailureOperation, id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(reportedEvidenceFailure.error?.code, 'WORKER_EVIDENCE_COLLECTION_FAILED');
assert.deepEqual(reportedEvidenceFailure.evidence.map((item) => item.evidenceId), ['collected-report'],
  'evidence collected before a reported storage failure remains available');

const thrownEvidenceFailureOperation = new Operation(async () => successResult({ evidence: [] }));
thrownEvidenceFailureOperation.collectEvidence = async () => { throw new Error('collection failed'); };
const thrownEvidenceFailure = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: thrownEvidenceFailureOperation, id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(thrownEvidenceFailure.error?.code, 'WORKER_EVIDENCE_COLLECTION_FAILED');

const collectedEvidenceLimitEnvelope = envelope();
collectedEvidenceLimitEnvelope.limits.evidenceBytes = 1;
collectedEvidenceLimitEnvelope.attemptSpecDigest = workerAttemptSpecDigest(collectedEvidenceLimitEnvelope);
const collectedEvidenceLimitOperation = new Operation(async () => successResult({ evidence: [] }));
collectedEvidenceLimitOperation.collectEvidence = async () => ({ evidence: [collectedEvidence] });
const collectedEvidenceLimited = await new WorkerAttemptExecutor({ envelope: collectedEvidenceLimitEnvelope,
  operation: collectedEvidenceLimitOperation, id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(collectedEvidenceLimited.error?.code, 'WORKER_EVIDENCE_BYTE_LIMIT');

let duplicateExecutions = 0;
const duplicateExecutor = new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async () => { duplicateExecutions += 1; return successResult(); }), id,
  now: () => new Date('2026-08-05T12:30:00Z') });
const [duplicateFirst, duplicateSecond] = await Promise.all([duplicateExecutor.execute(), duplicateExecutor.execute()]);
assert.equal(duplicateExecutions, 1, 'one executor runs one claim only once');
assert.equal(duplicateFirst, duplicateSecond, 'repeat calls return the same terminal result');

const badProfile = envelope();
badProfile.profile.profileDigest = sha256Digest({ wrong: true });
assert.throws(() => new WorkerAttemptExecutor({ envelope: badProfile, operation, id }),
  /profileDigest does not match the profile contents/);
const badSpec = envelope();
badSpec.attemptSpecDigest = sha256Digest({ wrong: true });
assert.throws(() => new WorkerAttemptExecutor({ envelope: badSpec, operation, id }),
  /attemptSpecDigest does not match the attempt contents/);
assert.throws(() => new WorkerAttemptExecutor({ envelope: envelope(), operation, id, receiptNamespace: '\uD800' }),
  /WORKER_RECEIPT_NAMESPACE_INVALID/);

const oversizedEnvelope = envelope();
oversizedEnvelope.operation.values.large = 'x'.repeat(17 * 1024 * 1024);
assert.throws(() => new WorkerAttemptExecutor({ envelope: oversizedEnvelope, operation, id }),
  /WORKER_ATTEMPT_INPUT_BYTE_LIMIT/);

const deepEnvelope = envelope();
let deepValue: Record<string, unknown> = {};
deepEnvelope.operation.values.deep = deepValue as never;
for (let depth = 0; depth < 70; depth += 1) {
  const next: Record<string, unknown> = {};
  deepValue.next = next;
  deepValue = next;
}
assert.throws(() => new WorkerAttemptExecutor({ envelope: deepEnvelope, operation, id }),
  /WORKER_ATTEMPT_INPUT_DEPTH_LIMIT/);

const mapEnvelope = envelope();
mapEnvelope.operation.values.map = new Map([['key', 'value']]) as never;
assert.throws(() => new WorkerAttemptExecutor({ envelope: mapEnvelope, operation, id }),
  /WORKER_ATTEMPT_INPUT_TYPE_INVALID/);

const timeoutOperation = new Operation(async () => new Promise<WorkerAttemptOperationResult>(() => undefined));
const timedOut = await new WorkerAttemptExecutor({ envelope: envelope({ limits: { ...envelope().limits, timeoutMs: 5 } }),
  operation: timeoutOperation, id, now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(timedOut.state, 'timed_out');
assert.equal(timeoutOperation.terminated > 0, true);

let completionNow = new Date('2026-08-05T12:30:00Z');
const blockingCompletionOperation = new Operation(async () => {
  completionNow = new Date('2026-08-05T12:30:02Z');
  return successResult();
});
const blockingCompletionEnvelope = envelope();
blockingCompletionEnvelope.limits.timeoutMs = 1_000;
blockingCompletionEnvelope.attemptSpecDigest = workerAttemptSpecDigest(blockingCompletionEnvelope);
const blockingCompletion = await new WorkerAttemptExecutor({ envelope: blockingCompletionEnvelope,
  operation: blockingCompletionOperation, id, now: () => completionNow }).execute();
assert.equal(blockingCompletion.error?.code, 'WORKER_ATTEMPT_TIMEOUT');

const preparationFailure = new Operation(async () => successResult());
preparationFailure.prepare = () => { throw new Error('limit setup failed'); };
const preparationFailed = await new WorkerAttemptExecutor({ envelope: envelope(), operation: preparationFailure, id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(preparationFailed.state, 'errored');

const asynchronousPreparation = new Operation(async () => successResult());
const invalidPrepare = () => Promise.reject(new Error('invalid asynchronous setup'));
asynchronousPreparation.prepare = invalidPrepare as unknown as WorkerAttemptOperation['prepare'];
const invalidPreparation = await new WorkerAttemptExecutor({ envelope: envelope(), operation: asynchronousPreparation, id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(invalidPreparation.error?.code, 'WORKER_PREPARATION_INVALID');

let preparationNow = new Date('2026-08-05T12:30:00Z');
let executedAfterPreparationTimeout = false;
const longPreparation = new Operation(async () => { executedAfterPreparationTimeout = true; return successResult(); });
longPreparation.prepare = () => { preparationNow = new Date('2026-08-05T12:30:02Z'); return undefined; };
const longPreparationEnvelope = envelope();
longPreparationEnvelope.limits.timeoutMs = 1_000;
longPreparationEnvelope.attemptSpecDigest = workerAttemptSpecDigest(longPreparationEnvelope);
const preparationTimedOut = await new WorkerAttemptExecutor({ envelope: longPreparationEnvelope,
  operation: longPreparation, id, now: () => preparationNow }).execute();
assert.equal(preparationTimedOut.error?.code, 'WORKER_ATTEMPT_TIMEOUT');
assert.equal(executedAfterPreparationTimeout, false);

let crossedDeadlinesNow = new Date('2026-08-05T12:30:00Z');
const crossedDeadlines = new Operation(async () => successResult());
crossedDeadlines.prepare = () => { crossedDeadlinesNow = new Date('2026-08-05T13:30:00Z'); return undefined; };
const crossedDeadlinesEnvelope = envelope({ queueDeadline: '2026-08-05T12:30:01.500Z' });
crossedDeadlinesEnvelope.limits.timeoutMs = 1_000;
crossedDeadlinesEnvelope.attemptSpecDigest = workerAttemptSpecDigest(crossedDeadlinesEnvelope);
const crossedDeadlinesResult = await new WorkerAttemptExecutor({ envelope: crossedDeadlinesEnvelope,
  operation: crossedDeadlines, id, now: () => crossedDeadlinesNow }).execute();
assert.equal(crossedDeadlinesResult.error?.code, 'WORKER_ATTEMPT_TIMEOUT',
  'the earliest crossed deadline controls terminal classification');

let queuePreparationNow = new Date('2026-08-05T12:30:00Z');
let executedAfterQueueDeadline = false;
const queuePreparation = new Operation(async () => { executedAfterQueueDeadline = true; return successResult(); });
queuePreparation.prepare = () => { queuePreparationNow = new Date('2026-08-05T12:30:00.002Z'); return undefined; };
const queuePreparationEnvelope = envelope({ queueDeadline: '2026-08-05T12:30:00.001Z' });
queuePreparationEnvelope.attemptSpecDigest = workerAttemptSpecDigest(queuePreparationEnvelope);
const queuePreparationExpired = await new WorkerAttemptExecutor({ envelope: queuePreparationEnvelope,
  operation: queuePreparation, id, now: () => queuePreparationNow }).execute();
assert.equal(queuePreparationExpired.error?.code, 'WORKER_QUEUE_DEADLINE_EXPIRED');
assert.equal(executedAfterQueueDeadline, false);

const cancellation = new AbortController();
const cancelOperation = new Operation(async ({ signal }) => new Promise<WorkerAttemptOperationResult>((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
}));
setTimeout(() => cancellation.abort(new Error('cancel')), 5);
const cancelled = await new WorkerAttemptExecutor({ envelope: envelope(), operation: cancelOperation,
  signal: cancellation.signal, id, now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(cancelled.state, 'cancelled');
assert.equal(cancelled.resources.cpuTimeMs, 10, 'failed attempts keep measured resource facts');

const cleanupCancellation = new AbortController();
let cleanupReceivedCancellation = false;
const cleanupCancellationOperation = new Operation(async () => successResult());
let cleanupCancellationTerminated = false;
cleanupCancellationOperation.terminate = async () => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  cleanupCancellationTerminated = true;
};
cleanupCancellationOperation.cleanup = async ({ signal }) => new Promise<void>((resolve) => {
  signal.addEventListener('abort', () => {
    cleanupReceivedCancellation = true;
    resolve();
  }, { once: true });
  setTimeout(() => cleanupCancellation.abort(new Error('cancel during cleanup')), 1);
});
const cancelledDuringCleanup = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: cleanupCancellationOperation, signal: cleanupCancellation.signal, id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(cleanupReceivedCancellation, true);
assert.equal(cleanupCancellationTerminated, true, 'terminal cancellation waits for provider termination');
assert.equal(cancelledDuringCleanup.state, 'cancelled');
assert.equal(cancelledDuringCleanup.error?.code, 'WORKER_ATTEMPT_CANCELLED');

const alreadyCancelled = new AbortController();
alreadyCancelled.abort(new Error('already cancelled'));
const preCancelled = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async () => successResult()), signal: alreadyCancelled.signal, id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(preCancelled.state, 'cancelled');

const logLimitEnvelope = envelope();
logLimitEnvelope.limits.logBytes = 1;
logLimitEnvelope.attemptSpecDigest = workerAttemptSpecDigest(logLimitEnvelope);
const logLimitOperation = new Operation(async (context) => {
  context.log('stdout', 'too much');
  return new Promise<WorkerAttemptOperationResult>(() => undefined);
});
const logLimited = await new WorkerAttemptExecutor({ envelope: logLimitEnvelope, operation: logLimitOperation,
  id, now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(logLimited.error?.code, 'WORKER_LOG_LIMIT');

const emptyLogEnvelope = envelope();
emptyLogEnvelope.limits.logBytes = 20;
emptyLogEnvelope.attemptSpecDigest = workerAttemptSpecDigest(emptyLogEnvelope);
const emptyLogLimited = await new WorkerAttemptExecutor({ envelope: emptyLogEnvelope,
  operation: new Operation(async (context) => {
    for (let index = 0; index < 10; index += 1) context.log('stdout', '');
    return new Promise<WorkerAttemptOperationResult>(() => undefined);
  }), id, storeFullLog: async (_attemptId, content) => ({ ...evidence, evidenceId: 'full-log', type: 'log',
    artifact: { ...evidence.artifact, artifactId: 'artifact:empty-log', type: 'log', mediaType: 'text/plain',
      contentDigest: sha256Text(content), sizeBytes: Buffer.byteLength(content) } }),
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(emptyLogLimited.error?.code, 'WORKER_LOG_LIMIT');

const logPartCountEnvelope = envelope();
logPartCountEnvelope.limits.logBytes = 16 * 1024 * 1024;
logPartCountEnvelope.attemptSpecDigest = workerAttemptSpecDigest(logPartCountEnvelope);
const logPartCountLimited = await new WorkerAttemptExecutor({ envelope: logPartCountEnvelope,
  operation: new Operation(async (context) => {
    for (let index = 0; index <= 10_000; index += 1) context.log('stdout', '');
    return new Promise<WorkerAttemptOperationResult>(() => undefined);
  }), id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(logPartCountLimited.error?.code, 'WORKER_LOG_LIMIT');

const unretainedLogEnvelope = envelope();
unretainedLogEnvelope.limits.logBytes = 5;
unretainedLogEnvelope.attemptSpecDigest = workerAttemptSpecDigest(unretainedLogEnvelope);
const unretainedLog = await new WorkerAttemptExecutor({ envelope: unretainedLogEnvelope, retainLogs: false,
  operation: new Operation(async (context) => {
    context.log('stdout', 'too much');
    return new Promise<WorkerAttemptOperationResult>(() => undefined);
  }), id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(unretainedLog.error?.code, 'WORKER_LOG_LIMIT');
assert.equal(unretainedLog.evidence.length, 0);

const unicodeLogParts: string[] = [];
const unicodeLog = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async (context) => { context.log('stdout', '\uD800'); return successResult(); }), id,
  onLogPart: (part) => { if (!part.final) unicodeLogParts.push(part.text); },
  storeFullLog: async (_attemptId, content) => ({ ...evidence, evidenceId: 'full-log', type: 'log',
    artifact: { ...evidence.artifact, artifactId: 'artifact:unicode-log', type: 'log', mediaType: 'text/plain',
      contentDigest: sha256Text(content), sizeBytes: Buffer.byteLength(content) } }),
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(unicodeLog.state, 'completed');
assert.deepEqual(unicodeLogParts, ['�']);

const largeLogEnvelope = envelope();
largeLogEnvelope.limits.logBytes = 100_000;
largeLogEnvelope.limits.evidenceBytes = 100_000;
largeLogEnvelope.attemptSpecDigest = workerAttemptSpecDigest(largeLogEnvelope);
const largeLogParts: number[] = [];
const largeLogText = 'x'.repeat(65_537);
const largeLog = await new WorkerAttemptExecutor({ envelope: largeLogEnvelope,
  operation: new Operation(async (context) => { context.log('stdout', largeLogText); return successResult(); }), id,
  onLogPart: (part) => { if (!part.final) largeLogParts.push(part.text.length); },
  storeFullLog: async (_attemptId, content) => ({ ...evidence, evidenceId: 'full-log', type: 'log',
    artifact: { ...evidence.artifact, artifactId: 'artifact:large-log', type: 'log', mediaType: 'text/plain',
      contentDigest: sha256Text(content), sizeBytes: Buffer.byteLength(content) } }),
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(largeLog.state, 'completed');
assert.deepEqual(largeLogParts, [65_536, 1]);

const resultLimitEnvelope = envelope();
resultLimitEnvelope.limits.resultBytes = 1;
resultLimitEnvelope.attemptSpecDigest = workerAttemptSpecDigest(resultLimitEnvelope);
const resultLimited = await new WorkerAttemptExecutor({ envelope: resultLimitEnvelope,
  operation: new Operation(async () => successResult()), id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(resultLimited.error?.code, 'WORKER_RESULT_BYTE_LIMIT');

const largeResultEnvelope = envelope();
largeResultEnvelope.limits.resultBytes = 10;
largeResultEnvelope.attemptSpecDigest = workerAttemptSpecDigest(largeResultEnvelope);
const largeResult = await new WorkerAttemptExecutor({ envelope: largeResultEnvelope,
  operation: new Operation(async () => successResult({ specialistResult: {
    schemaId: 'kubeclaw.test-result.v1', schemaDigest, values: { large: 'x'.repeat(1_000) },
  } })), id, now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(largeResult.state, 'errored');

const escapedResultEnvelope = envelope();
escapedResultEnvelope.limits.resultBytes = 100;
escapedResultEnvelope.attemptSpecDigest = workerAttemptSpecDigest(escapedResultEnvelope);
const escapedResult = await new WorkerAttemptExecutor({ envelope: escapedResultEnvelope,
  operation: new Operation(async () => successResult({ specialistResult: {
    schemaId: 'kubeclaw.test-result.v1', schemaDigest, values: { escaped: '"'.repeat(100) },
  } })), id, now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(escapedResult.error?.code, 'WORKER_RESULT_BYTE_LIMIT');

let overBudgetLogStored = false;
const noLogBudgetEnvelope = envelope();
noLogBudgetEnvelope.limits.evidenceFiles = 1;
noLogBudgetEnvelope.attemptSpecDigest = workerAttemptSpecDigest(noLogBudgetEnvelope);
const noLogBudget = await new WorkerAttemptExecutor({ envelope: noLogBudgetEnvelope,
  operation: new Operation(async (context) => { context.log('stdout', 'log'); return successResult(); }), id,
  storeFullLog: async () => { overBudgetLogStored = true; return null; },
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(noLogBudget.error?.code, 'WORKER_LOG_STORE_FAILED');
assert.equal(overBudgetLogStored, false, 'full log is not stored without remaining evidence capacity');

const evidenceLimitEnvelope = envelope();
evidenceLimitEnvelope.limits.evidenceBytes = 1;
evidenceLimitEnvelope.attemptSpecDigest = workerAttemptSpecDigest(evidenceLimitEnvelope);
const evidenceLimited = await new WorkerAttemptExecutor({ envelope: evidenceLimitEnvelope,
  operation: new Operation(async () => successResult()), id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(evidenceLimited.error?.code, 'WORKER_EVIDENCE_BYTE_LIMIT');

const resourceEnvelope = envelope();
resourceEnvelope.limits.cpuMillis = 1;
resourceEnvelope.attemptSpecDigest = workerAttemptSpecDigest(resourceEnvelope);
const resourceLimited = await new WorkerAttemptExecutor({ envelope: resourceEnvelope,
  operation: new Operation(async () => successResult(), { resources: { cpuTimeMs: 2, maximumMemoryBytes: 100,
    maximumProcesses: 1 } }), id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(resourceLimited.error?.code, 'WORKER_CPU_LIMIT');

const mutableMeasurements = { cpuTimeMs: 10, maximumMemoryBytes: 100, maximumProcesses: 1 };
const stableResources = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: {
    prepare: () => undefined,
    execute: async (context) => { context.log('stdout', 'log'); return successResult(); },
    terminate: async () => undefined,
    measure: async () => mutableMeasurements,
  }, id,
  storeFullLog: async (_attemptId, content) => {
    mutableMeasurements.cpuTimeMs = 10_000;
    return { ...evidence, evidenceId: 'full-log', type: 'log', artifact: { ...evidence.artifact,
      artifactId: 'artifact:stable-resources', type: 'log', mediaType: 'text/plain',
      contentDigest: sha256Text(content), sizeBytes: Buffer.byteLength(content) } };
  },
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(stableResources.state, 'completed');
assert.equal(stableResources.resources.cpuTimeMs, 10);

const invalidResources = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async () => successResult(), { resources: { cpuTimeMs: Number.NaN,
    maximumMemoryBytes: 100, maximumProcesses: 1 } }), id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(invalidResources.error?.code, 'WORKER_RESOURCE_MEASUREMENT_INVALID');

const missingResourceOperation: WorkerAttemptOperation = {
  prepare: () => undefined,
  execute: async () => successResult(),
  terminate: async () => undefined,
  measure: async () => undefined as unknown as WorkerAttemptOperationResources,
};
const missingResources = await new WorkerAttemptExecutor({ envelope: envelope(), operation: missingResourceOperation,
  id, now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(missingResources.error?.code, 'WORKER_RESOURCE_MEASUREMENT_INVALID');

let cleanupSensitiveCpu = 100;
const cleanupSensitiveResources: WorkerAttemptOperation = {
  prepare: () => undefined,
  execute: async () => successResult(),
  terminate: async () => undefined,
  measure: async () => ({ cpuTimeMs: cleanupSensitiveCpu, maximumMemoryBytes: 1, maximumProcesses: 1 }),
  cleanup: async () => { cleanupSensitiveCpu = 0; },
};
const cleanupSensitiveEnvelope = envelope();
cleanupSensitiveEnvelope.limits.cpuMillis = 50;
cleanupSensitiveEnvelope.attemptSpecDigest = workerAttemptSpecDigest(cleanupSensitiveEnvelope);
const cleanupSensitiveResult = await new WorkerAttemptExecutor({ envelope: cleanupSensitiveEnvelope,
  operation: cleanupSensitiveResources, id, now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(cleanupSensitiveResult.error?.code, 'WORKER_CPU_LIMIT',
  'resource enforcement uses the snapshot taken before cleanup');

const cleanupOperation = new Operation(async () => successResult());
cleanupOperation.cleanup = async () => { throw new Error('cleanup failed'); };
const cleanupFailed = await new WorkerAttemptExecutor({ envelope: envelope(), operation: cleanupOperation, id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(cleanupFailed.state, 'errored');
assert.equal(cleanupFailed.cleanup.state, 'failed');

const expired = envelope({ queueDeadline: '2026-08-05T12:01:00Z' });
expired.attemptSpecDigest = workerAttemptSpecDigest(expired);
const queueExpired = await new WorkerAttemptExecutor({ envelope: expired, operation, id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(queueExpired.state, 'interrupted');
assert.equal(queueExpired.error?.code, 'WORKER_QUEUE_DEADLINE_EXPIRED');

const exactQueueDeadline = envelope({ queueDeadline: '2026-08-05T12:30:00Z' });
exactQueueDeadline.attemptSpecDigest = workerAttemptSpecDigest(exactQueueDeadline);
const exactQueueExpired = await new WorkerAttemptExecutor({ envelope: exactQueueDeadline, operation, id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(exactQueueExpired.error?.code, 'WORKER_QUEUE_DEADLINE_EXPIRED');

const expiredClaimEnvelope = envelope();
expiredClaimEnvelope.claim.expiresAt = '2026-08-05T12:29:00Z';
const expiredClaimOperation = new Operation(async () => { throw new Error('must not run'); });
const expiredClaim = await new WorkerAttemptExecutor({ envelope: expiredClaimEnvelope,
  operation: expiredClaimOperation, id, now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(expiredClaim.error?.code, 'WORKER_CLAIM_EXPIRED');
assert.equal(expiredClaimOperation.prepared, 0);

const futureClaimEnvelope = envelope();
futureClaimEnvelope.claim.claimedAt = '2026-08-05T12:31:00Z';
futureClaimEnvelope.attemptSpecDigest = workerAttemptSpecDigest(futureClaimEnvelope);
const futureClaimOperation = new Operation(async () => { throw new Error('must not run'); });
const futureClaim = await new WorkerAttemptExecutor({ envelope: futureClaimEnvelope,
  operation: futureClaimOperation, id, now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(futureClaim.error?.code, 'WORKER_CLAIM_NOT_ACTIVE');
assert.equal(futureClaimOperation.prepared, 0);

const expiringClaimEnvelope = envelope();
expiringClaimEnvelope.claim.expiresAt = '2026-08-05T12:30:00.010Z';
const expiringClaim = await new WorkerAttemptExecutor({ envelope: expiringClaimEnvelope,
  operation: new Operation(async () => new Promise<WorkerAttemptOperationResult>(() => undefined)), id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(expiringClaim.error?.code, 'WORKER_CLAIM_WINDOW_INSUFFICIENT');

const progressFailed = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async () => successResult()), id,
  onProgress: async () => { throw new Error('progress sink failed'); },
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(progressFailed.state, 'completed', 'temporary progress delivery failure does not block a final result');

const synchronousProgressFailure = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async () => successResult()), id,
  onProgress: () => { throw new Error('synchronous progress failure'); },
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(synchronousProgressFailure.state, 'completed');

const missingLogStore = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async (context) => { context.log('stdout', 'log'); return successResult(); }), id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(missingLogStore.error?.code, 'WORKER_LOG_STORE_FAILED');

const failedLiveLog = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async (context) => { context.log('stdout', 'log'); return successResult(); }), id,
  onLogPart: async () => { throw new Error('live log unavailable'); },
  storeFullLog: async () => ({ ...evidence, evidenceId: 'full-log', type: 'log', artifact: { ...evidence.artifact,
    artifactId: 'artifact:log-fallback', type: 'log', mediaType: 'text/plain',
    contentDigest: sha256Text('[stdout] log'), sizeBytes: Buffer.byteLength('[stdout] log') } }),
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(failedLiveLog.state, 'completed', 'the durable full log permits temporary live-stream failure');

const lateLogParts: string[] = [];
let storedLateLog = '';
const lateLog = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async (context) => {
    context.log('stdout', 'on time');
    setTimeout(() => context.log('stdout', 'too late'), 1);
    return successResult();
  }), id,
  onLogPart: (part) => { if (!part.final) lateLogParts.push(part.text); },
  storeFullLog: async (_attemptId, content) => {
    storedLateLog = content;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ...evidence, evidenceId: 'full-log', type: 'log', artifact: { ...evidence.artifact,
      artifactId: 'artifact:late-log', type: 'log', mediaType: 'text/plain', contentDigest: sha256Text(content),
      sizeBytes: Buffer.byteLength(content) } };
  },
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(lateLog.state, 'completed');
assert.deepEqual(lateLogParts, ['on time']);
assert.equal(storedLateLog, '[stdout] on time');
assert.equal(lateLog.resources.logBytes, Buffer.byteLength('[stdout] on time'));

const nullLogStore = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async (context) => { context.log('stdout', 'log'); return successResult(); }), id,
  storeFullLog: async () => null,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(nullLogStore.error?.code, 'WORKER_LOG_STORE_FAILED');

const wrongLogDigest = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async (context) => { context.log('stdout', 'log'); return successResult(); }), id,
  storeFullLog: async () => ({ ...evidence, evidenceId: 'full-log', type: 'log' }),
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(wrongLogDigest.error?.code, 'WORKER_LOG_STORE_FAILED');
assert.equal(wrongLogDigest.evidence.some((item) => item.evidenceId === 'report'), true,
  'valid operation evidence remains available when full-log storage fails');

const duplicateLogEvidence = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async (context) => { context.log('stdout', 'log'); return successResult(); }), id,
  storeFullLog: async (_attemptId, content) => ({ ...evidence, artifact: { ...evidence.artifact,
    artifactId: 'artifact:duplicate-log', type: 'log', mediaType: 'text/plain', contentDigest: sha256Text(content),
    sizeBytes: Buffer.byteLength(content) } }),
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(duplicateLogEvidence.error?.code, 'WORKER_LOG_STORE_FAILED');
assert.deepEqual(duplicateLogEvidence.evidence.map((item) => item.evidenceId), ['report']);

const hangingLogStoreEnvelope = envelope();
hangingLogStoreEnvelope.limits.cleanupTimeoutMs = 5;
hangingLogStoreEnvelope.attemptSpecDigest = workerAttemptSpecDigest(hangingLogStoreEnvelope);
const hangingLogStore = await new WorkerAttemptExecutor({ envelope: hangingLogStoreEnvelope,
  operation: new Operation(async (context) => { context.log('stdout', 'log'); return successResult(); }), id,
  storeFullLog: async () => new Promise<WorkerEvidenceRefV1 | null>(() => undefined),
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(hangingLogStore.error?.code, 'WORKER_LOG_STORE_FAILED');

const terminationFailureOperation = new Operation(async () => new Promise<WorkerAttemptOperationResult>(() => undefined));
terminationFailureOperation.terminate = async () => { throw new Error('terminate failed'); };
const terminationFailureEnvelope = envelope();
terminationFailureEnvelope.limits.timeoutMs = 5;
terminationFailureEnvelope.attemptSpecDigest = workerAttemptSpecDigest(terminationFailureEnvelope);
const terminationFailed = await new WorkerAttemptExecutor({ envelope: terminationFailureEnvelope,
  operation: terminationFailureOperation, id, now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(terminationFailed.state, 'errored');
assert.equal(terminationFailed.error?.code, 'WORKER_TERMINATION_FAILED');

const synchronousTerminationFailure = new Operation(async () => new Promise<WorkerAttemptOperationResult>(() => undefined));
synchronousTerminationFailure.terminate = (() => { throw new Error('sync terminate failed'); }) as WorkerAttemptOperation['terminate'];
const synchronousTerminationEnvelope = envelope();
synchronousTerminationEnvelope.limits.timeoutMs = 5;
synchronousTerminationEnvelope.attemptSpecDigest = workerAttemptSpecDigest(synchronousTerminationEnvelope);
const synchronousTermination = await new WorkerAttemptExecutor({ envelope: synchronousTerminationEnvelope,
  operation: synchronousTerminationFailure, id, now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(synchronousTermination.error?.code, 'WORKER_TERMINATION_FAILED');

const stuckTerminationOperation = new Operation(async () => new Promise<WorkerAttemptOperationResult>(() => undefined));
stuckTerminationOperation.terminate = async () => new Promise<void>(() => undefined);
const stuckTerminationEnvelope = envelope();
stuckTerminationEnvelope.limits.timeoutMs = 5;
stuckTerminationEnvelope.limits.cleanupTimeoutMs = 5;
stuckTerminationEnvelope.attemptSpecDigest = workerAttemptSpecDigest(stuckTerminationEnvelope);
const stuckTerminationStarted = Date.now();
const stuckTermination = await new WorkerAttemptExecutor({ envelope: stuckTerminationEnvelope,
  operation: stuckTerminationOperation, id, now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(stuckTermination.error?.code, 'WORKER_TERMINATION_FAILED');
assert.equal(Date.now() - stuckTerminationStarted < 1_000, true, 'stuck termination remains bounded');

const mutableEnvelope = envelope();
mutableEnvelope.limits.logBytes = 1;
mutableEnvelope.attemptSpecDigest = workerAttemptSpecDigest(mutableEnvelope);
let receivedFrozenLimits = false;
const frozenOperation = new Operation(async (context) => {
  context.log('stdout', 'too much');
  return successResult();
});
frozenOperation.prepare = (limits) => { receivedFrozenLimits = Object.isFrozen(limits); return undefined; };
const frozenExecutor = new WorkerAttemptExecutor({ envelope: mutableEnvelope, operation: frozenOperation, id,
  now: () => new Date('2026-08-05T12:30:00Z') });
mutableEnvelope.limits.logBytes = 10_000;
const frozenResult = await frozenExecutor.execute();
assert.equal(receivedFrozenLimits, true);
assert.equal(frozenResult.error?.code, 'WORKER_LOG_LIMIT');

const malformedResult = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async () => successResult({ specialistResult: {
    schemaId: 'kubeclaw.test-result.v1', schemaDigest: 'invalid', values: {},
  } as WorkerAttemptOperationResult['specialistResult'] })), id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(malformedResult.state, 'errored');
assert.equal(malformedResult.error?.code, 'WORKER_OPERATION_RESULT_INVALID');

const malformedEvidence = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async () => successResult({ evidence: {} as unknown as readonly WorkerEvidenceRefV1[] })), id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(malformedEvidence.state, 'errored');
assert.equal(malformedEvidence.error?.code, 'WORKER_ATTEMPT_ERROR');

const cyclicEvidence = structuredClone(evidence) as WorkerEvidenceRefV1 & { cycle?: unknown };
cyclicEvidence.cycle = cyclicEvidence;
const cyclicEvidenceResult = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async () => successResult({ evidence: [cyclicEvidence] })), id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(cyclicEvidenceResult.state, 'errored');
assert.equal(cyclicEvidenceResult.error?.code, 'WORKER_ATTEMPT_ERROR');

const invalidUnicodeResult = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async () => successResult({ specialistResult: {
    schemaId: 'kubeclaw.test-result.v1', schemaDigest, values: { invalid: '\uD800' },
  } })), id,
  now: () => new Date('2026-08-05T12:30:00Z') }).execute();
assert.equal(invalidUnicodeResult.state, 'errored');
assert.equal(invalidUnicodeResult.error?.code, 'WORKER_OPERATION_RESULT_INVALID');

const clockTimes = [new Date('2026-08-05T12:30:00Z'), new Date('2026-08-05T12:29:00Z')];
const regressedClock = await new WorkerAttemptExecutor({ envelope: envelope(),
  operation: new Operation(async () => successResult()), id,
  now: () => clockTimes.shift() ?? new Date('2026-08-05T12:29:00Z') }).execute();
assert.equal(regressedClock.state, 'completed');
assert.equal(regressedClock.durationMs, 0);
assert.equal(regressedClock.completedAt, regressedClock.startedAt);

console.log(JSON.stringify({ ok: true, phase: '5.5-B', progressEvents: progress.length, logParts: logs.length }));
