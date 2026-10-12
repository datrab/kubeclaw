import assert from 'node:assert/strict';

import {
  buildReviewEvaluationFacts,
  REVIEW_DECISION_MODEL_VERSION,
} from '../src/review-evaluation-metadata.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';
import { reduceReviewDecision } from '../src/review-reducer.ts';
import { certifyReviewReductionInput } from '../src/review-reduction-state.ts';
import { makeReviewPolicy } from './fixtures/review-policy.mjs';

const resolvedPolicy = resolveReviewPolicy({ builtIn: makeReviewPolicy('gate') });
const counts = {
  findingCount: 7,
  followUpCount: 3,
  integrityIssueCount: 1,
  unverifiedRequirementCount: 2,
  limitViolationCount: 4,
};
const verification = {
  protocol: 'kubeclaw.echo-review-verification.v1', mode: 'p0-only', attemptId: 'attempt:1',
  eligibleCount: 3, confirmedCount: 1, rejectedCount: 1, insufficientCount: 1,
};
const simplification = {
  registryVersion: 'simplification-rules.v1', enabledRuleCount: 1, minimumConfidence: 'high',
  candidateCount: 0, diagnosticCount: 0,
};
const facts = buildReviewEvaluationFacts(resolvedPolicy, counts, verification, simplification);
assert.equal(facts['review.decision_model'], REVIEW_DECISION_MODEL_VERSION);
assert.equal(facts['review.output_schema'], 'echo-review-output.v1');
assert.equal(facts['review.policy_schema'], 'review-policy.v2');
assert.equal(facts['review.policy_digest'], resolvedPolicy.digest);
assert.equal(facts['review.policy_profile'], 'gate');
assert.equal(facts['review.policy_source'], 'built_in');
assert.equal(facts['review.finding_count'], 7);
assert.equal(facts['review.follow_up_count'], 3);
assert.equal(facts['review.verifier_protocol'], verification.protocol);
assert.equal(facts['review.verifier_mode'], 'p0-only');
assert.equal(facts['review.verifier_attempt'], 'attempt:1');
assert.equal(facts['review.verifier_confirmed_count'], 1);
assert.equal(facts['review.simplification_enabled'], true);
assert.equal(facts['review.simplification_candidate_count'], 0);
assert.equal(Object.keys(facts).some((key) => /latency|token|cost/u.test(key)), false);

const governedFacts = buildReviewEvaluationFacts(resolvedPolicy, counts, verification, simplification, {
  rootCauseCount: 4, sharedRootCauseCount: 2, rankedFindingCount: 7,
});
assert.equal(governedFacts['review.root_cause_count'], 4);
assert.equal(governedFacts['review.shared_root_cause_count'], 2);
assert.equal(governedFacts['review.ranked_finding_count'], 7);

const clean = certifyReviewReductionInput({
  resolvedPolicy,
  integrityIssues: [], unverifiedRequirements: [], limitViolations: [], findings: [],
});
const passed = reduceReviewDecision(clean);
assert.equal(passed.outcome, 'passed');
assert.equal(passed.facts['review.policy_digest'], resolvedPolicy.digest);
const blocked = reduceReviewDecision(certifyReviewReductionInput({
  resolvedPolicy,
  integrityIssues: ['invalid output'], unverifiedRequirements: [],
  limitViolations: [], findings: [],
}));
assert.equal(blocked.outcome, 'blocked');
assert.equal(blocked.reason.details.evaluation['review.integrity_issue_count'], 1);
assert.equal(blocked.reason.details.evaluation['review.policy_digest'], resolvedPolicy.digest);
assert.equal(blocked.reason.details.policyDigest, resolvedPolicy.digest);
const limited = reduceReviewDecision(certifyReviewReductionInput({
  resolvedPolicy,
  integrityIssues: [], unverifiedRequirements: [], limitViolations: ['limit'],
  findings: [{
    fingerprint: `sha256:${'f'.repeat(64)}`,
    category: 'architecture', priority: 'P2', message: 'Follow-up.',
    recommendedFix: 'Consider a later repair.', changeRelation: 'introduced',
    scopeRelation: 'inside', evidenceStrength: 'direct', repairable: true, verified: true,
  }],
  orchestratorWait: {
    schemaVersion: 'wait-request.v2', waitId: 'review-eval-wait', kind: 'orchestrator',
    signalType: 'kubeclaw.review.resolve',
    authorizedIssuer: { type: 'orchestrator', id: 'orchestrator:kubeclaw.review' }, expiresAt: null,
  },
}));
assert.equal(limited.outcome, 'orchestrator_required');
assert.equal(limited.reason.details.evaluation['review.follow_up_count'], 1);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-evaluation-metadata' }));
