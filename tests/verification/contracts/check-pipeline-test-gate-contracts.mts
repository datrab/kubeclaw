import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { attemptResultDigest, checkPipelineTestGateContract, nodeResultDigest, stableTestIdentity } from '../../../contracts/pipeline-test-gate/v1/src/index.ts';
import type {
  AttemptResultV1,
  EvidenceManifestV1,
  NodeResultV1,
  ProviderConfigurationV1,
  ProviderInvocationV1,
  ProviderResultV1,
  ProviderRegistrationV1,
  ReportAdapterRegistrationV1,
  ReportAdapterResultV1,
  ResolvedTestPlanV1,
  TypedLinkV1,
} from '../../../contracts/pipeline-test-gate/v1/src/types.ts';

const schemaPath = 'contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json';
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as { $id: string };
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(schema);

const definitions = [
  'providerRegistration',
  'providerConfiguration',
  'resolvedTestPlan',
  'providerInvocation',
  'providerResult',
  'attemptResult',
  'nodeResult',
  'evidenceManifest',
  'typedLink',
  'reportAdapterRegistration',
  'reportAdapterResult',
] as const;

for (const definition of definitions) {
  ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` });
}

const digest = `sha256:${'a'.repeat(64)}`;
const schemaDigest = `sha256:${'b'.repeat(64)}`;
const packageRef = {
  packageId: 'kubeclaw.unit-provider',
  packageVersion: '1.2.3',
  contentDigest: digest,
};
const providerRef = {
  ...packageRef,
  registrationId: 'unit-command',
  contractId: 'kubeclaw.command-test@1',
};
const configuration = {
  schemaVersion: 'provider-configuration.v1',
  contractId: 'kubeclaw.command-test@1',
  schemaDigest,
  values: {
    executable: 'npm',
    arguments: ['test'],
  },
} satisfies ProviderConfigurationV1;
const evidencePolicy = {
  onPass: ['report', 'log'],
  onFail: ['report', 'log'],
  onError: ['log'],
};
const receipt = {
  receiptId: 'receipt:unit:1',
  receiptDigest: digest,
};
const limits = {
  cpuMillis: 1000,
  memoryBytes: 536870912,
  logBytes: 10485760,
  artifactBytes: 104857600,
  artifactFiles: 100,
  processes: 128,
};
const artifact = {
  artifactId: 'artifact:unit-report',
  type: 'test-report',
  mediaType: 'application/junit+xml',
  contentDigest: digest,
  sizeBytes: 123,
  storageUrl: 'artifact://unit-report',
};
const link = {
  schemaVersion: 'typed-link.v1',
  kind: 'artifact',
  from: { nodeId: 'unit', output: 'report' },
  to: { nodeId: 'coverage', input: 'coverage' },
  mediaType: 'application/junit+xml',
} satisfies TypedLinkV1;

const validValues: Record<(typeof definitions)[number], unknown> = {
  providerRegistration: {
    schemaVersion: 'provider-registration.v1',
    registrationId: 'unit-command',
    contractId: 'kubeclaw.command-test@1',
    kind: 'test',
    package: packageRef,
    entrypoint: { module: 'dist/unit.js', export: 'execute' },
    configSchema: 'schemas/unit.schema.json',
    inputs: [],
    outputs: [{ name: 'report', kind: 'artifact', required: false, mediaTypes: ['application/junit+xml'] }],
    capabilities: ['repository.read'],
    retrySafe: true,
    matrixFields: [],
    reportFormats: ['junit'],
    evidenceTypes: ['report', 'log'],
    evidenceDefaults: evidencePolicy,
  } satisfies ProviderRegistrationV1,
  providerConfiguration: configuration satisfies ProviderConfigurationV1,
  resolvedTestPlan: {
    schemaVersion: 'resolved-test-plan.v1',
    planId: 'plan:unit',
    planDigest: digest,
    runId: 'run:unit',
    project: 'kubeclaw',
    scope: { moduleId: 'api', gateId: null },
    registrySnapshotDigest: digest,
    createdAt: '2026-08-05T12:00:00Z',
    suites: [{ instanceId: 'suite:unit', contractId: 'kubeclaw.unit-suite@1', templateDigest: digest }],
    nodes: [{
      id: 'unit',
      executionId: 'execution:unit',
      testIdentity: stableTestIdentity({ project: 'kubeclaw', moduleId: 'api', gateId: null,
        suiteInstanceId: 'suite:unit', nodeId: 'unit', variation: {} }),
      suiteInstanceId: 'suite:unit',
      kind: 'test',
      provider: providerRef,
      reportAdapters: [],
      mode: 'blocking',
      reviewAgent: null,
      configuration,
      dependencies: [],
      timeoutMs: 60000,
      limits,
      retryCount: 1,
      concurrencyGroup: null,
      parentNodeId: null,
      variation: {},
      evidence: evidencePolicy,
      skipReason: null,
    }],
    links: [],
    concurrencyLimits: { default: 2 },
  } satisfies ResolvedTestPlanV1,
  providerInvocation: {
    schemaVersion: 'provider-invocation.v1',
    planId: 'plan:unit',
    runId: 'run:unit',
    moduleId: 'api',
    gateId: null,
    suiteInstanceId: 'suite:unit',
    nodeId: 'unit',
    executionId: 'execution:unit',
    testIdentity: `test:${'1'.repeat(64)}`,
    nodeKind: 'test',
    attemptId: 'attempt:unit:1',
    attemptNumber: 1,
    provider: providerRef,
    configuration,
    inputs: [{ name: 'repository', kind: 'value', schemaId: 'kubeclaw.repository-snapshot.v1', value: { snapshot: digest } }],
    evidence: evidencePolicy,
    grantedCapabilities: ['repository.read'],
    timeoutMs: 60000,
    limits,
    workspace: {
      repository: 'workspace/repository',
      scratch: 'workspace/scratch',
      evidence: 'workspace/evidence',
    },
  } satisfies ProviderInvocationV1,
  providerResult: {
    schemaVersion: 'provider-result.v1',
    outcome: 'passed',
    summary: 'All unit tests passed.',
    counts: { total: 2, passed: 2, failed: 0, skipped: 0 },
    findings: [],
    metrics: [{ name: 'tests_per_second', value: 2, unit: 'tests/s' }],
    evidenceFiles: [{
      evidenceId: 'unit-report',
      type: 'test-report',
      file: 'results/unit.xml',
      mediaType: 'application/junit+xml',
    }],
    reports: [{ evidenceId: 'unit-report', format: 'junit' }],
    outputs: [{ name: 'report', kind: 'artifact', evidenceId: 'unit-report' }],
    exitCode: 0,
    signal: null,
    providerDetails: {
      schemaId: 'kubeclaw.node-test-details.v1',
      schemaDigest,
      values: { framework: 'node-test' },
    },
  } satisfies ProviderResultV1,
  attemptResult: {
    schemaVersion: 'attempt-result.v1',
    planId: 'plan:unit',
    runId: 'run:unit',
    moduleId: 'api',
    gateId: null,
    suiteInstanceId: 'suite:unit',
    nodeId: 'unit',
    executionId: 'execution:unit',
    testIdentity: `test:${'1'.repeat(64)}`,
    nodeKind: 'test',
    attemptId: 'attempt:unit:1',
    attemptNumber: 1,
    provider: providerRef,
    mode: 'blocking',
    executionState: 'completed',
    outcome: 'passed',
    startedAt: '2026-08-05T12:00:00Z',
    completedAt: '2026-08-05T12:00:01Z',
    durationMs: 1000,
    summary: 'All unit tests passed.',
    counts: { total: 2, passed: 2, failed: 0, skipped: 0 },
    findings: [],
    metrics: [{ name: 'tests_per_second', value: 2, unit: 'tests/s' }],
    reports: [],
    evidence: [{ evidenceId: 'unit-report', type: 'test-report', artifact }],
    outputs: [{ name: 'report', kind: 'artifact', artifact }],
    resources: { cpuTimeMs: 300, maximumMemoryBytes: 1000000, logBytes: 200, artifactBytes: 123 },
    exitCode: 0,
    signal: null,
    providerDetails: {
      schemaId: 'kubeclaw.node-test-details.v1',
      schemaDigest,
      values: { framework: 'node-test' },
    },
    resultDigest: digest,
    receipt,
  } satisfies AttemptResultV1,
  nodeResult: {
    schemaVersion: 'node-result.v1',
    planId: 'plan:unit',
    runId: 'run:unit',
    moduleId: 'api',
    gateId: null,
    suiteInstanceId: 'suite:unit',
    nodeId: 'unit',
    executionId: 'execution:unit',
    testIdentity: `test:${'1'.repeat(64)}`,
    nodeKind: 'test',
    mode: 'blocking',
    state: 'completed',
    outcome: 'passed',
    attemptIds: ['attempt:unit:1'],
    finalAttemptId: 'attempt:unit:1',
    unstable: false,
    skipReason: null,
    resultDigest: digest,
    receipt,
  } satisfies NodeResultV1,
  evidenceManifest: {
    schemaVersion: 'evidence-manifest.v1',
    planId: 'plan:unit',
    runId: 'run:unit',
    moduleId: 'api',
    gateId: null,
    suiteInstanceId: 'suite:unit',
    nodeId: 'unit',
    executionId: 'execution:unit',
    attemptId: 'attempt:unit:1',
    files: [{
      evidenceId: 'unit-report',
      type: 'test-report',
      file: 'results/unit.xml',
      mediaType: 'application/junit+xml',
    }],
  } satisfies EvidenceManifestV1,
  typedLink: link,
  reportAdapterRegistration: {
    schemaVersion: 'report-adapter-registration.v1',
    adapterId: 'junit',
    format: 'junit',
    contractVersion: 1,
    package: packageRef,
    entrypoint: { module: 'dist/junit.js', export: 'adapt' },
    mediaTypes: ['application/junit+xml'],
  } satisfies ReportAdapterRegistrationV1,
  reportAdapterResult: {
    schemaVersion: 'report-adapter-result.v1',
    adapter: {
      adapterId: 'junit',
      format: 'junit',
      contractVersion: 1,
      package: packageRef,
    },
    sourceArtifact: artifact,
    counts: { total: 3, passed: 1, failed: 0, errored: 1, skipped: 1 },
    durationMs: 1000,
    cases: [
      { id: 'case:one', name: 'one', suitePath: ['unit'], className: 'Example', outcome: 'passed', durationMs: 400, findings: [], findingsTruncated: false, omittedFindingCount: 0 },
      { id: 'case:two', name: 'two', suitePath: ['unit'], className: 'Example', outcome: 'errored', durationMs: 600, findings: [], findingsTruncated: false, omittedFindingCount: 0 },
      { id: 'case:three', name: 'three', suitePath: ['unit'], className: null, outcome: 'skipped', durationMs: 0, findings: [], findingsTruncated: false, omittedFindingCount: 0 },
    ],
    casesTruncated: false,
    omittedCaseCount: 0,
    findings: [],
    findingsTruncated: false,
    omittedFindingCount: 0,
  } satisfies ReportAdapterResultV1,
};

validValues.attemptResult = {
  ...(validValues.attemptResult as AttemptResultV1),
  resultDigest: attemptResultDigest(validValues.attemptResult as AttemptResultV1),
};
validValues.nodeResult = {
  ...(validValues.nodeResult as NodeResultV1),
  resultDigest: nodeResultDigest(validValues.nodeResult as NodeResultV1),
};

function validate(definition: (typeof definitions)[number], value: unknown): boolean {
  const validator = ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` });
  return validator(value);
}

