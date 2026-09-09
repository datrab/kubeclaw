import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { canonicalJson, sha256Text, type PluginInvocationContext } from '@kubeclaw/plugin-sdk';
import { coverageReviewRequirements, gateCoverageDigest } from '@kubeclaw/pipeline-test-gate-contract';
import { activate } from '../../../../common/plugins/artifact-store/src/adapter.ts';
import { parseReviewInput } from '../src/review-stage-input.ts';
import { assertReviewCoverage } from '../src/review-coverage.ts';
import { snapshotReviewBundle } from '../src/review-bundle-snapshot.ts';
import { storeReviewBundle } from '../src/review-report-storage.ts';

test('original review parser validates cumulative policy and stores its actual immutable bundle', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-coverage-'));
  const adapter = activate({ config: { artifactRoot: root } } as never);
  const attempt = { runId: 'run:coverage', stageId: 'final-review', attemptId: 'attempt:1', attemptNumber: 1 };
  let sequence = 0;
  const context = { contract: { lease: { attempt } }, async invoke(capability: string, request: object) {
    return adapter.invoke({ confidential: true, signal: new AbortController().signal,
      request: { ...request, capability, idempotencyKey: `coverage:${++sequence}`, attempt } } as never);
  } } as unknown as PluginInvocationContext;
  const unsigned = { schemaVersion: 'gate-coverage.v1' as const, kind: 'cumulative' as const, projectId: 'app', baseRevision: 'a'.repeat(40),
    modules: [{ moduleId: 'app', ownedPaths: ['src'], requirements: [{ id: 'works', statement: 'Application meets its contract.' }] }],
    integrationRequirements: [], requiredChecks: [{ checkId: 'unit', requirementRefs: [{ moduleId: 'app', requirementId: 'works' }], nodeIds: ['unit'] }] };
  const coverage = { ...unsigned, policyDigest: gateCoverageDigest(unsigned) };
  const input = { task: { id: 'final', statement: 'Review the integrated candidate.' }, revisions: { base: coverage.baseRevision, head: 'b'.repeat(40) },
    scope: { allowedPrefixes: ['src'], ownershipPrefixes: ['src'] }, requirements: coverageReviewRequirements(coverage),
    evidence: [{ kind: 'gate-coverage', digest: sha256Text(canonicalJson(coverage)), content: coverage }], contextCandidates: [] };
  const parsed = parseReviewInput(input);
  assert.equal(parsed.ok, true);
  assertReviewCoverage(parsed.value);
  assert.throws(() => assertReviewCoverage({ ...parsed.value, revisions: { ...parsed.value.revisions, base: 'c'.repeat(40) } }), /BASE_MISMATCH/);
  assert.throws(() => assertReviewCoverage({ ...parsed.value, scope: { allowedPrefixes: ['src/narrow'], ownershipPrefixes: ['src/narrow'] } }), /SCOPE_MISMATCH/);
  assert.throws(() => assertReviewCoverage({ ...parsed.value, requirements: [{ id: 'last-module-only', statement: 'Too narrow.' }] }), /SCOPE_MISMATCH/);
  const content = 'export const application = true;\n';
  const changedPaths = [{ path: 'src/index.ts', status: 'added' }];
  const snapshot = snapshotReviewBundle({ schemaVersion: 'review-bundle.v1', task: input.task,
    revisions: { ...input.revisions, changedManifestDigest: sha256Text(canonicalJson(changedPaths)) },
    scope: { allowedPrefixes: ['src'], changedPaths }, requirements: parsed.value.requirements, evidence: parsed.value.evidence,
    context: [{ path: 'src/index.ts', content, digest: sha256Text(content), reasons: [{ kind: 'changed' }] }],
    selection: { version: 'focused-context.v1', candidateManifestDigest: sha256Text('source descriptors'), expansionRound: 0 }, policyDigest: sha256Text('review policy') });
  try {
    await adapter.ready();
    const artifact = await storeReviewBundle(snapshot, context);
    assert.equal(artifact.digest, snapshot.digest);
    const stored = await context.invoke('artifacts.read', { operation: 'get_json', resource: { type: 'artifact.object', canonicalId: artifact.artifactId },
      payload: { namespace: artifact.namespace, digest: artifact.digest } });
    assert.deepEqual(stored.value, JSON.parse(canonicalJson(snapshot.bundle)));
    assert.equal(artifact.producer.attemptId, attempt.attemptId);
  } finally { await adapter.shutdown(new AbortController().signal); fs.rmSync(root, { recursive: true, force: true }); }
});
