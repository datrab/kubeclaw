import assert from 'node:assert/strict';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { reconcileReviewVerification } from '../src/review-verification-reconciliation.ts';
import { snapshotReviewBundle } from '../src/review-bundle-snapshot.ts';
import { parseEchoReviewOutput } from '../src/echo-review-parser.ts';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';
import { preflightEchoReviewProposals } from '../src/review-proposal-preflight.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';

const evidenceContent = '{}';
const evidence = { kind: 'contract', digest: sha256Text(evidenceContent) };
const changedPaths = [{ path: 'src/index.ts', status: 'modified' }];
const contextContent = 'first\nsecond\n';
const sourceEvidence = { kind: 'reviewed-source', digest: sha256Text(contextContent) };
const snapshot = snapshotReviewBundle({
  schemaVersion: 'review-bundle.v1', task: { id: 'TASK-1', statement: 'Review.' },
  revisions: { base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: sha256Text(canonicalJson(changedPaths)) },
  scope: { changedPaths, allowedPrefixes: ['src'] },
  requirements: [{ id: 'REQ-1', statement: 'The contract holds.' }],
  evidence: [{ ...evidence, content: evidenceContent }],
  context: [{ path: 'src/index.ts', digest: sourceEvidence.digest, content: contextContent, reasons: [{ kind: 'changed' }] }],
  selection: { version: 'focused-context.v1', candidateManifestDigest: `sha256:${'4'.repeat(64)}`, expansionRound: 0 },
  policyDigest: `sha256:${'5'.repeat(64)}`,
});
const policy = resolveReviewPolicy({ builtIn: getReviewPolicyProfile('gate') });
const finding = (claim, lineHint) => ({
  category: 'correctness', priority: 'P0', claim, impact: 'The contract fails.',
  locations: [{ path: 'src/index.ts', lineHint }], evidence: [evidence, sourceEvidence],
  recommendedFix: 'Return the required value.', changeRelation: 'unknown',
  scopeRelation: 'inside', evidenceStrength: 'direct',
});
const echo = parseEchoReviewOutput({
  schemaVersion: 'echo-review-output.v1', summary: 'Two blockers.', inspectedEvidence: [evidence, sourceEvidence],
  requirementAssessments: { 'REQ-1': { assessment: 'violated', explanation: 'Broken.', evidence: [evidence] } },
  proposedFindings: [finding('First defect.', 1), finding('Second defect.', 2)],
});
assert.equal(echo.ok, true);
if (!echo.ok) throw new Error(echo.error);
const preflight = preflightEchoReviewProposals(
  snapshot.bundle, echo.value, policy, new Map([['src/index.ts', [{ start: 1, end: 2 }]]]),
);
const [proposalA, proposalB] = preflight.eligibleProposalIds;
const output = {
  ok: true,
  value: {
    schemaVersion: 'echo-review-verification.v1', bundleDigest: snapshot.digest,
    policyDigest: policy.digest, proposalSetDigest: preflight.proposalSetDigest,
    results: {
      [proposalA]: { verdict: 'confirmed', reason: 'Confirmed by contract evidence.', evidence: [evidence] },
      [proposalB]: { verdict: 'rejected', reason: 'Rejected by contract evidence.', evidence: [evidence] },
    },
  },
};
function assertCleared(value, label) {
  assert.deepEqual(value.results, {}, label);
  assert.deepEqual(value.confirmedProposalIds, [], label);
  assert.deepEqual(value.rejectedProposalIds, [], label);
  assert.deepEqual(value.insufficientProposalIds, [], label);
}
const reconciled = reconcileReviewVerification(snapshot, preflight, policy, output);
assert.deepEqual(reconciled.confirmedProposalIds, [proposalA]);
assert.deepEqual(reconciled.rejectedProposalIds, [proposalB]);
assert.deepEqual(reconciled.insufficientProposalIds, []);
assert.deepEqual(reconciled.integrityIssues, []);
assert.equal(Object.isFrozen(reconciled), true);
assert.equal(Object.isFrozen(reconciled.results), true);
assert.equal(Object.isFrozen(reconciled.results[proposalA]), true);
assert.equal(Object.isFrozen(reconciled.results[proposalA].evidence), true);
assert.equal(Object.isFrozen(reconciled.results[proposalA].evidence[0]), true);
assert.equal(Object.isFrozen(reconciled.confirmedProposalIds), true);
assert.equal(Object.isFrozen(reconciled.rejectedProposalIds), true);

const shallowResults = structuredClone(output.value.results);
Object.freeze(shallowResults);
const shallowFrozen = reconcileReviewVerification(snapshot, preflight, policy, {
  ...output, value: { ...output.value, results: shallowResults },
});
assert.equal(Object.isFrozen(shallowFrozen.results[proposalA]), true);
assert.equal(Object.isFrozen(shallowFrozen.results[proposalA].evidence), true);
assert.equal(Object.isFrozen(shallowFrozen.results[proposalA].evidence[0]), true);

const missing = reconcileReviewVerification(snapshot, preflight, policy, {
  ...output, value: { ...output.value, results: { [proposalA]: output.value.results[proposalA] } },
});
assert.match(missing.integrityIssues.join('\n'), /omitted 1 eligible/u);
assertCleared(missing, 'missing result');

const mismatch = reconcileReviewVerification(snapshot, preflight, policy, {
  ...output, value: { ...output.value, bundleDigest: `sha256:${'0'.repeat(64)}` },
});
assert.match(mismatch.integrityIssues.join('\n'), /bundle digest/u);
assert.deepEqual(mismatch.rejectedProposalIds, [], 'unbound verdicts are not explicit rejections');
assert.deepEqual(mismatch.results, {});
assert.equal(Object.isFrozen(mismatch.results), true);
assert.equal(Object.isFrozen(mismatch.integrityIssues), true);

for (const [label, value, pattern] of [
  ['policy digest', { ...output.value, policyDigest: `sha256:${'2'.repeat(64)}` }, /policy digest/u],
  ['proposal-set digest', { ...output.value, proposalSetDigest: `sha256:${'3'.repeat(64)}` }, /proposal-set digest/u],
  ['unknown proposal', { ...output.value, results: {
    ...output.value.results,
    [`sha256:${'4'.repeat(64)}`]: output.value.results[proposalA],
  } }, /unknown proposal/u],
]) {
  const invalid = reconcileReviewVerification(snapshot, preflight, policy, {
    ...output, value,
  });
  assert.match(invalid.integrityIssues.join('\n'), pattern, label);
  assert.deepEqual(invalid.results, {}, label);
  assert.deepEqual(invalid.confirmedProposalIds, [], label);
  assert.deepEqual(invalid.rejectedProposalIds, [], label);
  assert.deepEqual(invalid.insufficientProposalIds, [], label);
}

const foreignEvidence = reconcileReviewVerification(snapshot, preflight, policy, {
  ...output, value: { ...output.value, results: {
    ...output.value.results,
    [proposalA]: { ...output.value.results[proposalA], evidence: [{ kind: 'test', digest: `sha256:${'1'.repeat(64)}` }] },
  } },
});
assert.match(foreignEvidence.integrityIssues.join('\n'), /outside the frozen bundle/u);
assertCleared(foreignEvidence, 'foreign evidence');

const malformed = reconcileReviewVerification(snapshot, preflight, policy, { ok: false, error: 'bad JSON' });
assert.match(malformed.integrityIssues.join('\n'), /invalid semantic verifier output: bad JSON/u);
assertCleared(malformed, 'verifier failure is not explicit rejection');

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-verification-reconciliation' }));
