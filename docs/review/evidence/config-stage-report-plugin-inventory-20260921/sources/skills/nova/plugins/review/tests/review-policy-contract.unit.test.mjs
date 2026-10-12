import assert from 'node:assert/strict';

import {
  SIMPLIFICATION_RULE_IDS,
  SIMPLIFICATION_REGISTRY_VERSION,
  REVIEW_POLICY_SCHEMA_VERSION,
  reviewPolicySchema,
} from '../src/review-policy-contract.ts';

assert.equal(REVIEW_POLICY_SCHEMA_VERSION, 'review-policy.v2');
assert.equal(reviewPolicySchema.additionalProperties, false);
assert.deepEqual(reviewPolicySchema.required, [
  'schemaVersion',
  'profile',
  'blocking',
  'limits',
  'scope',
  'verification',
  'simplification',
  'ranking',
  'followUp',
  'governor',
]);
for (const section of [
  'blocking', 'limits', 'scope', 'verification', 'simplification', 'ranking', 'followUp', 'governor',
]) {
  assert.equal(reviewPolicySchema.properties[section].additionalProperties, false, section);
}
assert.equal(reviewPolicySchema.properties.limits.properties.maxProposals.maximum, 128);
assert.equal(reviewPolicySchema.properties.limits.properties.maxBundleBytes.maximum, 16 * 1024 * 1024);
assert.deepEqual(reviewPolicySchema.properties.simplification.properties.enabledRules.items.enum, SIMPLIFICATION_RULE_IDS);
assert.equal(reviewPolicySchema.properties.simplification.properties.registryVersion.const, SIMPLIFICATION_REGISTRY_VERSION);
assert.equal(reviewPolicySchema.allOf.length, 2);
assert.deepEqual(
  reviewPolicySchema.properties.blocking.properties.priorities.items.enum,
  ['P0', 'P1', 'P2', 'P3'],
);
assert.deepEqual(
  reviewPolicySchema.properties.blocking.properties.categories.items.enum,
  ['correctness', 'security', 'contract', 'architecture', 'simplification'],
);
for (const forbidden of ['maxAttempts', 'maxRemediationCycles', 'retry', 'wait', 'cancel', 'lifecycle']) {
  assert.equal(JSON.stringify(reviewPolicySchema).includes(forbidden), false, forbidden);
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-policy-contract' }));
