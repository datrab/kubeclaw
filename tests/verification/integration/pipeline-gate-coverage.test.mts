import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { buildRegistry, discoverPackages, resolveTestPlan } from '../../../skills/nova/core/src/index.ts';
import { coverageCheckStatuses, gateCoverageDigest, validatePipelineTestGateContract,
  type GateCoverageV1 } from '../../../contracts/pipeline-test-gate/v1/src/index.ts';
import type { TestScopeDeclaration } from '../../../skills/nova/core/test-gates/types.ts';

const pluginRoot = path.resolve(import.meta.dirname, '../../../skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
  trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'coverage-contract-test',
} }));
const templateRoot = path.resolve(import.meta.dirname, '../../../contracts/pipeline-test-gate/v1/suites');
const suiteTemplates = fs.readdirSync(templateRoot).filter(name => name.endsWith('.json'))
  .map(name => JSON.parse(fs.readFileSync(path.join(templateRoot, name), 'utf8')));
const limits = { cpuMillis: 30000, memoryBytes: 536870912, logBytes: 1048576, artifactBytes: 1048576, artifactFiles: 16, processes: 16 };
const command = { uses: 'kubeclaw.direct-command@1', config: {
  executable: 'node', args: ['--test'], resultMode: 'exit-code' as const,
} };

function coverage(nodeIds: string[]): GateCoverageV1 {
  const unsigned = { schemaVersion: 'gate-coverage.v1' as const, projectId: 'coverage-proof', kind: 'module' as const,
    baseRevision: 'a'.repeat(40), modules: [{ moduleId: 'api', ownedPaths: ['api'], requirements: [{ id: 'api-works', statement: 'API contracts hold.' }] }],
    integrationRequirements: [], requiredChecks: [{ checkId: 'api-contract', requirementRefs: [{ moduleId: 'api', requirementId: 'api-works' }], nodeIds }] };
  return { ...unsigned, policyDigest: gateCoverageDigest(unsigned) };
}

function resolve(declaration: TestScopeDeclaration) {
  return resolveTestPlan({ planId: 'plan:coverage', runId: 'run:coverage', project: 'coverage-proof',
    scope: { moduleId: 'api', gateId: null }, createdAt: '2026-09-09T00:00:00Z', registry, declaration, suiteTemplates,
    facts: { changedPaths: [], moduleType: null, pipelineStage: null }, policy: {
      defaultTimeoutMs: 30000, maximumTimeoutMs: 30000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 1, maximumMatrixSize: 8, maximumNodes: 128, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: {},
    } });
}

test('all original suite templates selected with excluded tests do not cover a missing mandatory check', () => {
  const suites = Object.fromEntries(suiteTemplates.map((template, index) => [`suite-${index}`, { uses: template.contractId, exclude: [...Object.keys(template.tests ?? {}), ...Object.keys(template.fixtures ?? {})] }]));
  const plan = resolve({ coverage: coverage(['required-api']), suites, tests: { unrelated: command } });
  assert.equal(plan.suites.length, suiteTemplates.length);
  assert.equal(plan.nodes.length, 1);
  assert.deepEqual(coverageCheckStatuses(plan).map(item => item.state), ['missing']);
});

test('condition-skipped and advisory mandatory checks stay visibly unsatisfied', () => {
  const plan = resolve({ coverage: coverage(['conditional', 'advisory']), tests: {
    conditional: { ...command, when: { changedPaths: ['api/**'] } }, advisory: { ...command, mode: 'advisory' },
  } });
  assert.deepEqual(coverageCheckStatuses(plan).map(item => item.state), ['skipped', 'advisory']);
});

test('explicit exclusion retains the required declaration without silently reducing policy', () => {
  const original = suiteTemplates.find(template => template.contractId === 'kubeclaw.unit-suite@1');
  const template = { ...original, tests: { required: command } };
  suiteTemplates[suiteTemplates.indexOf(original)] = template;
  try {
    const policy = coverage(['unit/required']);
    const plan = resolve({ coverage: policy, suites: { unit: { uses: template.contractId, exclude: ['required'] } }, tests: { unrelated: command } });
    assert.equal(plan.coverage?.policy.policyDigest, policy.policyDigest);
    assert.deepEqual(coverageCheckStatuses(plan).map(item => item.state), ['excluded']);
  } finally { suiteTemplates[suiteTemplates.indexOf(template)] = original; }
});

test('all resolved matrix variations are mandatory, with no synthetic execution assertion', () => {
  const plan = resolve({ coverage: coverage(['http']), tests: { http: { uses: 'kubeclaw.http@1',
    config: { url: 'http://127.0.0.1:1/', expectedStatuses: [200] }, matrix: { path: ['/first', '/second'] } } } });
  const statuses = coverageCheckStatuses(plan);
  assert.equal(statuses.length, 2);
  assert.deepEqual(statuses.map(item => item.nodeId), plan.nodes.map(node => node.id));
  assert.ok(statuses.every(item => item.state === 'ready'));
});

test('policy corruption, duplicate requirements and unmapped requirements fail validation', () => {
  const policy = coverage(['api']);
  assert.throws(() => validatePipelineTestGateContract('gateCoverage', { ...policy, projectId: 'other' }), /DIGEST/);
  const { policyDigest: _digest, ...unsigned } = policy;
  const duplicate = { ...unsigned, modules: [...unsigned.modules, ...unsigned.modules] };
  assert.throws(() => validatePipelineTestGateContract('gateCoverage', { ...duplicate, policyDigest: gateCoverageDigest(duplicate) }), /DUPLICATE/);
  const unmapped = { ...unsigned, integrationRequirements: [{ id: 'interaction', statement: 'Modules interact correctly.' }], kind: 'cumulative' as const };
  assert.throws(() => validatePipelineTestGateContract('gateCoverage', { ...unmapped, policyDigest: gateCoverageDigest(unmapped) }), /UNMAPPED/);
});

test('existing standalone plans retain execution semantics but carry no completeness policy', () => {
  const plan = resolve({ tests: { optional: { ...command, when: { changedPaths: ['none/**'] } } } });
  assert.equal(plan.coverage, undefined);
  assert.deepEqual(coverageCheckStatuses(plan), []);
});

test('a literal matrix-shaped declaration cannot impersonate a missing base check', () => {
  const plan = resolve({ coverage: coverage(['required']), tests: { 'required/matrix-001': command } });
  assert.deepEqual(coverageCheckStatuses(plan).map(item => item.state), ['missing']);
});
