import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { canonicalJson, PORTABLE_JSON_ENCODING, sha256Text } from '@kubeclaw/plugin-sdk';
import { coverageReviewRequirements, gateCoverageDigest } from '@kubeclaw/pipeline-test-gate-contract';

const sourceRoot = process.env.KUBECLAW_REVIEW_SOURCE_ROOT;
assert(sourceRoot && path.isAbsolute(sourceRoot), 'KUBECLAW_REVIEW_SOURCE_ROOT must be absolute');
const [{ buildSummary }, { activate }] = await Promise.all([
  import(pathToFileURL(path.join(sourceRoot, 'skills/nova/plugins/project-summary/src/summary.ts')).href),
  import(pathToFileURL(path.join(sourceRoot, 'skills/common/plugins/artifact-store/src/adapter.ts')).href),
]);

const runId = 'run:delivery-summary-mode-independent';
const revision = 'a'.repeat(40);

function coverage(kind) {
  const value = {
    schemaVersion: 'gate-coverage.v1', projectId: 'app', kind, baseRevision: revision,
    modules: [{ moduleId: 'app', ownedPaths: ['app'], requirements: [{ id: 'works', statement: 'Works.' }] }],
    integrationRequirements: [],
    requiredChecks: [{ checkId: 'works', requirementRefs: [{ moduleId: 'app', requirementId: 'works' }], nodeIds: ['unit'] }],
  };
  return { ...value, policyDigest: gateCoverageDigest(value) };
}

function gateRecords(stageId, policy) {
  const unsignedCoverage = {
    schemaVersion: 'gate-coverage-result.v1', policy,
    planDigest: sha256Text('plan'), pipelineStageId: stageId,
    sourceRevision: `git:${revision}`, sourceTree: `git:${'b'.repeat(40)}`,
    archiveContentDigest: sha256Text('archive'),
    checks: [{ checkId: 'works', declarationId: 'unit', nodeId: 'unit', state: 'passed' }],
  };
  const gateCoverage = { ...unsignedCoverage, coverageDigest: sha256Text(canonicalJson(unsignedCoverage)) };
  const unsignedDecision = {
    schemaVersion: 'test-gate-decision.v2', coverage: gateCoverage, runId, state: 'passed',
    jobId: `job:${stageId}`, planId: `plan:${stageId}`, resultDigest: sha256Text('result'),
    reviews: [], nodes: [{ nodeId: 'unit', kind: 'test', mode: 'blocking', effect: 'passed', reason: 'Works.' }],
  };
  const decisionDigest = sha256Text(canonicalJson(unsignedDecision));
  return [
    [`quality:${stageId}:decision:1`, { ...unsignedDecision, decisionDigest }],
    [`quality:${stageId}:1`, { sourceRevision: revision, testAgent: { enabled: false }, nativeOutcome: 'passed', decisionDigest }],
  ];
}

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-summary-mode-'));
  const adapter = activate({ config: { artifactRoot: root } });
  await adapter.ready();
  let ordinal = 0;
  const artifacts = [];
  const invoke = async (capability, request, stageId = 'summary') => adapter.invoke({
    confidential: true,
    signal: new AbortController().signal,
    request: {
      ...request, capability, idempotencyKey: `artifact:${++ordinal}`,
      attempt: { runId, stageId, attemptId: `${stageId}:1`, attemptNumber: 1 },
    },
  });
  async function put(stageId, namespace, artifactId, value, encoding) {
    const response = await invoke('artifacts.write', {
      operation: 'put_json', resource: { type: 'artifact.object', canonicalId: artifactId },
      payload: { namespace, mediaType: 'application/json', value, ...(encoding === undefined ? {} : { encoding }) },
    }, stageId);
    artifacts.push(response.artifact);
  }
  const moduleCoverage = coverage('module');
  const finalCoverage = coverage('cumulative');
  await put('forge', 'kubeclaw.implementation-agent', 'implementation:app', { status: 'ready_for_testing', sourceRevision: revision });
  await put('lint', 'kubeclaw.lint', 'lint:app', { sourceRevision: revision, summary: { tools_failed: 0, total_blocking: 0 } });
  for (const [artifactId, value] of gateRecords('test', moduleCoverage)) await put('test', 'kubeclaw.buster-quality-gate', artifactId, value);
  for (const [artifactId, value] of gateRecords('final-test', finalCoverage)) await put('final-test', 'kubeclaw.buster-quality-gate', artifactId, value);
  const bundle = {
    revisions: { base: revision, head: revision }, requirements: coverageReviewRequirements(finalCoverage),
    scope: { allowedPrefixes: ['app'] },
    evidence: [{ kind: 'gate-coverage', content: canonicalJson(finalCoverage) }],
  };
  await put('review', 'kubeclaw.review', 'review-bundle:contract', bundle, PORTABLE_JSON_ENCODING);
  await put('review', 'kubeclaw.review', 'review-report:contract', {
    revision: bundle.revisions, outcome: 'passed', bundleDigest: sha256Text(canonicalJson(bundle)),
  }, PORTABLE_JSON_ENCODING);
  const input = {
    projectId: 'app',
    modules: [{ moduleId: 'app', sourceStageId: 'forge', testStageId: 'test', expectedCoverage: moduleCoverage }],
    final: { sourceStageId: 'forge', testStageId: 'final-test', lintStageId: 'lint', reviewStageId: 'review', expectedCoverage: finalCoverage },
  };
  let evidenceReads = 0;
  const context = {
    contract: { artifacts, lease: { attempt: { runId } } },
    async invoke(...args) { evidenceReads += 1; return invoke(...args); },
  };
  return { root, adapter, input, context, reads: () => evidenceReads };
}

test('v3-only Review artifact expectation is rejected in legacy delivery before evidence reads', async () => {
  const value = await fixture();
  try {
    const invalid = { ...value.input, final: { ...value.input.final, reviewArtifactEncoding: PORTABLE_JSON_ENCODING } };
    await assert.rejects(() => buildSummary(invalid, value.context), /DELIVERY_REVIEW_ARTIFACT_MODE_INVALID/);
    assert.equal(value.reads(), 0, 'invalid legacy/v3 field mixture performed evidence reads');
  } finally {
    await value.adapter.shutdown();
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('invalid v3 Review conditionals are rejected before evidence reads', async () => {
  for (const finalPatch of [
    { reviewStageId: undefined, reviewArtifactEncoding: PORTABLE_JSON_ENCODING },
    { reviewSemanticEncoding: 'review-semantics.utf16-v1' },
  ]) {
    const value = await fixture();
    try {
      const final = { ...value.input.final, ...finalPatch };
      if (final.reviewStageId === undefined) delete final.reviewStageId;
      await assert.rejects(
        () => buildSummary({ ...value.input, final }, value.context, 'delivery-manifest.utf16-v1'),
        /DELIVERY_REVIEW_ARTIFACT_MODE_INVALID/,
      );
      assert.equal(value.reads(), 0, 'invalid v3 Review conditionals performed evidence reads');
    } finally {
      await value.adapter.shutdown();
      fs.rmSync(value.root, { recursive: true, force: true });
    }
  }
});
