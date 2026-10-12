import assert from 'node:assert/strict';

import { echoReviewOutputSchema } from '../src/echo-review-contract.ts';
import { REVIEW_HARD_LIMITS } from '../src/review-hard-limits.ts';
import {
  REQUIRED_BLOCKING_CATEGORIES,
  REQUIRED_BLOCKING_PRIORITIES,
  REVIEW_TRUST_INVARIANTS,
} from '../src/review-invariants.ts';
import { reviewPolicySchema } from '../src/review-policy-contract.ts';

assert.deepEqual(REQUIRED_BLOCKING_PRIORITIES, ['P0']);
assert.deepEqual(REQUIRED_BLOCKING_CATEGORIES, ['correctness', 'security', 'contract']);
assert.deepEqual(Object.keys(REVIEW_TRUST_INVARIANTS), [
  'RI-001', 'RI-002', 'RI-003', 'RI-004', 'RI-005',
  'RI-006', 'RI-007', 'RI-008', 'RI-009', 'RI-010',
]);
assert.equal(Object.isFrozen(REVIEW_TRUST_INVARIANTS), true);
assert.equal(Object.isFrozen(REVIEW_HARD_LIMITS), true);
assert.equal(
  REVIEW_HARD_LIMITS.contextCandidateReasonsPerFile + 1,
  REVIEW_HARD_LIMITS.contextReasonsPerFile,
);

const output = echoReviewOutputSchema.properties;
const policy = reviewPolicySchema.properties;
assert.equal(output.summary.maxLength, REVIEW_HARD_LIMITS.summaryCharacters);
assert.equal(output.inspectedEvidence.maxItems, REVIEW_HARD_LIMITS.inspectedEvidence);
assert.equal(output.requirementAssessments.maxProperties, REVIEW_HARD_LIMITS.requirementAssessments);
assert.equal(output.proposedFindings.maxItems, REVIEW_HARD_LIMITS.proposedFindings);
assert.equal(policy.limits.properties.maxProposals.maximum, REVIEW_HARD_LIMITS.proposedFindings);
assert.equal(policy.limits.properties.maxBundleBytes.maximum, REVIEW_HARD_LIMITS.bundleBytes);
assert.equal(policy.limits.properties.maxRootCauses.maximum, REVIEW_HARD_LIMITS.rootCauses);

assert.deepEqual(
  policy.blocking.properties.priorities.allOf,
  REQUIRED_BLOCKING_PRIORITIES.map((priority) => ({ contains: { const: priority } })),
);
assert.deepEqual(
  policy.blocking.properties.categories.allOf,
  REQUIRED_BLOCKING_CATEGORIES.map((category) => ({ contains: { const: category } })),
);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-invariants' }));
