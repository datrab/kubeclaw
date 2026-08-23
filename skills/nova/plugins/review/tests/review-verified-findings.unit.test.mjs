import assert from 'node:assert/strict';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { parseEchoReviewOutput } from '../src/echo-review-parser.ts';
import { reviewClusterId } from '../src/review-cluster-identity.ts';
import {
  buildReviewFindingClusters,
  isCertifiedReviewFindingClusters,
} from '../src/review-clustering.ts';
import {
  isCertifiedRankedReviewClusters,
  rankReviewFindingClusters,
  reviewFindingScore,
} from '../src/review-cluster-ranking.ts';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';
import {
  buildReviewFindingGovernance,
  isCertifiedReviewFindingGovernance,
} from '../src/review-finding-governance.ts';
import { buildReviewRepairBatch, isCertifiedReviewRepairBatch } from '../src/review-repair-batch.ts';
import { reduceReviewDecision } from '../src/review-reducer.ts';
import { certifyReviewReductionInput } from '../src/review-reduction-state.ts';
import { preflightEchoReviewProposals } from '../src/review-proposal-preflight.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';
import {
  buildVerifiedReviewFindings,
  isCertifiedVerifiedReviewFindings,
} from '../src/review-verified-findings.ts';
import { reconcileReviewVerification } from '../src/review-verification-reconciliation.ts';
import { snapshotReviewBundle } from '../src/review-bundle-snapshot.ts';

const evidenceContent = '{}';
const evidence = { kind: 'contract', digest: sha256Text(evidenceContent) };
const contextContent = 'old\nnew\n';
const sourceEvidence = { kind: 'reviewed-source', digest: sha256Text(contextContent) };
const changedPaths = [{ path: 'src/index.ts', status: 'modified' }];
const bundle = {
  schemaVersion: 'review-bundle.v1', task: { id: 'TASK-1', statement: 'Review.' },
  revisions: { base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: sha256Text(canonicalJson(changedPaths)) },
  scope: { changedPaths, allowedPrefixes: ['src'] },
  requirements: [{ id: 'REQ-1', statement: 'The contract holds.' }],
  evidence: [{ ...evidence, content: evidenceContent }],
  context: [{ path: 'src/index.ts', digest: sourceEvidence.digest, content: contextContent, reasons: [{ kind: 'changed' }] }],
  selection: { version: 'focused-context.v1', candidateManifestDigest: `sha256:${'d'.repeat(64)}`, expansionRound: 0 },
  policyDigest: `sha256:${'e'.repeat(64)}`,
};
const gatePolicy = getReviewPolicyProfile('gate');
const policy = resolveReviewPolicy({ builtIn: {
  ...gatePolicy,
  limits: { ...gatePolicy.limits, maxRootCauses: 1, maxInstancesPerCluster: 1 },
} });
const snapshot = snapshotReviewBundle(bundle);

