import assert from 'node:assert/strict';

import { buildReviewInventoryLookup } from '../src/review-inventory-lookup.ts';

import { sha256Text } from '@kubeclaw/plugin-sdk';

import { expandReviewContext, selectReviewContext } from '../src/review-context-selection.ts';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';

const scope = {
  changedPaths: [{ path: 'src/index.ts', status: 'modified' }],
  allowedPrefixes: ['src'],
};

function candidate(path, content, dependencyDepth, reasons) {
  return { path, content, digest: sha256Text(content), dependencyDepth, reasons };
}

const changed = candidate('src/index.ts', 'export { api } from "./api.js";\n', 0, [{ kind: 'changed' }]);
const contract = candidate('src/api.ts', 'export const api = 1;\n', 1, [{
  kind: 'contract', sourcePath: 'src/index.ts',
}]);
const dependency = candidate('src/value.ts', 'export const value = 1;\n', 2, [{
  kind: 'dependency', sourcePath: 'src/api.ts',
}]);
const gatePolicy = getReviewPolicyProfile('gate');
const gate = resolveReviewPolicy({ builtIn: gatePolicy });
const withLimits = (limits) => resolveReviewPolicy({
  builtIn: { ...gatePolicy, profile: 'test-context', limits },
});

const selected = selectReviewContext([dependency, changed, contract], scope, gate);
assert.deepEqual(selected.selected.map(({ path }) => path), [
  'src/index.ts', 'src/api.ts', 'src/value.ts',
]);
assert.deepEqual(selected.omitted, []);
assert.match(selected.candidateManifestDigest, /^sha256:[0-9a-f]{64}$/u);
assert.equal(Object.isFrozen(selected), true);
assert.equal(Object.isFrozen(selected.selected), true);

const reordered = selectReviewContext([contract, dependency, changed], scope, gate);
assert.equal(reordered.candidateManifestDigest, selected.candidateManifestDigest);
assert.deepEqual(reordered.selected, selected.selected);

const shallow = selectReviewContext(
  [changed, contract, dependency], scope,
  withLimits({ ...gate.policy.limits, maxDependencyDepth: 1 }),
);
assert.deepEqual(shallow.selected.map(({ path }) => path), ['src/index.ts', 'src/api.ts']);
assert.deepEqual(shallow.omitted, [{ path: 'src/value.ts', reason: 'dependency_depth' }]);

const expansionLimits = {
  ...gate.policy.limits, maxContextFiles: 2, maxInitialContextFiles: 1,
};
const expansionPolicy = withLimits(expansionLimits);
const oneFile = selectReviewContext([changed, contract, dependency], scope, expansionPolicy);
assert.deepEqual(oneFile.selected.map(({ path }) => path), ['src/index.ts']);
assert.deepEqual(oneFile.omitted, [
  { path: 'src/api.ts', reason: 'file_count' },
  { path: 'src/value.ts', reason: 'file_count' },
]);

const changedBytes = Buffer.byteLength(changed.content, 'utf8');
const byteLimited = selectReviewContext(
  [changed, contract], scope,
  withLimits({ ...gate.policy.limits, maxInitialContextBytes: changedBytes }),
);
assert.deepEqual(byteLimited.selected.map(({ path }) => path), ['src/index.ts']);
assert.deepEqual(byteLimited.omitted, [{ path: 'src/api.ts', reason: 'total_bytes' }]);

