import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalJson, portableJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { gateCoverageDigest } from '@kubeclaw/pipeline-test-gate-contract';

const sourceRoot = process.env.KUBECLAW_REVIEW_SOURCE_ROOT;
assert(sourceRoot && path.isAbsolute(sourceRoot), 'KUBECLAW_REVIEW_SOURCE_ROOT must be an absolute frozen candidate checkout');

const contract = await import(pathToFileURL(path.join(
  sourceRoot,
  'contracts/delivery-manifest/v3/src/index.ts',
)).href);
const schema = JSON.parse(fs.readFileSync(path.join(
  sourceRoot,
  'contracts/delivery-manifest/v3/schemas/delivery-manifest.v3.schema.json',
), 'utf8'));
const gateSchema = JSON.parse(fs.readFileSync(path.join(
  sourceRoot,
  'contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json',
), 'utf8'));

function schemaValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addSchema(gateSchema);
  return ajv.compile(schema);
}

const runId = 'run:delivery-v3-independent';
const revision = 'a'.repeat(40);

function policy(kind) {
  const unsigned = {
    schemaVersion: 'gate-coverage.v1',
    projectId: 'app',
    kind,
    baseRevision: revision,
    modules: [{
      moduleId: 'app',
      ownedPaths: ['app'],
      requirements: [{ id: 'works', statement: 'Independent contract vector.' }],
    }],
    integrationRequirements: [],
    requiredChecks: [{
      checkId: 'works',
      requirementRefs: [{ moduleId: 'app', requirementId: 'works' }],
      nodeIds: ['unit'],
    }],
  };
  return { ...unsigned, policyDigest: gateCoverageDigest(unsigned) };
}

function coverageResult(stageId, expected) {
  const unsigned = {
    schemaVersion: 'gate-coverage-result.v1',
    policy: expected,
    planDigest: sha256Text('independent-plan'),
    pipelineStageId: stageId,
    sourceRevision: `git:${revision}`,
    sourceTree: `git:${'b'.repeat(40)}`,
    archiveContentDigest: sha256Text('independent-archive'),
    checks: [{ checkId: 'works', declarationId: 'unit', nodeId: 'unit', state: 'passed' }],
  };
  return { ...unsigned, coverageDigest: sha256Text(canonicalJson(unsigned)) };
}

function artifact(artifactId, namespace, stageId, attemptId) {
  return {
    artifactId,
    namespace,
    mediaType: 'application/json',
    digest: sha256Text(artifactId),
    sizeBytes: 1,
    producer: { runId, stageId, attemptId, attemptNumber: 1 },
  };
}

function unsignedManifest() {
  const moduleCoverage = policy('module');
  const finalCoverage = policy('cumulative');
  const implementation = artifact(
    'implementation:app',
    'kubeclaw.implementation-agent',
    'forge',
    'forge:1',
  );
  return {
    schemaVersion: 'delivery-manifest.v3',
    projectId: 'app',
    runId,
    sourceRevision: revision,
    modules: [{
      moduleId: 'app',
      sourceStageId: 'forge',
      testStageId: 'test',
      expectedCoverage: moduleCoverage,
      sourceRevision: revision,
      decisionDigest: sha256Text('module-decision'),
      resultDigest: sha256Text('module-result'),
      coverage: coverageResult('test', moduleCoverage),
    }],
    final: {
      sourceStageId: 'forge',
      lintStageId: 'lint',
      testStageId: 'final-test',
      expectedCoverage: finalCoverage,
      sourceRevision: revision,
      decisionDigest: sha256Text('final-decision'),
      resultDigest: sha256Text('final-result'),
      coverage: coverageResult('final-test', finalCoverage),
    },
    evidence: [
      implementation,
      artifact('quality:test:decision:1', 'kubeclaw.buster-quality-gate', 'test', 'test:1'),
      artifact('quality:test:1', 'kubeclaw.buster-quality-gate', 'test', 'test:1'),
      implementation,
      artifact('quality:final-test:decision:1', 'kubeclaw.buster-quality-gate', 'final-test', 'final-test:1'),
      artifact('quality:final-test:1', 'kubeclaw.buster-quality-gate', 'final-test', 'final-test:1'),
      artifact('lint:app', 'kubeclaw.lint', 'lint', 'lint:1'),
    ],
  };
}

function withDigest(unsigned) {
  return { ...unsigned, digest: sha256Text(portableJson(unsigned)) };
}

test('valid public v3 vector is accepted and deeply frozen', () => {
  const value = contract.createDeliveryManifestV3(unsignedManifest());
  assert.equal(value.digest, sha256Text(portableJson(unsignedManifest())));
  assert(Object.isFrozen(value));
  assert(Object.isFrozen(value.modules));
  assert(Object.isFrozen(value.modules[0].expectedCoverage));
});

test('creator rejects caller-supplied digest rather than overwriting it', () => {
  const supplied = { ...unsignedManifest(), digest: `sha256:${'0'.repeat(64)}` };
  assert.throws(() => contract.createDeliveryManifestV3(supplied), /DELIVERY_MANIFEST_INVALID/);
});

