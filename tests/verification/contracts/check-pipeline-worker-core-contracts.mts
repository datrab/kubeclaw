import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  checkPipelineWorkerCoreContract,
  checkWorkerAttemptEnvelopeConsistency,
  checkWorkerAttemptMessageBinding,
  checkWorkerCancellationBinding,
  canonicalJson,
  workerAttemptSpecDigest,
  workerAttemptResultDigest,
  workerProfileDigest,
  sha256Text,
} from '../../../contracts/pipeline-worker-core/v1/src/index.ts';
import type {
  AttemptClaimV1,
  AttemptProgressEventV1,
  PipelineWorkerCoreDefinition,
  WorkerAttemptEnvelopeV1,
  WorkerAttemptResultV1,
  WorkerCancellationRequestV1,
  WorkerHealthV1,
  WorkerLogPartV1,
  WorkerProfileV1,
  WorkerRegistrationV1,
} from '../../../contracts/pipeline-worker-core/v1/src/types.ts';

const schemaPath = 'contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v1.schema.json';
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as { $id: string };
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(schema);

const definitions = [
  'workerLifecycleState',
  'workerProfile',
  'workerRegistration',
  'workerHealth',
  'attemptClaim',
  'workerAttemptEnvelope',
  'attemptProgressEvent',
  'workerLogPart',
  'workerCancellationRequest',
  'workerEvidenceRef',
  'workerAttemptResult',
] as const satisfies readonly PipelineWorkerCoreDefinition[];