for (const definition of definitions) {
  const value = validValues[definition];
  assert.equal(validate(definition, value), true, `${definition} valid fixture must pass`);
  assert.deepEqual(checkPipelineTestGateContract(definition, value), { ok: true, errors: [] });
  assert.equal(validate(definition, { ...(value as object), unexpected: true }), false, `${definition} must reject unknown fields`);
}

assert.equal(validate('providerConfiguration', { ...configuration, values: { customProviderField: true } }), true,
  'provider values stay open for the provider-owned schema');
assert.equal(validate('providerConfiguration', { ...configuration, values: { invalid: () => true } }), false,
  'provider values must remain JSON-safe');
{
  const oldPlan = structuredClone(validValues.resolvedTestPlan as ResolvedTestPlanV1);
  delete oldPlan.nodes[0]!.reviewAgent;
  assert.equal(validate('resolvedTestPlan', oldPlan), true, 'durable version 1 plans without reviewAgent remain valid');
}
assert.equal(validate('attemptResult', {
  ...(validValues.attemptResult as object),
  executionState: 'errored',
  outcome: 'passed',
}), false, 'non-completed results cannot claim a test outcome');
assert.equal(validate('attemptResult', {
  ...(validValues.attemptResult as object),
  executionState: 'completed',
  outcome: null,
}), false, 'completed results require a test outcome');
assert.equal(validate('attemptResult', {
  ...(validValues.attemptResult as object),
  expectedFailure: true,
}), false, 'the common result does not permit a gate-level expected-failure switch');
assert.equal(validate('resolvedTestPlan', {
  ...(validValues.resolvedTestPlan as object),
  nodes: [{
    ...((validValues.resolvedTestPlan as { nodes: object[] }).nodes[0]),
    kind: 'fixture',
    mode: 'blocking',
  }],
}), false, 'fixture nodes cannot use a test quality mode');
assert.equal(validate('providerInvocation', {
  ...(validValues.providerInvocation as object),
  inputs: [{ name: 'repository', kind: 'value', value: {}, artifact }],
}), false, 'a resolved input cannot contain both a value and an artifact');
assert.equal(validate('providerInvocation', {
  ...(validValues.providerInvocation as object),
  moduleId: null,
  gateId: null,
}), false, 'an invocation must identify a module or gate');
assert.equal(validate('providerInvocation', {
  ...(validValues.providerInvocation as object),
  limits: { ...limits, memoryBytes: 0 },
}), false, 'resolved execution limits cannot be unbounded or zero');
assert.equal(validate('providerResult', {
  ...(validValues.providerResult as object),
  receipt,
}), false, 'a provider cannot create or attach its own immutable receipt');
assert.equal(validate('evidenceManifest', {
  ...(validValues.evidenceManifest as object),
  files: [{ evidenceId: 'bad', type: 'log', file: '../secret', mediaType: 'text/plain' }],
}), false, 'evidence paths cannot traverse outside the evidence root');
assert.equal(validate('resolvedTestPlan', {
  ...(validValues.resolvedTestPlan as object),
  scope: { moduleId: null, gateId: null },
}), false, 'a plan must identify a module or gate scope');
assert.equal(validate('typedLink', {
  ...link,
  from: { nodeId: 'unit' },
}), false, 'typed links require a named producer output');
assert.equal(validate('typedLink', {
  ...link,
  mediaType: undefined,
}), false, 'artifact links require a media type');
assert.equal(validate('providerRegistration', {
  ...(validValues.providerRegistration as object),
  outputs: [{ name: 'endpoint', kind: 'value', required: true }],
}), false, 'value ports require a schema identity');
const reportResult = validValues.reportAdapterResult as ReportAdapterResultV1;
assert.equal(checkPipelineTestGateContract('reportAdapterResult', {
  ...reportResult,
  counts: { ...reportResult.counts, total: reportResult.counts.total + 1 },
}).ok, false, 'report outcome counts must sum to the exact total');
assert.equal(checkPipelineTestGateContract('reportAdapterResult', {
  ...reportResult,
  counts: { ...reportResult.counts, passed: 0, failed: 1 },
}).ok, false, 'complete report cases must agree with exact outcome counts');
assert.equal(checkPipelineTestGateContract('reportAdapterResult', {
  ...reportResult,
  cases: [reportResult.cases[0], { ...reportResult.cases[1], id: reportResult.cases[0].id }],
  counts: { total: 2, passed: 1, failed: 0, errored: 1, skipped: 0 },
}).ok, false, 'listed report case IDs must be unique');
assert.equal(checkPipelineTestGateContract('reportAdapterResult', {
  ...reportResult,
  casesTruncated: false,
  omittedCaseCount: 1,
}).ok, false, 'complete case details cannot claim an omitted case');
assert.equal(checkPipelineTestGateContract('reportAdapterResult', {
  ...reportResult,
  cases: reportResult.cases.slice(0, 2),
  casesTruncated: true,
  omittedCaseCount: 1,
}).ok, true, 'truncated case details remain valid when listed and omitted cases equal the total');
assert.equal(checkPipelineTestGateContract('reportAdapterResult', {
  ...reportResult,
  cases: [{ ...reportResult.cases[0] }, { ...reportResult.cases[1], outcome: 'passed' }],
  casesTruncated: true,
  omittedCaseCount: 1,
}).ok, false, 'listed truncated outcomes cannot exceed their exact outcome count');
assert.equal(checkPipelineTestGateContract('reportAdapterResult', {
  ...reportResult,
  cases: [{ ...reportResult.cases[0], findingsTruncated: true, omittedFindingCount: 0 }, ...reportResult.cases.slice(1)],
}).ok, false, 'case finding truncation requires a positive omitted count');
assert.equal(checkPipelineTestGateContract('reportAdapterResult', {
  ...reportResult,
  findingsTruncated: true,
  omittedFindingCount: 0,
}).ok, false, 'finding truncation requires a positive omitted count');
assert.equal(validate('nodeResult', {
  ...(validValues.nodeResult as object),
  state: 'skipped',
  outcome: 'skipped',
  attemptIds: [],
  finalAttemptId: null,
  skipReason: 'condition did not match',
}), true, 'a skipped node has no fabricated provider attempt');
assert.equal(validate('nodeResult', {
  ...(validValues.nodeResult as object),
  state: 'cancelled',
  outcome: null,
  attemptIds: [],
  finalAttemptId: null,
  unstable: false,
}), true, 'a node cancelled before execution has no fabricated attempt');
assert.equal(validate('attemptResult', {
  ...(validValues.attemptResult as object),
  nodeKind: 'fixture',
  mode: null,
  outputs: [{
    name: 'endpoint',
    kind: 'value',
    schemaId: 'kubeclaw.endpoint.v1',
    value: { url: 'http://service.test' },
  }],
}), true, 'fixtures return typed outputs through the same provider boundary');
assert.equal(validate('attemptResult', {
  ...(validValues.attemptResult as object),
  providerDetails: { framework: 'node-test' },
}), false, 'provider detail data requires its own schema identity and digest');

console.log(JSON.stringify({ ok: true, contracts: definitions.length, schema: schemaPath }));