assert.throws(() => expandReviewContext(
  [dependency, contract, changed], oneFile, ['src/index.ts'], scope, expansionPolicy,
), /known omitted candidates/u);
const changedContract = { ...contract, content: 'export const api = 2;\n' };
changedContract.digest = sha256Text(changedContract.content);
assert.throws(() => expandReviewContext(
  [dependency, changedContract, changed], oneFile, ['src/api.ts'], scope, expansionPolicy,
), /candidate manifest changed/u);
assert.throws(() => expandReviewContext(
  [{ ...dependency, dependencyDepth: 3 }, { ...contract, dependencyDepth: 2 }, changed],
  oneFile, ['src/api.ts'], scope, expansionPolicy,
), /candidate manifest changed/u);
assert.throws(() => expandReviewContext(
  [dependency, { ...contract, reasons: [{ kind: 'schema', sourcePath: 'src/index.ts' }] }, changed],
  oneFile, ['src/api.ts'], scope, expansionPolicy,
), /candidate manifest changed/u);
assert.throws(() => expandReviewContext(
  [dependency, contract, changed], oneFile, ['src/api.ts'], scope, gate,
), /policy changed/u);
assert.throws(() => expandReviewContext(
  [dependency, contract, changed], oneFile, ['src/api.ts'],
  { ...scope, allowedPrefixes: ['src', 'tests'] }, expansionPolicy,
), /scope changed/u);
const oneExpansionLimits = { ...expansionLimits, maxExpansionFiles: 1 };
const oneExpansionPolicy = withLimits(oneExpansionLimits);
const oneExpansion = selectReviewContext(
  [changed, contract, dependency], scope, oneExpansionPolicy,
);
assert.throws(() => expandReviewContext(
  [dependency, contract, changed], oneExpansion, ['src/api.ts', 'src/value.ts'], scope,
  oneExpansionPolicy,
), /must contain 1-1 items/u);
const expanded = expandReviewContext(
  [dependency, contract, changed], oneFile, ['src/api.ts'], scope, expansionPolicy,
);
assert.equal(expanded.expansionRound, 1);
assert.deepEqual(expanded.selected.map(({ path }) => path), ['src/index.ts', 'src/api.ts']);
assert.equal(expanded.selected[1].reasons.some(({ kind }) => kind === 'context_expansion'), true);
assert.throws(() => expandReviewContext(
  [dependency, contract, changed], oneFile, ['src/value.ts'], scope, expansionPolicy,
), /already consumed/u);
assert.throws(() => expandReviewContext(
  [dependency, contract, changed], expanded, ['src/value.ts'], scope, expansionPolicy,
), /owned initial selection/u);

assert.throws(() => selectReviewContext([
  { ...changed, digest: sha256Text('different') },
], scope, gate), /digest does not match/u);
assert.throws(() => selectReviewContext([
  { ...contract, path: 'other/api.ts' }, changed,
], scope, gate), /outside allowed scope/u);
assert.throws(() => selectReviewContext([
  { ...contract, dependencyDepth: 0 }, changed,
], scope, gate), /invalid dependency depth/u);
assert.throws(() => selectReviewContext([
  { ...contract, reasons: [{ kind: 'context_expansion' }] }, changed,
], scope, gate), /reserved for expansion/u);
assert.throws(() => selectReviewContext([
  { ...changed, reasons: Array.from({ length: 16 }, () => ({ kind: 'changed' })) },
], scope, gate), /must contain 1-15 items/u);
assert.throws(() => selectReviewContext([changed], scope, { ...gate }), /not trusted/u);

const inventory = ['apps/one/src/index.ts', 'apps/one/src/lib.ts', 'apps/two/src/index.ts', 'docs/guide.md']
  .map((path, index) => ({ path, objectId: String(index).padStart(40, '0'), mode: '100644', sizeBytes: 1,
    role: 'source', included: true }));
const lookup = buildReviewInventoryLookup(inventory);
assert.deepEqual(lookup.resolve('docs/guide.md').map(({ path }) => path), ['docs/guide.md']);
assert.deepEqual(lookup.resolve('apps/one').map(({ path }) => path),
  ['apps/one/src/index.ts', 'apps/one/src/lib.ts']);
assert.deepEqual(lookup.resolve('lib.ts').map(({ path }) => path), ['apps/one/src/lib.ts']);
assert.deepEqual(lookup.resolve('index.ts'), [], 'ambiguous suffixes are not selected');
assert.deepEqual(lookup.resolve('missing.ts'), []);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-context-selection' }));