for (const definition of definitions) {
  ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` });
}

const digest = `sha256:${'a'.repeat(64)}`;
const schemaDigest = `sha256:${'b'.repeat(64)}`;
const profile = {
  schemaVersion: 'worker-profile.v1',
  profileId: 'buster.standard',
  profileDigest: digest,
  workerType: 'buster',
  coreContractId: 'kubeclaw.worker-core@1',
  engine: {
    engineId: 'buster-test-engine',
    contractId: 'kubeclaw.buster-engine@1',
    engineVersion: '1.0.0',
    contentDigest: digest,
  },
  capabilities: ['provider.execute', 'repository.read'],
} satisfies WorkerProfileV1;
const claim = {
  schemaVersion: 'attempt-claim.v1',
  claimId: 'claim:unit:1',
  attemptId: 'attempt:unit:1',
  generation: 1,
  workerId: 'worker:buster:one',
  claimedAt: '2026-08-05T12:00:00Z',
  expiresAt: '2026-08-05T12:05:00Z',
} satisfies AttemptClaimV1;
const capacity = { total: 4, available: 3, active: 1 };
const registration = {
  schemaVersion: 'worker-registration.v1',
  workerId: 'worker:buster:one',
  workerType: 'buster',
  coreVersion: '1.0.0',
  protocolVersions: ['worker-protocol.v1'],
  profiles: [profile],
  capacity,
  lifecycleState: 'ready',
  startedAt: '2026-08-05T11:59:00Z',
  sentAt: '2026-08-05T12:00:00Z',
} satisfies WorkerRegistrationV1;
const health = {
  schemaVersion: 'worker-health.v1',
  workerId: 'worker:buster:one',
  sequence: 1,
  lifecycleState: 'ready',
  capacity,
  activeAttemptIds: ['attempt:other:1'],
  sentAt: '2026-08-05T12:00:05Z',
} satisfies WorkerHealthV1;
const envelope = {
  schemaVersion: 'worker-attempt-envelope.v1',
  protocolVersion: 'worker-protocol.v1',
  pipelineRunId: 'run:unit',
  moduleId: 'api',
  gateId: null,
  planId: 'plan:unit',
  nodeId: 'unit',
  executionId: 'execution:unit',
  attemptId: 'attempt:unit:1',
  attemptNumber: 1,
  attemptSpecDigest: digest,
  claim,
  profile,
  packages: [{ packageId: 'kubeclaw.unit-provider', packageVersion: '1.0.0', contentDigest: digest }],
  grantedCapabilities: ['provider.execute', 'repository.read'],
  limits: {
    timeoutMs: 60000,
    cleanupTimeoutMs: 10000,
    cpuMillis: 1000,
    memoryBytes: 536870912,
    processes: 128,
    logBytes: 10485760,
    resultBytes: 1048576,
    evidenceBytes: 104857600,
    evidenceFiles: 100,
  },
  inputs: [{
    name: 'repository',
    kind: 'value',
    schemaId: 'kubeclaw.repository-snapshot.v1',
    schemaDigest,
    value: { snapshotDigest: digest },
  }],
  operation: {
    contractId: 'kubeclaw.test-attempt@1',
    inputSchemaId: 'kubeclaw.test-attempt-input.v1',
    inputSchemaDigest: schemaDigest,
    values: { providerContractId: 'kubeclaw.command-test@1' },
  },
  cancellationId: 'cancel:unit:1',
  issuedAt: '2026-08-05T11:59:59Z',
  queueDeadline: '2026-08-05T12:10:00Z',
} satisfies WorkerAttemptEnvelopeV1;
const progress = {
  schemaVersion: 'attempt-progress-event.v1',
  protocolVersion: 'worker-protocol.v1',
  attemptId: 'attempt:unit:1',
  claimId: 'claim:unit:1',
  claimGeneration: 1,
  workerId: 'worker:buster:one',
  sequence: 0,
  state: 'started',
  message: 'Unit test attempt started.',
  progressPercent: null,
  details: {},
  sentAt: '2026-08-05T12:00:01Z',
} satisfies AttemptProgressEventV1;
const logPart = {
  schemaVersion: 'worker-log-part.v1',
  protocolVersion: 'worker-protocol.v1',
  attemptId: 'attempt:unit:1',
  claimId: 'claim:unit:1',
  claimGeneration: 1,
  workerId: 'worker:buster:one',
  sequence: 0,
  stream: 'stdout',
  text: 'TAP version 13\n',
  contentDigest: digest,
  final: false,
  sentAt: '2026-08-05T12:00:02Z',
} satisfies WorkerLogPartV1;
const cancellation = {
  schemaVersion: 'worker-cancellation-request.v1',
  protocolVersion: 'worker-protocol.v1',
  cancellationId: 'cancel:unit:1',
  attemptId: 'attempt:unit:1',
  requestedAt: '2026-08-05T12:00:30Z',
  reason: 'Pipeline was cancelled.',
  forceAfterMs: 10000,
} satisfies WorkerCancellationRequestV1;
const result = {
  schemaVersion: 'worker-attempt-result.v1',
  protocolVersion: 'worker-protocol.v1',
  attemptId: 'attempt:unit:1',
  claimId: 'claim:unit:1',
  claimGeneration: 1,
  workerId: 'worker:buster:one',
  state: 'completed',
  startedAt: '2026-08-05T12:00:01Z',
  completedAt: '2026-08-05T12:00:03Z',
  durationMs: 2000,
  summary: 'Unit test attempt completed.',
  specialistResult: {
    schemaId: 'kubeclaw.test-attempt-result.v1',
    schemaDigest,
    values: { outcome: 'passed' },
  },
  error: null,
  evidence: [{
    evidenceId: 'unit-log',
    type: 'log',
    artifact: {
      artifactId: 'artifact:unit-log',
      type: 'log',
      mediaType: 'text/plain',
      contentDigest: digest,
      sizeBytes: 128,
      storageUrl: 'artifact://unit-log',
    },
  }],
  resources: {
    cpuTimeMs: 500,
    maximumMemoryBytes: 1048576,
    maximumProcesses: 2,
    logBytes: 128,
    resultBytes: 256,
    evidenceBytes: 128,
  },
  cleanup: { state: 'not_required', summary: null },
  exitCode: 0,
  signal: null,
  resultDigest: digest,
  receipt: { receiptId: 'receipt:unit:1', receiptDigest: digest },
} satisfies WorkerAttemptResultV1;
profile.profileDigest = workerProfileDigest(profile);
envelope.attemptSpecDigest = workerAttemptSpecDigest(envelope);
logPart.contentDigest = sha256Text(logPart.text);
result.resultDigest = workerAttemptResultDigest(result);

const validValues: Record<PipelineWorkerCoreDefinition, unknown> = {
  workerLifecycleState: 'ready',
  workerProfile: profile,
  workerRegistration: registration,
  workerHealth: health,
  attemptClaim: claim,
  workerAttemptEnvelope: envelope,
  attemptProgressEvent: progress,
  workerLogPart: logPart,
  workerCancellationRequest: cancellation,
  workerEvidenceRef: result.evidence[0],
  workerAttemptResult: result,
};

function schemaValid(definition: PipelineWorkerCoreDefinition, value: unknown): boolean {
  const validator = ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` });
  return validator(value);
}

