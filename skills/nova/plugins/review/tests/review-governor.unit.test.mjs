import assert from 'node:assert/strict';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { buildReviewGovernorSnapshot, ReviewGovernorIntegrityError } from '../src/review-governor.ts';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';
import { applyReviewGovernor } from '../src/review-governor-decision.ts';

const base = '1'.repeat(40), head = '2'.repeat(40), proof = 'a'.repeat(64);
const policy = resolveReviewPolicy({ builtIn: getReviewPolicyProfile('gate') });
const changedPaths = [{ path: 'src/a.ts', status: 'modified' }];
const manifest = sha256Text(canonicalJson(changedPaths));
const input = { revisions: { base }, scope: { allowedPrefixes: ['src'], ownershipPrefixes: ['src'] } };
const snapshot = {
  digest: sha256Text('bundle'),
  bundle: { revisions: { base, head, changedManifestDigest: manifest }, scope: { changedPaths } },
};

function context(remediationCyclesUsed = 0, attemptsUsed = 0, lineEnd = 10) {
  return {
    contract: { stageLifecycle: { attemptsUsed, remediationCyclesUsed, maxAttempts: 8, maxRemediationCycles: 4 } },
    async invoke(_capability, request) {
      const ranges = [{ start: 1, end: lineEnd }];
      return { base, head, path: request.resource.canonicalId, ranges, rangesDigest: sha256Text(canonicalJson(ranges)) };
    },
  };
}

async function build(options = {}) {
  return buildReviewGovernorSnapshot({
    input, snapshot, revision: { head, proof }, policy,
    context: options.context ?? context(), ...(options.baseline ? { baseline: options.baseline } : {}),
  });
}

const initial = await build();
assert.equal(initial.decision, 'within_scope');
assert.equal(initial.baseline.nonTestLoc, 10);
assert.equal(initial.current.changedFileCount, 1);

const retried = await build({ context: context(0, 7), baseline: initial.baseline });
assert.equal(retried.decision, 'within_scope', 'ordinary attempts do not consume repair cycles');
const exhausted = await build({ context: context(2, 2), baseline: initial.baseline });
assert.equal(exhausted.decision, 'cycle_exhausted');

const fileGrowthSnapshot = {
  ...snapshot,
  bundle: { ...snapshot.bundle, scope: { changedPaths: [
    { path: 'src/a.ts', status: 'modified' }, { path: 'src/b.ts', status: 'added' },
    { path: 'src/c.ts', status: 'added' }, { path: 'src/d.ts', status: 'added' },
  ] } },
};
const fileGrowth = await buildReviewGovernorSnapshot({
  input, snapshot: fileGrowthSnapshot, revision: { head, proof }, policy, context: context(1), baseline: initial.baseline,
});
assert.equal(fileGrowth.decision, 'file_growth');
const exhaustedFileGrowth = await buildReviewGovernorSnapshot({
  input, snapshot: fileGrowthSnapshot, revision: { head, proof }, policy, context: context(2), baseline: initial.baseline,
});
assert.equal(exhaustedFileGrowth.decision, 'file_growth', 'scope breaks take precedence over cycle exhaustion');

const locGrowth = await build({ context: context(1, 1, 111), baseline: initial.baseline });
assert.equal(locGrowth.decision, 'non_test_loc_growth');

const ownershipSnapshot = {
  ...snapshot,
  bundle: { ...snapshot.bundle, scope: { changedPaths: [{ path: 'other/a.ts', status: 'added' }] } },
};
const ownership = await buildReviewGovernorSnapshot({
  input, snapshot: ownershipSnapshot, revision: { head, proof }, policy, context: context(1), baseline: initial.baseline,
});
assert.equal(ownership.decision, 'ownership_crossing');
assert.deepEqual(ownership.current.outsideOwnershipPaths, ['other/a.ts']);
const wait = {
  schemaVersion: 'wait-request.v2', waitId: 'wait:1', kind: 'orchestrator', signalType: 'review.resolve',
  authorizedIssuer: { type: 'orchestrator', id: 'review:orchestrator' }, expiresAt: null,
};
const blockedScopeBreak = applyReviewGovernor({
  schemaVersion: 'stage-result.v2', outcome: 'blocked', artifacts: [], reason: { code: 'review.semantic_failed' },
}, ownership, wait);
assert.equal(blockedScopeBreak.outcome, 'orchestrator_required', 'scope authority outranks a semantic blocked result');
const cleanFinalScopeBreak = applyReviewGovernor({
  schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [],
}, exhaustedFileGrowth, wait);
assert.equal(cleanFinalScopeBreak.outcome, 'orchestrator_required', 'a clean final repair cannot pass outside scope');

await assert.rejects(
  () => build({ baseline: { ...initial.baseline, policyDigest: sha256Text('other') } }),
  ReviewGovernorIntegrityError,
);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-governor' }));
await import('./review-evidence-authority.unit.test.mjs');
await import('./review-context-production.unit.test.mjs');
await import('./review-slicing.unit.test.mjs');
await import('./simplification-fact-producer.unit.test.mjs');
