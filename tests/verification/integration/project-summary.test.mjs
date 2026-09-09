import { coverageReviewRequirements, gateCoverageDigest } from '@kubeclaw/pipeline-test-gate-contract';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { activate } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import { buildSummary } from '../../../skills/nova/plugins/project-summary/src/summary.ts';

// Artifact-contract verification: these stored report fixtures do not execute providers or agents.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-evidence-'));
const adapter = activate({ config: { artifactRoot: root } });
const runId = 'delivery:run';
const revision = 'a'.repeat(40);
let sequence = 0;
const artifacts = [];
const invoke = (capability, request, stageId = 'summary') => adapter.invoke({ confidential: true,
  signal: new AbortController().signal, request: { ...request, capability, idempotencyKey: `artifact:${++sequence}`,
    attempt: { runId, stageId, attemptId: `${stageId}:1`, attemptNumber: 1 } } });
async function put(stageId, namespace, artifactId, value) {
  const response = await invoke('artifacts.write', { operation: 'put_json', resource: { type: 'artifact.object', canonicalId: artifactId },
    payload: { namespace, mediaType: 'application/json', value } }, stageId);
  artifacts.push(response.artifact);
  return response.artifact;
}
const context = refs => ({ contract: { artifacts: refs, lease: { attempt: { runId } } }, invoke });
function coverage(kind) {
  const value = { schemaVersion: 'gate-coverage.v1', projectId: 'app', kind, baseRevision: revision,
    modules: [{ moduleId: 'app', ownedPaths: ['app'], requirements: [{ id: 'works', statement: 'Application works.' }] }],
    integrationRequirements: [], requiredChecks: [{ checkId: 'works', requirementRefs: [{ moduleId: 'app', requirementId: 'works' }], nodeIds: ['unit'] }] };
  return { ...value, policyDigest: gateCoverageDigest(value) };
}
const moduleCoverage = coverage('module');
const finalCoverage = coverage('cumulative');
const input = { projectId: 'app', modules: [{ moduleId: 'app', sourceStageId: 'forge', testStageId: 'test', expectedCoverage: moduleCoverage }],
  final: { sourceStageId: 'forge', testStageId: 'final-test', lintStageId: 'lint', expectedCoverage: finalCoverage } };
async function gateFixture(stageId, policy) {
  const unsignedCoverage = { schemaVersion: 'gate-coverage-result.v1', policy, planDigest: sha256Text('contract-vector-plan'),
    pipelineStageId: stageId, sourceRevision: `git:${revision}`, sourceTree: `git:${'b'.repeat(40)}`, archiveContentDigest: sha256Text('contract-vector-archive'),
    checks: [{ checkId: 'works', declarationId: 'unit', nodeId: 'unit', state: 'passed' }] };
  const coverage = { ...unsignedCoverage, coverageDigest: sha256Text(canonicalJson(unsignedCoverage)) };
  const unsigned = { schemaVersion: 'test-gate-decision.v2', coverage, runId, state: 'passed', jobId: `job:${stageId}`, planId: `plan:${stageId}`,
    resultDigest: sha256Text('stored-result'), reviews: [], nodes: [{ nodeId: 'unit', kind: 'test', mode: 'blocking', effect: 'passed', reason: 'Artifact contract fixture only.' }] };
  const decisionDigest = sha256Text(canonicalJson(unsigned));
  await put(stageId, 'kubeclaw.buster-quality-gate', `buster-quality:${stageId}:decision:1`, { ...unsigned, decisionDigest });
  const quality = await put(stageId, 'kubeclaw.buster-quality-gate', `buster-quality:${stageId}:1`, { sourceRevision: revision, testAgent: { enabled: false }, nativeOutcome: 'passed', decisionDigest });
  return { quality, decisionDigest };
}
try {
  await adapter.ready();
  await put('forge', 'kubeclaw.implementation-agent', 'implementation:app', { status: 'ready_for_testing', sourceRevision: revision });
  await put('lint', 'kubeclaw.lint', 'lint:full:app', { sourceRevision: revision, summary: { tools_failed: 0, total_blocking: 0 } });
  const { quality, decisionDigest } = await gateFixture('test', moduleCoverage);
  await gateFixture('final-test', finalCoverage);
  const manifest = await buildSummary(input, context(artifacts));
  assert.equal(manifest.sourceRevision, revision);
  assert.equal(manifest.runId, runId);
  assert.equal(manifest.schemaVersion, 'delivery-manifest.v2');
  assert.equal(manifest.metrics, undefined);
  await assert.rejects(() => buildSummary({ ...input, final: { ...input.final, testStageId: 'test' } }, context(artifacts)), /EXPECTED_POLICY_MISMATCH/);
  await assert.rejects(() => buildSummary({ ...input, final: { ...input.final, expectedCoverage: moduleCoverage } }, context(artifacts)), /CUMULATIVE_COVERAGE_REQUIRED/);
  const bundle = { revisions: { base: revision, head: revision }, requirements: coverageReviewRequirements(finalCoverage),
    scope: { allowedPrefixes: ['app'] }, evidence: [{ kind: 'gate-coverage', content: canonicalJson(finalCoverage) }] };
  await put('review', 'kubeclaw.review', 'review-bundle:contract', bundle);
  await put('review', 'kubeclaw.review', 'review-report:contract', { revision: bundle.revisions, outcome: 'passed', bundleDigest: sha256Text(canonicalJson(bundle)) });
  const withReview = { ...input, final: { ...input.final, reviewStageId: 'review' } };
  assert.equal((await buildSummary(withReview, context(artifacts))).sourceRevision, revision);
  const narrow = { ...bundle, requirements: [{ id: 'last-only', statement: 'Narrow review.' }] };
  await put('narrow-review', 'kubeclaw.review', 'review-bundle:narrow', narrow);
  await put('narrow-review', 'kubeclaw.review', 'review-report:narrow', { revision: narrow.revisions, outcome: 'passed', bundleDigest: sha256Text(canonicalJson(narrow)) });
  await assert.rejects(() => buildSummary({ ...input, final: { ...input.final, reviewStageId: 'narrow-review' } }, context(artifacts)), /REVIEW_COVERAGE_MISMATCH/);
  await assert.rejects(() => buildSummary(input, context([])), /MISSING_OR_AMBIGUOUS/);
  await assert.rejects(() => buildSummary(input, context(artifacts.map(ref => ref === quality ? { ...ref, sizeBytes: ref.sizeBytes + 1 } : ref))), /CORRUPT/);
  await assert.rejects(() => buildSummary(input, context(artifacts.map(ref => ({ ...ref, producer: { ...ref.producer, runId: 'other:run' } })))), /MISSING_OR_AMBIGUOUS/);
  artifacts.splice(artifacts.indexOf(quality), 1);
  await put('test', 'kubeclaw.buster-quality-gate', 'buster-quality:test:1', { sourceRevision: 'b'.repeat(40), verdict: { outcome: 'passed' }, decisionDigest });
  await assert.rejects(() => buildSummary(input, context(artifacts)), /CANDIDATE_MISMATCH/);
} finally { await adapter.shutdown(); fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, suite: 'delivery-artifact-contract', providerExecution: false, agentExecution: false }));