function certifiedValues(
  lineHint, locations, sourceSnapshot = snapshot, claim = 'The returned value violates the contract.',
) {
  const finding = {
    category: 'correctness', priority: 'P0', claim,
    impact: 'Callers receive invalid data.',
    locations: locations ?? [{ path: 'src/index.ts', symbol: 'value', lineHint }],
    evidence: [evidence, sourceEvidence], recommendedFix: 'Return the required value.',
    changeRelation: 'pre_existing', scopeRelation: 'outside', evidenceStrength: 'direct',
    rootCauseHint: 'invalid-return-value',
  };
  const parsed = parseEchoReviewOutput({
    schemaVersion: 'echo-review-output.v1', summary: 'One blocker.', inspectedEvidence: [evidence, sourceEvidence],
    requirementAssessments: { 'REQ-1': { assessment: 'violated', explanation: 'Broken.', evidence: [evidence] } },
    proposedFindings: [finding],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error(parsed.error);
  const preflight = preflightEchoReviewProposals(
    sourceSnapshot.bundle, parsed.value, policy, new Map([['src/index.ts', [{ start: 1, end: 2 }]]]),
  );
  const proposalId = preflight.eligibleProposalIds[0];
  const reconciliation = reconcileReviewVerification(sourceSnapshot, preflight, policy, {
    ok: true,
    value: {
      schemaVersion: 'echo-review-verification.v1', bundleDigest: sourceSnapshot.digest,
      policyDigest: policy.digest, proposalSetDigest: preflight.proposalSetDigest,
      results: { [proposalId]: { verdict: 'confirmed', reason: 'Confirmed.', evidence: [evidence] } },
    },
  });
  return { preflight, reconciliation };
}

const firstValues = certifiedValues(2);
const first = buildVerifiedReviewFindings(snapshot, firstValues.preflight, firstValues.reconciliation, policy);
const movedValues = certifiedValues(1);
const moved = buildVerifiedReviewFindings(snapshot, movedValues.preflight, movedValues.reconciliation, policy);
assert.equal(first.length, 1);
assert.equal(first[0].fingerprint, moved[0].fingerprint, 'line hints do not define identity');
assert.equal(
  reviewClusterId(bundle.revisions.base, first[0]),
  reviewClusterId(bundle.revisions.base, moved[0]),
  'equivalent certified causes share one stable cluster ID',
);

const firstProposal = firstValues.preflight.proposals[firstValues.preflight.eligibleProposalIds[0]].finding;
const groupedParsed = parseEchoReviewOutput({
  schemaVersion: 'echo-review-output.v1', summary: 'Repeated blockers.', inspectedEvidence: [evidence, sourceEvidence],
  requirementAssessments: { 'REQ-1': { assessment: 'violated', explanation: 'Broken.', evidence: [evidence] } },
  proposedFindings: [firstProposal, {
    ...firstProposal, claim: 'The same cause breaks another behavior.', impact: 'Another caller fails.',
  }],
});
assert.equal(groupedParsed.ok, true);
if (!groupedParsed.ok) throw new Error(groupedParsed.error);
const groupedPreflight = preflightEchoReviewProposals(
  snapshot.bundle, groupedParsed.value, policy, new Map([['src/index.ts', [{ start: 1, end: 2 }]]]),
);
const groupedReconciliation = reconcileReviewVerification(snapshot, groupedPreflight, policy, {
  ok: true,
  value: {
    schemaVersion: 'echo-review-verification.v1', bundleDigest: snapshot.digest,
    policyDigest: policy.digest, proposalSetDigest: groupedPreflight.proposalSetDigest,
    results: Object.fromEntries(groupedPreflight.eligibleProposalIds.map((proposalId) => [
      proposalId, { verdict: 'confirmed', reason: 'Confirmed.', evidence: [evidence] },
    ])),
  },
});
const groupedFindings = buildVerifiedReviewFindings(
  snapshot, groupedPreflight, groupedReconciliation, policy,
);
const clusters = buildReviewFindingClusters(
  snapshot, groupedPreflight, groupedReconciliation, groupedFindings, policy,
);
assert.equal(groupedFindings.length, 2);
assert.equal(clusters.length, 1);
assert.equal(clusters[0].findings.length, 2);
assert.equal(isCertifiedReviewFindingClusters(clusters, snapshot, groupedFindings, policy), true);
assert.equal(isCertifiedReviewFindingClusters([...clusters], snapshot, groupedFindings, policy), false);

const reversedParsed = parseEchoReviewOutput({
  ...groupedParsed.value,
  proposedFindings: [...groupedParsed.value.proposedFindings].reverse(),
});
assert.equal(reversedParsed.ok, true);
if (!reversedParsed.ok) throw new Error(reversedParsed.error);
const reversedPreflight = preflightEchoReviewProposals(
  snapshot.bundle, reversedParsed.value, policy, new Map([['src/index.ts', [{ start: 1, end: 2 }]]]),
);
const reversedReconciliation = reconcileReviewVerification(snapshot, reversedPreflight, policy, {
  ok: true,
  value: {
    schemaVersion: 'echo-review-verification.v1', bundleDigest: snapshot.digest,
    policyDigest: policy.digest, proposalSetDigest: reversedPreflight.proposalSetDigest,
    results: Object.fromEntries(reversedPreflight.eligibleProposalIds.map((proposalId) => [
      proposalId, { verdict: 'confirmed', reason: 'Confirmed.', evidence: [evidence] },
    ])),
  },
});
const reversedFindings = buildVerifiedReviewFindings(
  snapshot, reversedPreflight, reversedReconciliation, policy,
);
const reversedClusters = buildReviewFindingClusters(
  snapshot, reversedPreflight, reversedReconciliation, reversedFindings, policy,
);
const reversedRanking = rankReviewFindingClusters(
  reversedClusters, snapshot, reversedFindings, policy,
);
assert.deepEqual(
  reversedClusters.map(({ clusterId, findings }) => ({
    clusterId, fingerprints: findings.map(({ fingerprint }) => fingerprint),
  })),
  clusters.map(({ clusterId, findings }) => ({
    clusterId, fingerprints: findings.map(({ fingerprint }) => fingerprint),
  })),
  'cluster membership is independent of proposal order',
);
const rankedClusters = rankReviewFindingClusters(clusters, snapshot, groupedFindings, policy);
assert.deepEqual(
  reversedRanking.map(({ clusterId, score, representative }) => ({
    clusterId, score, representative: representative.fingerprint,
  })),
  rankedClusters.map(({ clusterId, score, representative }) => ({
    clusterId, score, representative: representative.fingerprint,
  })),
  'ranking and representative selection are independent of proposal order',
);
assert.equal(rankedClusters.length, 1);
assert.equal(rankedClusters[0].score, reviewFindingScore(rankedClusters[0].representative, policy));
assert.equal(
  rankedClusters[0].representative.fingerprint,
  [...groupedFindings].sort((left, right) => left.fingerprint.localeCompare(right.fingerprint))[0].fingerprint,
  'equal scores use the stable fingerprint tie-break',
);
assert.equal(isCertifiedRankedReviewClusters(rankedClusters, clusters, policy), true);
assert.equal(isCertifiedRankedReviewClusters([...rankedClusters], clusters, policy), false);
const repairBatch = buildReviewRepairBatch(
  rankedClusters, clusters, policy, groupedFindings,
);
assert.equal(repairBatch.totalRootCauseCount, 1);
assert.equal(repairBatch.totalFindingCount, 2);
assert.equal(repairBatch.clusters.length, 1);
assert.equal(repairBatch.clusters[0].findingFingerprints.length, 1);
assert.equal(repairBatch.clusters[0].omittedInstanceCount, 1);
assert.equal(repairBatch.omittedFindingCount, 1);
assert.equal(isCertifiedReviewRepairBatch(repairBatch, rankedClusters, policy, groupedFindings), true);
assert.equal(isCertifiedReviewRepairBatch({ ...repairBatch }, rankedClusters, policy, groupedFindings), false);
assert.equal(isCertifiedReviewRepairBatch(repairBatch, rankedClusters, policy, [...groupedFindings]), false);

const governance = buildReviewFindingGovernance(
  snapshot, groupedPreflight, groupedReconciliation, groupedFindings, policy,
);
assert.equal(isCertifiedReviewFindingGovernance(governance, groupedFindings, policy), true);
assert.equal(isCertifiedReviewFindingGovernance({ ...governance }, groupedFindings, policy), false);
const governedInput = certifyReviewReductionInput({
  resolvedPolicy: policy,
  integrityIssues: [], unverifiedRequirements: [], limitViolations: [],
  findings: groupedFindings, governance,
});
const governedResult = reduceReviewDecision(governedInput);
assert.equal(governedResult.outcome, 'request_fix');
assert.equal(governedResult.reason.code, 'kubeclaw.review.verified_blockers');
assert.equal(governedResult.reason.details.repairBatch.totalRootCauseCount, 1);
assert.equal(governedResult.reason.details.repairBatch.totalFindingCount, 2);
assert.equal(governedResult.reason.details.repairBatch.rootCauses.length, 1);
assert.equal(governedResult.reason.details.repairBatch.rootCauses[0].instances.length, 1);
assert.equal(governedResult.reason.details.repairBatch.omittedFindingCount, 1);
assert.equal(governedResult.reason.details.findings, undefined);
assert.equal(governedResult.reason.details.evaluation['review.root_cause_count'], 1);
assert.equal(governedResult.reason.details.evaluation['review.shared_root_cause_count'], 1);
assert.equal(governedResult.reason.details.evaluation['review.ranked_finding_count'], 2);

const repeatedValues = certifiedValues(2, [
  { path: 'src/index.ts', symbol: 'value', lineHint: 1 },
  { path: 'src/index.ts', symbol: 'value', lineHint: 2 },
]);
assert.equal(
  first[0].fingerprint,
  buildVerifiedReviewFindings(snapshot, repeatedValues.preflight, repeatedValues.reconciliation, policy)[0].fingerprint,
  'duplicate normalized locations do not define identity',
);
assert.equal(first[0].changeRelation, 'introduced');
assert.equal(first[0].scopeRelation, 'inside');
assert.equal(first[0].repairable, true);
assert.equal(first[0].verified, true);
assert.equal(Object.isFrozen(first), true);
assert.equal(Object.isFrozen(first[0]), true);
assert.equal(isCertifiedVerifiedReviewFindings(
  first, snapshot, firstValues.preflight, firstValues.reconciliation, policy,
), true);
assert.equal(isCertifiedVerifiedReviewFindings(
  [{ ...first[0] }], snapshot, firstValues.preflight, firstValues.reconciliation, policy,
), false);
assert.equal(isCertifiedVerifiedReviewFindings(
  first, snapshot, movedValues.preflight, movedValues.reconciliation, policy,
), false);

const changedSnapshot = snapshotReviewBundle({
  ...bundle, revisions: { ...bundle.revisions, base: '2'.repeat(40) },
});
const changedValues = certifiedValues(2, undefined, changedSnapshot);
const changedBase = buildVerifiedReviewFindings(
  changedSnapshot, changedValues.preflight, changedValues.reconciliation, policy,
);
assert.notEqual(first[0].fingerprint, changedBase[0].fingerprint);
const alternateValues = certifiedValues(2, undefined, snapshot, 'A different defect violates the contract.');
const alternate = buildVerifiedReviewFindings(
  snapshot, alternateValues.preflight, alternateValues.reconciliation, policy,
);
assert.notEqual(
  reviewClusterId(bundle.revisions.base, {
    ...alternate[0], rootCause: first[0].rootCause,
  }),
  reviewClusterId(bundle.revisions.base, first[0]),
  'a root cause transplanted to another finding uses singleton fallback',
);
assert.throws(() => buildVerifiedReviewFindings(
  snapshot,
  { ...firstValues.preflight },
  firstValues.reconciliation,
  policy,
), /certified proposal preflight/u);
assert.throws(() => buildVerifiedReviewFindings(
  snapshot,
  firstValues.preflight,
  { ...firstValues.reconciliation },
  policy,
), /certified verifier reconciliation/u);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-verified-findings' }));
