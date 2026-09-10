import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { gateCoverageDigest, remotePlanDigest } from '@kubeclaw/pipeline-test-gate-contract';
import { canonicalJson, portableJson, sha256Text } from '@kubeclaw/plugin-sdk';
import {
  assertDeliveryManifestForRead,
  createDeliveryManifestV3,
  DELIVERY_MANIFEST_ARTIFACT_ENCODING,
  parseDeliveryManifestV3,
} from '../src/index.ts';

const revision = 'a'.repeat(40);
const runId = 'delivery-run';
const hash = (char: string) => `sha256:${char.repeat(64)}`;
function policy(kind: 'module' | 'cumulative') {
  const unsigned = { schemaVersion: 'gate-coverage.v1' as const, projectId: 'project', kind,
    baseRevision: revision, modules: [{ moduleId: 'module', ownedPaths: ['src'],
      requirements: [{ id: 'REQ-1', statement: 'must pass' }] }], integrationRequirements: [],
    requiredChecks: [{ checkId: 'check', requirementRefs: [{ moduleId: 'module', requirementId: 'REQ-1' }], nodeIds: ['test'] }] };
  return { ...unsigned, policyDigest: gateCoverageDigest(unsigned) };
}
function result(expected: ReturnType<typeof policy>, stageId: string) {
  const unsigned = { schemaVersion: 'gate-coverage-result.v1' as const, policy: expected,
    planDigest: hash('1'), pipelineStageId: stageId, sourceRevision: `git:${revision}`,
    sourceTree: `git:${revision}`, archiveContentDigest: hash('2'),
    checks: [{ checkId: 'check', declarationId: 'test', nodeId: 'test', state: 'passed' as const }] };
  return { ...unsigned, coverageDigest: remotePlanDigest(unsigned) };
}
function ref(stageId: string, namespace: string, artifactId: string, attemptId = stageId) {
  return { artifactId, namespace, mediaType: 'application/json', digest: hash('3'), sizeBytes: 1,
    producer: { runId, stageId, attemptId, attemptNumber: 1 } };
}
function unsigned() {
  const modulePolicy = policy('module'), finalPolicy = policy('cumulative');
  const implementation = ref('implement-module', 'kubeclaw.implementation-agent', 'implementation:module');
  const moduleDecision = ref('test-module', 'kubeclaw.buster-quality-gate', 'module:decision:1', 'module-gate');
  const moduleQuality = ref('test-module', 'kubeclaw.buster-quality-gate', 'module:quality:1', 'module-gate');
  const finalDecision = ref('final-test', 'kubeclaw.buster-quality-gate', 'final:decision:1', 'final-gate');
  const finalQuality = ref('final-test', 'kubeclaw.buster-quality-gate', 'final:quality:1', 'final-gate');
  return { schemaVersion: 'delivery-manifest.v3' as const, projectId: 'project', runId, sourceRevision: revision,
    modules: [{ moduleId: 'module', sourceStageId: 'implement-module', testStageId: 'test-module',
      expectedCoverage: modulePolicy, sourceRevision: revision, decisionDigest: hash('4'), resultDigest: hash('5'),
      coverage: result(modulePolicy, 'test-module') }],
    final: { sourceStageId: 'implement-module', lintStageId: 'final-lint', testStageId: 'final-test',
      expectedCoverage: finalPolicy, sourceRevision: revision, decisionDigest: hash('6'), resultDigest: hash('7'),
      coverage: result(finalPolicy, 'final-test') },
    evidence: [implementation, moduleDecision, moduleQuality, implementation, finalDecision, finalQuality,
      ref('final-lint', 'kubeclaw.lint', 'lint:final')] };
}

test('creates, parses and reads the closed portable v3 identity', () => {
  const manifest = createDeliveryManifestV3(unsigned());
  assert.equal(manifest.digest, sha256Text(portableJson(unsigned())));
  assert.ok(Object.isFrozen(manifest));
  assert.deepEqual(parseDeliveryManifestV3(manifest), manifest);
  const bytes = portableJson(manifest);
  const expectedRef = { ...ref('project-summary', 'kubeclaw.project-summary', `project-summary:${runId}`),
    digest: sha256Text(bytes), sizeBytes: Buffer.byteLength(bytes), encoding: DELIVERY_MANIFEST_ARTIFACT_ENCODING };
  assert.deepEqual(assertDeliveryManifestForRead(manifest, { runId, manifestStageId: 'project-summary',
    gateStageId: 'final-test', expectedRef, bytes }), manifest);
});