test('published JSON schema matches runtime rejection of invalid expectedCoverage', () => {
  const validate = schemaValidator();
  const invalidExpected = unsignedManifest();
  invalidExpected.modules[0].expectedCoverage = {};
  const expectedValue = withDigest(invalidExpected);
  const schemaExpected = validate(expectedValue);
  let runtimeExpected = true;
  try { contract.parseDeliveryManifestV3(expectedValue); } catch { runtimeExpected = false; }
  assert.equal(schemaExpected, runtimeExpected, `expectedCoverage parity: ${JSON.stringify(validate.errors)}`);
});

test('published JSON schema matches runtime rejection of invalid coverage result', () => {
  const validate = schemaValidator();
  const invalidResult = unsignedManifest();
  invalidResult.final.coverage = {};
  const resultValue = withDigest(invalidResult);
  const schemaResult = validate(resultValue);
  let runtimeResult = true;
  try { contract.parseDeliveryManifestV3(resultValue); } catch { runtimeResult = false; }
  assert.equal(schemaResult, runtimeResult, `coverage parity: ${JSON.stringify(validate.errors)}`);
});

test('published JSON schema matches runtime ArtifactRef media-type bounds', () => {
  const validate = schemaValidator();
  const invalid = unsignedManifest();
  invalid.evidence[0] = { ...invalid.evidence[0], mediaType: 'x'.repeat(2049) };
  invalid.evidence[3] = invalid.evidence[0];
  const value = withDigest(invalid);
  const schemaResult = validate(value);
  let runtimeResult = true;
  try { contract.parseDeliveryManifestV3(value); } catch { runtimeResult = false; }
  assert.equal(schemaResult, runtimeResult, `ArtifactRef mediaType parity: ${JSON.stringify(validate.errors)}`);
});

test('creator rejects a complete serialized v3 artifact above eight MiB', () => {
  const maximum = 8 * 1024 * 1024;
  function sized(lastStatementLength) {
    const value = unsignedManifest();
    const requirements = Array.from({ length: 253 }, (_, index) => ({
      id: `requirement-${index}`,
      statement: 'x'.repeat(index === 252 ? lastStatementLength : 8192),
    }));
    for (const binding of [value.modules[0], value.final]) {
      const unsignedPolicy = { ...binding.expectedCoverage, modules: structuredClone(binding.expectedCoverage.modules) };
      delete unsignedPolicy.policyDigest;
      unsignedPolicy.modules[0].requirements = requirements;
      unsignedPolicy.requiredChecks[0].requirementRefs = requirements.map(requirement => ({
        moduleId: 'app',
        requirementId: requirement.id,
      }));
      binding.expectedCoverage = { ...unsignedPolicy, policyDigest: gateCoverageDigest(unsignedPolicy) };
      const unsignedResult = { ...binding.coverage, policy: binding.expectedCoverage };
      delete unsignedResult.coverageDigest;
      binding.coverage = { ...unsignedResult, coverageDigest: sha256Text(canonicalJson(unsignedResult)) };
    }
    return value;
  }
  let low = 1;
  let high = 8192;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (Buffer.byteLength(portableJson(sized(middle))) <= maximum) low = middle;
    else high = middle;
  }
  const value = sized(low);
  assert(Buffer.byteLength(portableJson(value)) <= maximum);
  const completeBytes = Buffer.byteLength(portableJson(withDigest(value)));
  assert(completeBytes > maximum, `test vector must exceed complete limit, got ${completeBytes}`);
  assert.throws(() => contract.createDeliveryManifestV3(value), /DELIVERY_MANIFEST_INVALID/);
});

test('creator rejects Proxy and accessor input without invoking caller traps', () => {
  let proxyTrap = 0;
  const proxy = new Proxy(unsignedManifest(), {
    ownKeys(target) { proxyTrap += 1; return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { proxyTrap += 1; return Reflect.getOwnPropertyDescriptor(target, key); },
    get(target, key, receiver) { proxyTrap += 1; return Reflect.get(target, key, receiver); },
  });
  assert.throws(() => contract.createDeliveryManifestV3(proxy), /CANONICAL_JSON_PROXY_UNSUPPORTED/);
  assert.equal(proxyTrap, 0);

  let getterCalls = 0;
  const accessor = unsignedManifest();
  Object.defineProperty(accessor, 'projectId', {
    enumerable: true,
    get() { getterCalls += 1; return 'app'; },
  });
  assert.throws(() => contract.createDeliveryManifestV3(accessor), /CANONICAL_JSON_PROPERTY_INVALID/);
  assert.equal(getterCalls, 0);
});

test('shared reader accepts a valid exact v3 ref and rejects a missing portable tag', () => {
  const manifest = contract.createDeliveryManifestV3(unsignedManifest());
  const bytes = portableJson(manifest);
  const expectedRef = {
    artifactId: `project-summary:${runId}`,
    namespace: 'kubeclaw.project-summary',
    mediaType: 'application/json',
    encoding: 'kubeclaw-json.utf16.v1',
    digest: sha256Text(bytes),
    sizeBytes: Buffer.byteLength(bytes),
    producer: { runId, stageId: 'project-summary', attemptId: 'project-summary:1', attemptNumber: 1 },
  };
  const owner = { runId, manifestStageId: 'project-summary', gateStageId: 'final-test', expectedRef, bytes };
  assert.deepEqual(contract.assertDeliveryManifestForRead(manifest, owner), manifest);
  const { encoding: _encoding, ...untagged } = expectedRef;
  assert.throws(
    () => contract.assertDeliveryManifestForRead(manifest, { ...owner, expectedRef: untagged }),
    /DELIVERY_MANIFEST_INVALID/,
  );
});
