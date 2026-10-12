import assert from 'node:assert/strict';

import { parseReviewPolicy } from '../src/review-policy-parser.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';
import { makeReviewPolicy as policy } from './fixtures/review-policy.mjs';

const builtIn = policy('gate');
const parsed = parseReviewPolicy(builtIn);
assert.equal(parsed.ok, true);
assert.equal(Object.isFrozen(parsed.value), true);
assert.equal(Object.isFrozen(parsed.value.blocking.priorities), true);

const resolved = resolveReviewPolicy({
  builtIn,
  settingsFile: policy('settings', 10),
  runOverride: { authorized: true, policy: policy('run', 5) },
});
assert.equal(resolved.selectedSource, 'run_override');
assert.equal(resolved.policy.profile, 'run');
assert.equal(resolved.policy.limits.maxProposals, 5);
assert.match(resolved.digest, /^sha256:[0-9a-f]{64}$/u);
assert.deepEqual(resolved.sources.map(({ kind }) => kind), [
  'built_in', 'settings_file', 'run_override',
]);
assert.equal(Object.isFrozen(resolved), true);
assert.equal(Object.isFrozen(resolved.sources), true);

const reordered = Object.fromEntries(Object.entries(builtIn).reverse());
assert.equal(
  resolveReviewPolicy({ builtIn }).digest,
  resolveReviewPolicy({ builtIn: reordered }).digest,
  'digest must not depend on object member order',
);

assert.throws(
  () => resolveReviewPolicy({ builtIn, runOverride: { authorized: false, policy: policy('run') } }),
  /not authorized/u,
);
assert.throws(
  () => resolveReviewPolicy({ builtIn, runOverride: { authorized: 'false', policy: policy('run') } }),
  /not authorized/u,
  'truthy non-boolean authorization is rejected at runtime',
);
assert.equal(parseReviewPolicy({ ...builtIn, extra: true }).ok, false);
assert.equal(parseReviewPolicy({
  ...builtIn,
  blocking: { ...builtIn.blocking, priorities: ['P1'] },
}).ok, false, 'P0 cannot be configured away');
assert.equal(parseReviewPolicy({
  ...builtIn,
  limits: { ...builtIn.limits, maxProposals: 129 },
}).ok, false, 'hard ceilings cannot be exceeded');
assert.equal(parseReviewPolicy({
  ...builtIn,
  governor: { ...builtIn.governor, maxRepairCycles: 9 },
}).ok, false, 'governor cycle ceilings cannot be exceeded');
assert.equal(parseReviewPolicy({
  ...builtIn,
  limits: { ...builtIn.limits, maxContextBytes: builtIn.limits.maxBundleBytes + 1 },
}).ok, false, 'context cannot exceed the complete bundle');
assert.equal(parseReviewPolicy({
  ...builtIn,
  limits: { ...builtIn.limits, maxContextFileBytes: builtIn.limits.maxContextBytes + 1 },
}).ok, false, 'one context file cannot exceed total context capacity');
assert.equal(parseReviewPolicy({
  ...builtIn,
  limits: { ...builtIn.limits, maxInitialContextFiles: builtIn.limits.maxContextFiles + 1 },
}).ok, false, 'initial file capacity cannot exceed total context capacity');
assert.equal(parseReviewPolicy({
  ...builtIn,
  limits: { ...builtIn.limits, maxInitialContextBytes: builtIn.limits.maxContextBytes + 1 },
}).ok, false, 'initial byte capacity cannot exceed total context capacity');
assert.equal(parseReviewPolicy({
  ...builtIn,
  simplification: { ...builtIn.simplification, enabled: false },
}).ok, false, 'cross-field constraints are enforced');
const sparsePriorities = ['P0', 'P1'];
delete sparsePriorities[1];
assert.equal(parseReviewPolicy({
  ...builtIn,
  blocking: { ...builtIn.blocking, priorities: sparsePriorities },
}).ok, false, 'sparse selection arrays are rejected');

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-policy-resolver' }));
