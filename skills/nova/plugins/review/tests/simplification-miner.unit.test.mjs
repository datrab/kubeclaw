import assert from 'node:assert/strict';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { mineSimplificationCandidates } from '../src/simplification-miner.ts';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';

const revision = { base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: `sha256:${'3'.repeat(64)}` };
const factValue = {
  schemaVersion: 'simplification-facts.v1', revision,
  facts: [
    {
      factId: 'unused.helper', ruleId: 'SIM001', confidence: 'high', path: 'src/helper.ts',
      symbol: 'helper', basis: 'No references were found.', smallestReplacement: 'Delete helper.',
      estimatedNetLocReduction: 8,
    },
    {
      factId: 'medium.wrapper', ruleId: 'SIM002', confidence: 'medium', path: 'src/wrapper.ts',
      basis: 'The wrapper only forwards arguments.', smallestReplacement: 'Call the target directly.',
    },
    {
      factId: 'outside.helper', ruleId: 'SIM001', confidence: 'high', path: 'other/helper.ts',
      basis: 'No references were found.', smallestReplacement: 'Delete helper.',
    },
  ],
};
const content = canonicalJson(factValue);
const evidence = { kind: 'simplification-facts', digest: sha256Text(content), content };
const lean = resolveReviewPolicy({ builtIn: getReviewPolicyProfile('lean') });
const result = mineSimplificationCandidates({
  revision, evidence: [evidence], reviewedPaths: ['src/helper.ts', 'src/wrapper.ts'], policy: lean,
});
assert.equal(result.candidates.length, 1, 'high-confidence policy excludes medium facts');
assert.equal(result.candidates[0].ruleId, 'SIM001');
assert.equal(result.candidates[0].category, 'delete');
assert.match(result.candidates[0].candidateId, /^sha256:[0-9a-f]{64}$/u);
assert.equal(result.diagnostics[0].code, 'scope_mismatch');

const repeated = mineSimplificationCandidates({
  revision, evidence: [evidence, { ...evidence, kind: 'other' }],
  reviewedPaths: ['src/helper.ts', 'src/wrapper.ts'], policy: lean,
});
assert.deepEqual(repeated, result);
const duplicateValue = {
  ...factValue,
  facts: [{ ...factValue.facts[0], factId: 'duplicate.unused.helper' }],
};
const duplicateContent = canonicalJson(duplicateValue);
const duplicateEvidence = {
  kind: 'simplification-facts', digest: sha256Text(duplicateContent), content: duplicateContent,
};
const firstOrder = mineSimplificationCandidates({
  revision, evidence: [evidence, duplicateEvidence], reviewedPaths: ['src/helper.ts'], policy: lean,
});
const reverseOrder = mineSimplificationCandidates({
  revision, evidence: [duplicateEvidence, evidence], reviewedPaths: ['src/helper.ts'], policy: lean,
});
assert.deepEqual(firstOrder, reverseOrder, 'duplicate source selection is order-independent');
assert.equal(mineSimplificationCandidates({
  revision, evidence: [evidence], reviewedPaths: ['src/helper.ts'],
  policy: resolveReviewPolicy({ builtIn: getReviewPolicyProfile('gate') }),
}).candidates.length, 0, 'disabled policy does not mine');

const staleContent = canonicalJson({ ...factValue, revision: { ...revision, head: '4'.repeat(40) } });
const stale = mineSimplificationCandidates({
  revision, evidence: [{ kind: 'simplification-facts', digest: sha256Text(staleContent), content: staleContent }],
  reviewedPaths: ['src/helper.ts'], policy: lean,
});
assert.equal(stale.candidates.length, 0);
assert.equal(stale.diagnostics[0].code, 'revision_mismatch');
const malformed = mineSimplificationCandidates({
  revision, evidence: [{ kind: 'simplification-facts', digest: `sha256:${'5'.repeat(64)}`, content: '{}' }],
  reviewedPaths: ['src/helper.ts'], policy: lean,
});
assert.equal(malformed.candidates.length, 0);
assert.equal(malformed.diagnostics[0].code, 'malformed_source');

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'simplification-miner' }));