test('creator rejects caller digest and no-trap inputs before property reflection', () => {
  assert.throws(() => createDeliveryManifestV3({ ...unsigned(), digest: hash('8') } as never), /DELIVERY_MANIFEST_INVALID/);
  let gets = 0;
  const withGetter = { ...unsigned(), get projectId() { gets += 1; return 'project'; } };
  assert.throws(() => createDeliveryManifestV3(withGetter), /CANONICAL_JSON_PROPERTY_INVALID/);
  assert.equal(gets, 0);
  assert.throws(() => createDeliveryManifestV3(new Proxy(unsigned(), { ownKeys() { throw new Error('TRAP'); } })),
    /CANONICAL_JSON_PROXY_UNSUPPORTED/);
});

test('v3 refuses version/tag/owner/evidence disagreements', () => {
  const valid = createDeliveryManifestV3(unsigned());
  const broken = structuredClone(valid) as any;
  broken.evidence[1].producer.attemptId = 'other';
  const { digest: _ignored, ...body } = broken;
  broken.digest = sha256Text(portableJson(body));
  assert.throws(() => parseDeliveryManifestV3(broken), /DELIVERY_MANIFEST_INVALID/);
  const bytes = portableJson(valid);
  const expectedRef = { ...ref('project-summary', 'kubeclaw.project-summary', `project-summary:${runId}`),
    digest: sha256Text(bytes), sizeBytes: Buffer.byteLength(bytes) };
  assert.throws(() => assertDeliveryManifestForRead(valid, { runId, manifestStageId: 'project-summary',
    gateStageId: 'final-test', expectedRef, bytes }), /DELIVERY_MANIFEST_INVALID/);
});

test('legacy reader retains untagged and portable-tagged v2 outer refs', () => {
  const body = { schemaVersion: 'delivery-manifest.v2', projectId: 'project', runId, sourceRevision: revision,
    modules: [], final: { sourceRevision: revision, testStageId: 'final-test' }, evidence: [] };
  const manifest = { ...body, digest: sha256Text(canonicalJson(body)) };
  for (const encoding of [undefined, DELIVERY_MANIFEST_ARTIFACT_ENCODING] as const) {
    const bytes = encoding === undefined ? canonicalJson(manifest) : portableJson(manifest);
    const expectedRef = { ...ref('project-summary', 'kubeclaw.project-summary', 'historical-summary-id'),
      digest: sha256Text(bytes), sizeBytes: Buffer.byteLength(bytes), ...(encoding === undefined ? {} : { encoding }) };
    assert.deepEqual(assertDeliveryManifestForRead(manifest, { runId, manifestStageId: 'project-summary',
      gateStageId: 'final-test', expectedRef, bytes }), manifest);
  }
});

test('closed schema and runtime both reject non-JSON and overlong evidence media types', () => {
  const gateSchema = JSON.parse(readFileSync(new URL(
    '../../../pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json', import.meta.url), 'utf8'));
  const manifestSchema = JSON.parse(readFileSync(new URL(
    '../schemas/delivery-manifest.v3.schema.json', import.meta.url), 'utf8'));
  const Ajv = Ajv2020 as unknown as new (options: object) => {
    addSchema(schema: object): void;
    compile(schema: object): (value: unknown) => boolean;
  };
  const ajv = new Ajv({ allErrors: true, strict: true });
  ajv.addSchema(gateSchema);
  const validate = ajv.compile(manifestSchema);
  const valid = createDeliveryManifestV3(unsigned());
  assert.equal(validate(valid), true);
  for (const mediaType of ['text/plain', `application/json${'x'.repeat(2048)}`]) {
    const brokenUnsigned = structuredClone(unsigned()) as any;
    brokenUnsigned.evidence[0].mediaType = mediaType;
    assert.throws(() => createDeliveryManifestV3(brokenUnsigned), /DELIVERY_MANIFEST_INVALID/);
    const brokenManifest = structuredClone(valid) as any;
    brokenManifest.evidence[0].mediaType = mediaType;
    assert.equal(validate(brokenManifest), false);
  }
});
