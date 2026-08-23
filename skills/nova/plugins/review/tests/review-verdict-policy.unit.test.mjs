import assert from 'node:assert/strict';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { parseEchoReviewOutput } from '../src/echo-review-parser.ts';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';
import { preflightEchoReviewProposals } from '../src/review-proposal-preflight.ts';
import { snapshotReviewBundle } from '../src/review-bundle-snapshot.ts';
import { reconcileReviewVerification } from '../src/review-verification-reconciliation.ts';
import { isCertifiedReviewVerdictPolicyMapping, mapReviewVerificationVerdicts } from '../src/review-verdict-policy.ts';

const evidenceContent = '{}';
const evidence = { kind: 'contract', digest: sha256Text(evidenceContent) };
const changedPaths = [{ path: 'src/index.ts', status: 'modified' }];
const contextContent = 'old\nnew\n';
const sourceEvidence = { kind: 'reviewed-source', digest: sha256Text(contextContent) };
const snapshot = snapshotReviewBundle({
  schemaVersion: 'review-bundle.v1', task: { id: 'TASK-1', statement: 'Review.' },
  revisions: { base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: sha256Text(canonicalJson(changedPaths)) },
  scope: { changedPaths, allowedPrefixes: ['src'] }, requirements: [{ id: 'REQ-1', statement: 'Works.' }],
  evidence: [{ ...evidence, content: evidenceContent }],
  context: [{ path: 'src/index.ts', digest: sourceEvidence.digest, content: contextContent, reasons: [{ kind: 'changed' }] }],
  selection: { version: 'focused-context.v1', candidateManifestDigest: `sha256:${'4'.repeat(64)}`, expansionRound: 0 },
  policyDigest: `sha256:${'5'.repeat(64)}`,
});
const echo = parseEchoReviewOutput({
  schemaVersion: 'echo-review-output.v1', summary: 'One blocker.', inspectedEvidence: [evidence, sourceEvidence],
  requirementAssessments: { 'REQ-1': { assessment: 'violated', explanation: 'Broken.', evidence: [evidence] } },
  proposedFindings: [{
    category: 'correctness', priority: 'P0', claim: 'The result is wrong.', impact: 'It fails.',
    locations: [{ path: 'src/index.ts', lineHint: 2 }], evidence: [evidence, sourceEvidence],
    recommendedFix: 'Return the right result.', changeRelation: 'unknown', scopeRelation: 'inside', evidenceStrength: 'direct',
  }],
});
assert.equal(echo.ok, true);
if (!echo.ok) throw new Error(echo.error);

function values(action) {
  const base = getReviewPolicyProfile('gate');
  const policy = resolveReviewPolicy({ builtIn: {
    ...base, verification: { ...base.verification, insufficientFindingEvidence: action },
  } });
  const preflight = preflightEchoReviewProposals(
    snapshot.bundle, echo.value, policy, new Map([['src/index.ts', [{ start: 2, end: 2 }]]]),
  );
  const proposalId = preflight.eligibleProposalIds[0];
  const reconciliation = reconcileReviewVerification(snapshot, preflight, policy, {
    ok: true, value: {
      schemaVersion: 'echo-review-verification.v1', bundleDigest: snapshot.digest,
      policyDigest: policy.digest, proposalSetDigest: preflight.proposalSetDigest,
      results: { [proposalId]: { verdict: 'insufficient_evidence', reason: 'Not enough proof.', evidence: [evidence] } },
    },
  });
  return { policy, preflight, reconciliation, proposalId };
}

for (const [action, field] of [
  ['reject', 'ignoredInsufficientProposalIds'],
  ['follow_up', 'followUpProposalIds'],
  ['orchestrator_required', 'orchestratorProposalIds'],
]) {
  const value = values(action);
  const mapping = mapReviewVerificationVerdicts(snapshot, value.preflight, value.reconciliation, value.policy);
  assert.deepEqual(mapping[field], [value.proposalId], action);
  assert.equal(isCertifiedReviewVerdictPolicyMapping(mapping, value.reconciliation, value.policy), true);
  assert.equal(isCertifiedReviewVerdictPolicyMapping({ ...mapping }, value.reconciliation, value.policy), false);
  assert.equal(Object.isFrozen(mapping), true);
  assert.equal(Object.isFrozen(mapping[field]), true);
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-verdict-policy' }));
