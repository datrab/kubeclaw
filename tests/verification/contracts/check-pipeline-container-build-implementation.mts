import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';

const pluginRoot = path.resolve('skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
  trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
  verifierId: 'container-build-implementation',
} }));
const entry = registry.testProviderContracts.get('kubeclaw.container-build@1');
assert.ok(entry);
assert.deepEqual(entry.registration.capabilities, ['container.build']);
assert.deepEqual(entry.registration.outputs.map((output) => [output.name, output.schemaId]),
  [['image', 'kubeclaw.container-image@1']]);

const declaration = JSON.parse(fs.readFileSync(
  'contracts/pipeline-test-gate/v1/examples/container-build-dockerfile.json', 'utf8'));
const suite = JSON.parse(fs.readFileSync(
  'contracts/pipeline-test-gate/v1/suites/container-build.v1.json', 'utf8'));
const limits = { cpuMillis: 60_000, memoryBytes: 1024 * 1024 * 1024, logBytes: 4 * 1024 * 1024,
  artifactBytes: 1024 * 1024, artifactFiles: 8, processes: 32 };
const plan = resolveTestPlan({ planId: 'plan:container-build:implementation', runId: 'run:container-build:implementation',
  project: 'container-build-implementation', scope: { moduleId: 'app', gateId: null },
  createdAt: '2026-08-24T00:00:00.000Z', declaration, suiteTemplates: [suite], registry,
  facts: { changedPaths: ['Dockerfile'], moduleType: 'service', pipelineStage: 'test' },
  policy: { defaultTimeoutMs: 60_000, maximumTimeoutMs: 120_000, defaultLimits: limits,
    maximumLimits: limits, maximumRetryCount: 1, maximumMatrixSize: 4, maximumNodes: 8,
    defaultConcurrencyLimit: 1, maximumConcurrencyLimits: { 'container-build': 1 } } });
assert.equal(plan.nodes.length, 1);
assert.equal(plan.nodes[0]?.provider.contractId, 'kubeclaw.container-build@1');

const runtimeSource = fs.readFileSync('skills/buster/engine/test-gates/container-build-runtime.ts', 'utf8');
assert.match(runtimeSource, /type=image,name=.*push=true/u);
assert.match(runtimeSource, /CONTAINER_BUILD_REGISTRY_DIGEST_MISMATCH/u);
assert.match(runtimeSource, /signal/u);
assert.doesNotMatch(runtimeSource, /contract emulator|mock|fake/iu);

console.log(JSON.stringify({ ok: true, phase: 'container-build-implementation',
  provider: 'kubeclaw.container-build@1', authority: 'container.build', mocks: 0, emulators: 0 }));
