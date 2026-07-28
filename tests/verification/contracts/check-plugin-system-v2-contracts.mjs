import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schemaPath = 'skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json';
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(schema);

function validator(name) {
  return ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` });
}

function valid(name, value) {
  const validate = validator(name);
  assert.equal(validate(value), true, `${name} should be valid: ${ajv.errorsText(validate.errors)}`);
}

function invalid(name, value, label) {
  const validate = validator(name);
  assert.equal(validate(value), false, `${name} should reject ${label}`);
}

const attempt = {
  runId: 'run:01',
  stageId: 'delivery-lint',
  attemptId: 'attempt:01',
  attemptNumber: 1,
};
const artifact = {
  artifactId: 'artifact:01',
  namespace: 'kubeclaw.delivery-lint',
  mediaType: 'application/json',
  digest: `sha256:${'a'.repeat(64)}`,
  sizeBytes: 123,
  producer: attempt,
};
const reason = { code: 'delivery_lint.code_inadequate', message: 'Delivery lint failed.' };
const wait = {
  schemaVersion: 'wait-request.v2',
  waitId: 'wait:01',
  kind: 'orchestrator',
  signalType: 'orchestrator.guidance',
  authorizedIssuer: { type: 'orchestrator', id: 'nova:main' },
  expiresAt: null,
  request: { summary: 'Inspect the failed attempt.' },
};

const manifest = {
  id: 'kubeclaw.delivery-lint',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.0.0',
  stages: [{
    id: 'delivery-lint',
    type: 'kubeclaw.delivery-lint',
    module: 'dist/stages/delivery-lint.js',
    export: 'execute',
    requiredCapabilities: ['repository.read', 'artifacts.write'],
    configSchema: 'schemas/config.json',
    inputSchema: 'schemas/input.json',
    resultSchema: 'schemas/result.json',
  }],
  observers: [],
  adapters: [],
};

valid('pluginManifest', manifest);
valid('stageDefinition', {
  id: 'delivery-lint',
  type: 'kubeclaw.delivery-lint',
  dependsOn: [],
  config: {},
  input: {},
  execution: { maxAttempts: 3, maxRemediationCycles: 2, orchestratorAfterAttempt: 2, timeoutMs: 60000 },
  on: { request_fix: 'fix-delivery' },
});
valid('pipelineDefinition', {
  schemaVersion: 'pipeline-definition.v2',
  id: 'pipeline:example',
  maxConcurrency: 2,
  stages: [{
    id: 'delivery-lint',
    type: 'kubeclaw.delivery-lint',
    dependsOn: [],
    config: {},
    input: {},
    execution: { maxAttempts: 3, maxRemediationCycles: 2, timeoutMs: 60000 },
  }],
});
valid('stageAttempt', {
  schemaVersion: 'stage-attempt.v2',
  identity: attempt,
  owner: {
    pluginId: 'kubeclaw.delivery-lint',
    apiVersion: 'pipeline-plugin-v2',
    packageVersion: '1.0.0',
    contentDigest: `sha256:${'b'.repeat(64)}`,
    registrationId: 'delivery-lint',
  },
  stageType: 'kubeclaw.delivery-lint',
  leaseId: 'lease:01',
  status: 'dispatched',
  retryBudgetUsed: 0,
  remediationBudgetUsed: 0,
  createdAt: '2026-07-25T21:00:00Z',
  dispatchedAt: '2026-07-25T21:00:01Z',
});
valid('artifactRef', artifact);

for (const result of [
  { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [artifact] },
  { schemaVersion: 'stage-result.v2', outcome: 'retry', reason, artifacts: [] },
  { schemaVersion: 'stage-result.v2', outcome: 'request_fix', reason, artifacts: [artifact] },
  { schemaVersion: 'stage-result.v2', outcome: 'wait', reason, artifacts: [], wait: { ...wait, kind: 'signal', signalType: 'approval.resolved', authorizedIssuer: { type: 'operator', id: 'operator:01' } } },
  { schemaVersion: 'stage-result.v2', outcome: 'orchestrator_required', reason, artifacts: [], wait },
  { schemaVersion: 'stage-result.v2', outcome: 'blocked', reason, artifacts: [] },
  { schemaVersion: 'stage-result.v2', outcome: 'failed', reason, artifacts: [] },
  { schemaVersion: 'stage-result.v2', outcome: 'timed_out', reason, artifacts: [] },
  { schemaVersion: 'stage-result.v2', outcome: 'rate_limited', reason, artifacts: [], retryAt: '2026-07-25T22:00:00Z' },
  { schemaVersion: 'stage-result.v2', outcome: 'cancelled', reason, artifacts: [] },
]) valid('stageResult', result);

valid('effectRequest', {
  schemaVersion: 'effect-request.v2',
  effectId: 'effect:01',
  idempotencyKey: 'effect:run01:delivery-lint:01',
  attempt,
  capability: 'artifacts.write',
  operation: 'put',
  resource: { type: 'artifact.object', canonicalId: 'artifact:01' },
  payload: { mediaType: 'application/json' },
  requestedAt: '2026-07-25T21:00:02Z',
});
valid('effectReceipt', {
  schemaVersion: 'effect-receipt.v2',
  effectId: 'effect:01',
  idempotencyKey: 'effect:run01:delivery-lint:01',
  adapter: {
    pluginId: 'kubeclaw.artifact-store',
    apiVersion: 'pipeline-plugin-v2',
    packageVersion: '1.0.0',
    contentDigest: `sha256:${'c'.repeat(64)}`,
    registrationId: 'artifact-store',
  },
  status: 'completed',
  result: { artifact },
  recordedAt: '2026-07-25T21:00:03Z',
});
valid('waitRequest', wait);
valid('resumeSignal', {
  schemaVersion: 'resume-signal.v2',
  signalId: 'signal:01',
  idempotencyKey: 'signal:wait01:01',
  waitId: 'wait:01',
  signalType: 'orchestrator.guidance',
  issuer: { type: 'orchestrator', id: 'nova:main' },
  issuedAt: '2026-07-25T21:05:00Z',
  payload: { helperPrompt: 'Inspect artifact artifact:01.' },
});
const administrativeReopen = {
  schemaVersion: 'administrative-reopen.v2',
  decisionId: 'decision:01',
  idempotencyKey: 'decision-key:01',
  runId: 'run:01',
  stageId: 'delivery-lint',
  actor: { type: 'administrator', id: 'admin:01' },
  reason: { code: 'operator.retry_authorized' },
  continuation: 'retry',
  decidedAt: '2026-07-25T21:06:00Z',
};
valid('administrativeReopenDecision', administrativeReopen);
valid('administrativeReopenDecision', {
  ...administrativeReopen,
  continuation: 'remediation',
  remediationStageId: 'fix-delivery',
});
invalid('administrativeReopenDecision', {
  ...administrativeReopen,
  continuation: 'remediation',
}, 'remediation without declared target');
invalid('administrativeReopenDecision', {
  ...administrativeReopen,
  remediationStageId: 'fix-delivery',
}, 'retry with remediation target');

const packageResolution = {
  pluginId: 'kubeclaw.delivery-lint',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.0.0',
  contentDigest: `sha256:${'b'.repeat(64)}`,
  registrationId: 'delivery-lint',
};
const packageIdentity = {
  pluginId: packageResolution.pluginId,
  apiVersion: packageResolution.apiVersion,
  packageVersion: packageResolution.packageVersion,
  contentDigest: packageResolution.contentDigest,
};
const packageProvenance = {
  schemaVersion: 'package-provenance.v2',
  package: packageIdentity,
  source: { type: 'builtin', canonicalReference: 'builtin:kubeclaw.delivery-lint' },
  canonicalPath: '/opt/kubeclaw/skills/nova/plugins/delivery-lint',
  trustScope: 'trusted_first_party',
  trustEvidence: {
    method: 'builtin_allowlist',
    verifier: 'kubeclaw:registry',
    verifiedAt: '2026-07-25T20:59:00Z',
  },
  resolvedAt: '2026-07-25T21:00:00Z',
};
const registrationProvenance = {
  schemaVersion: 'registration-provenance.v2',
  package: packageProvenance,
  surface: 'stage',
  registrationId: 'delivery-lint',
};
const lifecycleEvent = {
  schemaVersion: 'lifecycle-event.v2',
  eventId: 'event:01',
  sequence: 1,
  type: 'stage.started',
  identity: { runId: 'run:01', stageId: 'delivery-lint', attemptId: 'attempt:01' },
  occurredAt: '2026-07-25T21:00:01Z',
  causationId: null,
  payload: {},
};

valid('packageProvenance', packageProvenance);
valid('registrationProvenance', registrationProvenance);
valid('capabilityGrant', {
  capability: 'repository.read',
  provider: { ...packageResolution, pluginId: 'kubeclaw.repository-adapter', registrationId: 'repository' },
  constraints: { repository: 'earendil-works/kubeclaw', paths: ['src/**'] },
});
valid('invocationLease', {
  schemaVersion: 'invocation-lease.v2',
  leaseId: 'lease:01',
  attempt,
  registration: registrationProvenance,
  status: 'active',
  grants: [],
  limits: { wallTimeMs: 60000, memoryBytes: 536870912, cpuMillis: 30000 },
  issuedAt: '2026-07-25T21:00:00Z',
  expiresAt: '2026-07-25T21:01:00Z',
});
valid('pluginContext', {
  schemaVersion: 'plugin-context.v2',
  lease: {
    schemaVersion: 'invocation-lease.v2',
    leaseId: 'lease:01',
    attempt,
    registration: registrationProvenance,
    status: 'active',
    grants: [],
    limits: { wallTimeMs: 60000, memoryBytes: 536870912, cpuMillis: 30000 },
    issuedAt: '2026-07-25T21:00:00Z',
    expiresAt: '2026-07-25T21:01:00Z',
  },
  config: {},
  input: {},
  artifacts: [artifact],
});
valid('lifecycleEvent', lifecycleEvent);
valid('pluginDomainEvent', {
  schemaVersion: 'plugin-domain-event.v2',
  eventId: 'event:02',
  sequence: 2,
  type: 'plugin.kubeclaw.delivery-lint.report.created',
  producer: registrationProvenance,
  identity: { runId: 'run:01', stageId: 'delivery-lint', attemptId: 'attempt:01' },
  occurredAt: '2026-07-25T21:00:02Z',
  causationId: 'event:01',
  payload: { artifactId: 'artifact:01' },
});
valid('observerDelivery', {
  schemaVersion: 'observer-delivery.v2',
  deliveryId: 'delivery:01',
  observer: { ...registrationProvenance, surface: 'observer', registrationId: 'audit' },
  attemptNumber: 1,
  event: lifecycleEvent,
  deliveredAt: '2026-07-25T21:00:03Z',
});
valid('observerCheckpoint', {
  schemaVersion: 'observer-checkpoint.v2',
  observer: { ...registrationProvenance, surface: 'observer', registrationId: 'audit' },
  runId: 'run:01',
  sequence: 1,
  eventId: 'event:01',
  updatedAt: '2026-07-25T21:00:04Z',
});
valid('adapterLifecycle', {
  schemaVersion: 'adapter-lifecycle.v2',
  provider: { ...registrationProvenance, surface: 'adapter', registrationId: 'repository' },
  status: 'ready',
  changedAt: '2026-07-25T20:59:59Z',
});
valid('resourceLock', {
  schemaVersion: 'resource-lock.v2',
  lockId: 'lock:01',
  resource: { type: 'git.workspace', canonicalId: 'repo:worktree:01' },
  ownerLeaseId: 'lease:01',
  fencingToken: 1,
  status: 'active',
  acquiredAt: '2026-07-25T21:00:00Z',
  expiresAt: '2026-07-25T21:01:00Z',
});
valid('pluginStateEntry', {
  schemaVersion: 'plugin-state-entry.v2',
  entryId: 'state:01',
  sequence: 1,
  namespace: 'kubeclaw.delivery-lint',
  registration: registrationProvenance,
  attempt,
  entryType: 'delivery_lint.report_created',
  entrySchemaVersion: 'delivery_lint.report.v1',
  idempotencyKey: 'state:run01:01',
  occurredAt: '2026-07-25T21:00:02Z',
  payload: { artifactId: 'artifact:01' },
});

for (const [field, value] of [
  ['contractVersion', 'pipeline-plugin-v1'],
  ['kind', 'validator'],
  ['hookFamily', 'validator'],
  ['capabilities', ['repository.read']],
  ['stageIds', ['validator:delivery-lint']],
]) invalid('pluginManifest', { ...manifest, [field]: value }, `legacy manifest field ${field}`);

invalid('pluginManifest', { ...manifest, apiVersion: 'pipeline-plugin-v1' }, 'v1 API version');
invalid('pluginManifest', { ...manifest, stages: [{ ...manifest.stages[0], requiredCapabilities: undefined }] }, 'missing requiredCapabilities');
invalid('pluginManifest', { ...manifest, stages: [{ ...manifest.stages[0], module: '../escape.js' }] }, 'escaping module path');
invalid('pluginManifest', { ...manifest, stages: [{ ...manifest.stages[0], requiredCapabilities: ['repository.read', 'repository.read'] }] }, 'duplicate capability');
invalid('stageResult', { schemaVersion: 'stage-result.v2', outcome: 'needs_nova', reason, artifacts: [] }, 'needs_nova');
invalid('stageResult', { schemaVersion: 'stage-result.v2', outcome: 'action_required', reason, artifacts: [] }, 'action_required');
invalid('stageResult', { schemaVersion: 'stage-result.v2', outcome: 'passed', reason, artifacts: [] }, 'cross-variant reason');
invalid('stageResult', { schemaVersion: 'stage-result.v2', outcome: 'retry', reason, artifacts: [], wait }, 'cross-variant wait');
invalid('artifactRef', { ...artifact, path: '/tmp/report.json' }, 'host filesystem path');
invalid('effectReceipt', {
  schemaVersion: 'effect-receipt.v2',
  effectId: 'effect:01',
  idempotencyKey: 'effect:01',
  adapter: {
    pluginId: 'kubeclaw.artifact-store',
    apiVersion: 'pipeline-plugin-v2',
    packageVersion: '1.0.0',
    contentDigest: `sha256:${'c'.repeat(64)}`,
    registrationId: 'artifact-store',
  },
  status: 'failed',
  result: {},
  recordedAt: '2026-07-25T21:00:03Z',
}, 'failed receipt without error');
invalid('packageProvenance', {
  ...packageProvenance,
  trustEvidence: {
    method: 'publisher_attestation',
    verifier: 'kubeclaw:registry',
    verifiedAt: '2026-07-25T20:59:00Z',
  },
}, 'publisher trust without attestation digest');
invalid('invocationLease', {
  schemaVersion: 'invocation-lease.v2',
  leaseId: 'lease:01',
  attempt,
  registration: registrationProvenance,
  status: 'revoked',
  grants: [],
  limits: { wallTimeMs: 1, memoryBytes: 1, cpuMillis: 1 },
  issuedAt: '2026-07-25T21:00:00Z',
  expiresAt: '2026-07-25T21:01:00Z',
}, 'revoked lease without revocation evidence');
invalid('pluginDomainEvent', {
  schemaVersion: 'plugin-domain-event.v2',
  eventId: 'event:02',
  sequence: 2,
  type: 'stage.completed',
  producer: registrationProvenance,
  identity: { runId: 'run:01' },
  occurredAt: '2026-07-25T21:00:02Z',
  causationId: null,
  payload: {},
}, 'plugin event outside plugin namespace');
invalid('adapterLifecycle', {
  schemaVersion: 'adapter-lifecycle.v2',
  provider: { ...registrationProvenance, surface: 'adapter', registrationId: 'repository' },
  status: 'failed',
  changedAt: '2026-07-25T20:59:59Z',
}, 'failed adapter without reason');
invalid('pluginStateEntry', {
  schemaVersion: 'plugin-state-entry.v2',
  entryId: 'state:01',
  sequence: 1,
  namespace: 'kubeclaw.delivery-lint',
  registration: registrationProvenance,
  entryType: 'delivery_lint.report_created',
  idempotencyKey: 'state:01',
  occurredAt: '2026-07-25T21:00:02Z',
  payload: {},
  mutable: true,
}, 'mutable state field');

console.log(JSON.stringify({ ok: true, contract: 'pipeline-plugin-v2' }));
