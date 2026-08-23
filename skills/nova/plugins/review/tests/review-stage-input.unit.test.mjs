import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { canonicalJson } from '@kubeclaw/plugin-sdk';
import { parseReviewInput, preflightReviewInput } from '../src/review-stage-input.ts';

const content = { result: 'passed', checks: [1, 2, 3] };
const digest = `sha256:${createHash('sha256').update(canonicalJson(content)).digest('hex')}`;
const valid = {
  task: { id: 'TASK-1', statement: 'Review the implementation.' },
  revisions: { base: '1'.repeat(40) },
  scope: { allowedPrefixes: ['src'] },
  requirements: [{ id: 'REQ-1', statement: 'The checks pass.' }],
  evidence: [{ kind: 'test', digest, content }],
  contextCandidates: [{
    path: 'src/support.ts', reasons: [{ kind: 'test', sourcePath: 'src/index.ts' }], dependencyDepth: 1,
  }],
};
const parsed = parseReviewInput(valid);
assert.equal(parsed.ok, true);
assert.equal(Object.isFrozen(parsed.value), true);
assert.equal(parsed.value.evidence[0].content, canonicalJson(content));
assert.deepEqual(parsed.value.scope.ownershipPrefixes, ['src']);
const explicitOwnership = parseReviewInput({ ...valid, scope: { allowedPrefixes: ['src'], ownershipPrefixes: ['src/plugin'] } });
assert.equal(explicitOwnership.ok, true);
assert.deepEqual(explicitOwnership.value.scope.ownershipPrefixes, ['src/plugin']);
const encoded = canonicalJson(valid);
assert.equal(preflightReviewInput(valid, Buffer.byteLength(encoded)), 'within_limit');
assert.equal(preflightReviewInput(valid, Buffer.byteLength(encoded) - 1), 'size_exceeded');
assert.equal(preflightReviewInput({ value: [undefined] }, 1_000_000), 'invalid_json');

for (const [name, value, expected] of [
  ['unknown field', { ...valid, extra: true }, /fields are invalid/u],
  ['missing requirement', { ...valid, requirements: [] }, /1-256/u],
  ['duplicate requirement', { ...valid, requirements: [valid.requirements[0], valid.requirements[0]] }, /duplicates/u],
  ['bad revision', { ...valid, revisions: { base: 'HEAD' } }, /revisions.base is invalid/u],
  ['bad scope', { ...valid, scope: { allowedPrefixes: ['../src'] } }, /allowedPrefixes\[0\] is invalid/u],
  ['ownership outside scope', { ...valid, scope: { allowedPrefixes: ['src'], ownershipPrefixes: ['other'] } }, /within allowed scope/u],
  ['digest mismatch', { ...valid, evidence: [{ ...valid.evidence[0], digest: `sha256:${'0'.repeat(64)}` }] }, /does not match/u],
  ['reserved evidence', { ...valid, evidence: [{ ...valid.evidence[0], kind: 'simplification-candidates' }] }, /reserved/u],
]) {
  const result = parseReviewInput(value);
  assert.equal(result.ok, false, name);
  assert.match(result.error, expected, name);
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-stage-input' }));