for (const definition of definitions) {
  const value = validValues[definition];
  assert.equal(schemaValid(definition, value), true, `${definition} valid fixture must pass its schema`);
  assert.deepEqual(checkPipelineWorkerCoreContract(definition, value), { ok: true, errors: [] });
  if (typeof value === 'object' && value !== null) {
    assert.equal(schemaValid(definition, { ...value, unexpected: true }), false,
      `${definition} must reject unknown fields`);
  }
}

assert.equal(schemaValid('workerLifecycleState', 'paused'), false, 'unknown lifecycle states are rejected');
assert.equal(schemaValid('workerRegistration', {
  ...registration,
  protocolVersions: ['worker-protocol.v1', 'worker-protocol.v2'],
}), true, 'registration can advertise future protocol versions during a rolling update');
assert.equal(schemaValid('workerAttemptEnvelope', {
  ...envelope,
  protocolVersion: 'worker-protocol.v2',
}), false, 'a v1 attempt envelope cannot select a future protocol version');
assert.equal(checkPipelineWorkerCoreContract('workerRegistration', {
  ...registration,
  capacity: { total: 4, available: 4, active: 1 },
}).ok, false, 'registration capacity must reconcile');
assert.equal(checkPipelineWorkerCoreContract('workerRegistration', {
  ...registration,
  profiles: [{ ...profile, workerType: 'prism' }],
}).ok, false, 'registration profiles must match the worker type');
assert.equal(checkPipelineWorkerCoreContract('workerHealth', {
  ...health,
  activeAttemptIds: [],
}).ok, false, 'health active IDs must reconcile with active capacity');
assert.equal(schemaValid('attemptClaim', { ...claim, generation: 0 }), false,
  'claim generations start at one');
assert.equal(checkPipelineWorkerCoreContract('attemptClaim', {
  ...claim,
  expiresAt: claim.claimedAt,
}).ok, false, 'a claim must expire after it is created');
assert.equal(checkPipelineWorkerCoreContract('workerAttemptEnvelope', {
  ...envelope,
  claim: { ...claim, expiresAt: claim.claimedAt },
}).ok, false, 'an embedded claim keeps the same temporal rule');
assert.equal(checkPipelineWorkerCoreContract('workerAttemptEnvelope', {
  ...envelope,
  claim: { ...claim, attemptId: 'attempt:other:1' },
}).ok, false, 'an embedded claim must identify the same attempt');
assert.equal(checkPipelineWorkerCoreContract('workerAttemptEnvelope', {
  ...envelope,
  grantedCapabilities: [...envelope.grantedCapabilities, 'network.cluster'],
}).ok, false, 'an attempt cannot grant a capability outside its worker profile');
assert.equal(checkPipelineWorkerCoreContract('workerAttemptEnvelope', {
  ...envelope,
  inputs: [...envelope.inputs, envelope.inputs[0]],
}).ok, false, 'input names are unique');
assert.equal(schemaValid('workerAttemptEnvelope', {
  ...envelope,
  limits: { ...envelope.limits, timeoutMs: 2147483648 },
}), false, 'attempt timeout fits the Node timer range');
assert.equal(schemaValid('workerAttemptEnvelope', {
  ...envelope,
  limits: { ...envelope.limits, logBytes: 16777217 },
}), false, 'retained logs have an absolute memory bound');
assert.equal(schemaValid('workerLogPart', { ...logPart, sequence: -1 }), false,
  'log sequence numbers cannot be negative');
assert.equal(schemaValid('workerCancellationRequest', { ...cancellation, reason: '' }), false,
  'cancellation requires a reason');
assert.equal(schemaValid('workerCancellationRequest', { ...cancellation, forceAfterMs: 2147483648 }), false,
  'forced cancellation fits the Node timer range');
assert.equal(schemaValid('workerAttemptResult', { ...result, specialistResult: null }), false,
  'a completed attempt requires a specialist result');
