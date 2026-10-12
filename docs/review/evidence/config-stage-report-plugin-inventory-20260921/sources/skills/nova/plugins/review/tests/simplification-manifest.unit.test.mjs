import assert from 'node:assert/strict';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { buildSimplificationCandidateManifest, isCertifiedSimplificationManifest } from '../src/simplification-manifest.ts';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';

const revision = { base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: `sha256:${'3'.repeat(64)}` };
const facts = {
  schemaVersion: 'simplification-facts.v1', revision,
  facts: [{
    factId: 'unused.helper', ruleId: 'SIM001', confidence: 'high', path: 'src/helper.ts',
    basis: 'No references were found.', smallestReplacement: 'Delete helper.',
  }],
};
const content = canonicalJson(facts);
const policy = resolveReviewPolicy({ builtIn: getReviewPolicyProfile('lean') });
const built = buildSimplificationCandidateManifest({
  revision, evidence: [{ kind: 'simplification-facts', digest: sha256Text(content), content }],
  reviewedPaths: ['src/helper.ts'], policy,
});
assert.ok(built);
assert.equal(built.manifest.candidates.length, 1);
assert.equal(Object.isFrozen(built.manifest), true);
assert.equal(Object.isFrozen(built.manifest.revision), true);
assert.equal(Object.isFrozen(built.manifest.candidates), true);
assert.equal(Object.isFrozen(built.manifest.candidates[0].source), true);
assert.equal(Object.isFrozen(built.manifest.diagnostics), true);
assert.equal(built.evidence.digest, sha256Text(built.evidence.content));
assert.equal(isCertifiedSimplificationManifest(built.manifest, revision, policy), true);
assert.equal(isCertifiedSimplificationManifest({ ...built.manifest }, revision, policy), false);
assert.equal(isCertifiedSimplificationManifest(built.manifest, { ...revision }, policy), false);
assert.equal(buildSimplificationCandidateManifest({
  revision, evidence: [], reviewedPaths: [],
  policy: resolveReviewPolicy({ builtIn: getReviewPolicyProfile('gate') }),
}), undefined);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'simplification-manifest' }));
