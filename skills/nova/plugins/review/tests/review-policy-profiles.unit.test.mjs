import assert from 'node:assert/strict';

import { parseReviewPolicy } from '../src/review-policy-parser.ts';
import {
  getReviewPolicyProfile,
  REVIEW_POLICY_PROFILE_IDS,
  REVIEW_POLICY_PROFILES,
} from '../src/review-policy-profiles.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';

assert.deepEqual(REVIEW_POLICY_PROFILE_IDS, ['gate', 'lean', 'audit']);
const digests = new Set();
for (const id of REVIEW_POLICY_PROFILE_IDS) {
  const policy = getReviewPolicyProfile(id);
  assert.equal(policy.profile, id);
  assert.equal(parseReviewPolicy(policy).ok, true);
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.blocking), true);
  assert.equal(policy.governor.maxRepairCycles, 2);
  assert.equal(policy.governor.fileGrowthMultiplier, 2);
  assert.equal(policy.governor.nonTestLocGrowthMultiplier, 2);
  assert.equal(policy.blocking.priorities.includes('P0'), true);
  for (const category of ['correctness', 'security', 'contract']) {
    assert.equal(policy.blocking.categories.includes(category), true, `${id}:${category}`);
  }
  digests.add(resolveReviewPolicy({ builtIn: policy }).digest);
}
assert.equal(digests.size, REVIEW_POLICY_PROFILE_IDS.length);
assert.equal(REVIEW_POLICY_PROFILES.gate.simplification.enabled, false);
assert.equal(REVIEW_POLICY_PROFILES.gate.limits.maxAdvisories, 0);
assert.equal(REVIEW_POLICY_PROFILES.gate.limits.maxContextFiles, 48);
assert.equal(REVIEW_POLICY_PROFILES.gate.limits.maxInitialContextFiles, 40);
assert.equal(REVIEW_POLICY_PROFILES.gate.limits.maxDependencyDepth, 2);
assert.equal(REVIEW_POLICY_PROFILES.lean.simplification.maxRecommendations, 3);
assert.equal(REVIEW_POLICY_PROFILES.lean.limits.maxAdvisories, 3);
assert.equal(REVIEW_POLICY_PROFILES.audit.scope.retainPreExisting, true);
assert.equal(REVIEW_POLICY_PROFILES.audit.blocking.requireIntroducedByDiff, true);
assert.equal(REVIEW_POLICY_PROFILES.audit.blocking.requireDirectEvidence, true);
assert.equal(REVIEW_POLICY_PROFILES.audit.limits.maxProposals, 128);
assert.equal(REVIEW_POLICY_PROFILES.audit.limits.maxContextFiles, 256);
assert.equal(REVIEW_POLICY_PROFILES.audit.limits.maxExpansionFiles, 16);
assert.equal(REVIEW_POLICY_PROFILES.audit.limits.maxDependencyDepth, 8);
assert.equal(REVIEW_POLICY_PROFILES.audit.followUp.maxItems, 1000);
assert.throws(() => getReviewPolicyProfile('fast'), /unknown review policy profile/u);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-policy-profiles' }));