assert.equal(schemaValid('workerAttemptResult', {
  ...result,
  state: 'errored',
  specialistResult: null,
  error: null,
}), false, 'an errored attempt requires an error');
const cleanupFailureResult = {
  ...result,
  state: 'errored',
  specialistResult: null,
  error: { code: 'cleanup_failed', message: 'Cleanup failed.' },
  cleanup: { state: 'failed', summary: 'Cleanup failed.' },
} as WorkerAttemptResultV1;
cleanupFailureResult.resultDigest = workerAttemptResultDigest(cleanupFailureResult);
assert.equal(checkPipelineWorkerCoreContract('workerAttemptResult', cleanupFailureResult).ok, true,
  'cleanup failure is a valid errored attempt');
assert.equal(checkPipelineWorkerCoreContract('workerAttemptResult', {
  ...result,
  cleanup: { state: 'failed', summary: 'Cleanup failed.' },
}).ok, false, 'cleanup failure cannot return a completed state');
assert.equal(checkPipelineWorkerCoreContract('workerAttemptResult', {
  ...result,
  summary: 'Tampered summary.',
}).ok, false, 'terminal result contents must match the result digest');
assert.deepEqual(checkWorkerAttemptMessageBinding(envelope, progress), { ok: true, errors: [] });
assert.equal(checkWorkerAttemptMessageBinding(envelope, { ...result, claimGeneration: 2 }).ok, false,
  'message binding rejects a different claim generation');
assert.equal(checkWorkerAttemptMessageBinding(envelope, { ...logPart, workerId: 'worker:buster:other' }).ok, false,
  'message binding rejects a different worker identity');
assert.deepEqual(checkWorkerCancellationBinding(envelope, cancellation), { ok: true, errors: [] });
assert.equal(checkWorkerCancellationBinding(envelope, { ...cancellation, cancellationId: 'cancel:other:1' }).ok, false,
  'cancellation binding rejects a different cancellation identity');
const consistentProfile = { ...profile, profileDigest: workerProfileDigest(profile) };
const consistentEnvelopeBase = { ...envelope, profile: consistentProfile, attemptSpecDigest: '' };
const consistentEnvelope = {
  ...consistentEnvelopeBase,
  attemptSpecDigest: workerAttemptSpecDigest(consistentEnvelopeBase),
};
assert.deepEqual(checkWorkerAttemptEnvelopeConsistency(consistentEnvelope, consistentEnvelope),
  { ok: true, errors: [] });
assert.equal(checkWorkerAttemptEnvelopeConsistency(consistentEnvelope, {
  ...consistentEnvelope,
  limits: { ...consistentEnvelope.limits, timeoutMs: consistentEnvelope.limits.timeoutMs + 1 },
}).ok, false, 'an accepted attempt cannot change immutable contents while retaining its digest');
assert.equal(checkWorkerAttemptEnvelopeConsistency(consistentEnvelope, {
  ...consistentEnvelope,
  profile: { ...consistentProfile, profileDigest: schemaDigest },
}).ok, false, 'an accepted attempt cannot change its worker profile');
assert.equal(checkWorkerAttemptEnvelopeConsistency(consistentEnvelope, {
  ...consistentEnvelope,
  claim: { ...consistentEnvelope.claim, workerId: 'worker:buster:other' },
}).ok, false, 'claim ownership cannot change inside an accepted attempt');
assert.equal(checkWorkerAttemptEnvelopeConsistency(consistentEnvelope, {
  ...consistentEnvelope,
  claim: { ...consistentEnvelope.claim, expiresAt: '2026-08-05T12:06:00Z' },
}).ok, true, 'the same claim can extend its expiry');
assert.equal(canonicalJson({ '\uE000': 1, '\u{10000}': 2 }), '{"𐀀":2,"":1}',
  'portable canonical JSON follows RFC 8785 UTF-16 key ordering');
assert.throws(() => canonicalJson('\uD800'), /RFC8785_INVALID_UNICODE/,
  'portable canonical JSON rejects lone surrogates');
assert.throws(() => canonicalJson(undefined), /RFC8785_INVALID_TYPE/,
  'portable canonical JSON rejects non-JSON values');
assert.throws(() => canonicalJson(new Map()), /RFC8785_INVALID_OBJECT/,
  'portable canonical JSON rejects non-JSON object instances');

console.log(JSON.stringify({ ok: true, contracts: definitions.length, schema: schemaPath }));
