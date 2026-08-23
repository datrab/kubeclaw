import assert from 'node:assert/strict';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { parseReviewBundle } from '../src/review-bundle-parser.ts';
import { isReviewBundleSnapshot, snapshotReviewBundle } from '../src/review-bundle-snapshot.ts';

const evidenceContent = canonicalJson({ tests: 'passed' });
const contextContent = 'export const ok = true;\n';
const changedPaths = [{ path: 'src/index.ts', status: 'modified' }];
const bundle = {
  schemaVersion: 'review-bundle.v1',
  task: { id: 'task:review', statement: 'Review the implementation.' },
  revisions: {
    base: '1'.repeat(40), head: '2'.repeat(40),
    changedManifestDigest: sha256Text(canonicalJson(changedPaths)),
  },
  scope: {
    changedPaths,
    allowedPrefixes: ['src'],
  },
  requirements: [{ id: 'REQ-1', statement: 'Tests pass.' }],
  evidence: [{ kind: 'test', digest: sha256Text(evidenceContent), content: evidenceContent }],
  context: [{
    path: 'src/index.ts', digest: sha256Text(contextContent), content: contextContent,
    reasons: [{ kind: 'changed' }],
  }],
  selection: {
    version: 'focused-context.v1',
    candidateManifestDigest: `sha256:${'4'.repeat(64)}`,
    expansionRound: 0,
  },
  policyDigest: `sha256:${'5'.repeat(64)}`,
};

const parsed = parseReviewBundle(bundle);
assert.equal(parsed.ok, true);
assert.equal(Object.isFrozen(parsed.value), true);
assert.equal(Object.isFrozen(parsed.value.context[0]), true);
const snapshot = snapshotReviewBundle(bundle);
assert.equal(isReviewBundleSnapshot(snapshot), true);
assert.equal(snapshot.digest, sha256Text(canonicalJson(snapshot.bundle)));
assert.equal(snapshotReviewBundle({
  ...bundle,
  requirements: [...bundle.requirements].reverse(),
}).digest, snapshot.digest);

assert.equal(parseReviewBundle({
  ...bundle,
  context: [{ ...bundle.context[0], digest: `sha256:${'0'.repeat(64)}` }],
}).ok, false);
assert.equal(parseReviewBundle({
  ...bundle,
  evidence: [{ ...bundle.evidence[0], content: '{ "tests": "passed" }', digest: sha256Text('{ "tests": "passed" }') }],
}).ok, false, 'non-canonical evidence must fail at the parser boundary');
assert.equal(parseReviewBundle({
  ...bundle,
  scope: {
    ...bundle.scope,
    changedPaths: [{ path: 'src/index.ts', status: 'renamed', previousPath: 'src/index.ts' }],
  },
}).ok, false, 'self-renames must fail');
assert.equal(parseReviewBundle({
  ...bundle,
  revisions: { ...bundle.revisions, changedManifestDigest: `sha256:${'3'.repeat(64)}` },
}).ok, false, 'changed manifest identity must match the normalized changed paths');
assert.equal(parseReviewBundle({
  ...bundle,
  context: [{ ...bundle.context[0], path: 'other/file.ts' }],
}).ok, false);
assert.equal(parseReviewBundle({
  ...bundle,
  scope: { ...bundle.scope, changedPaths: [...bundle.scope.changedPaths, ...bundle.scope.changedPaths] },
}).ok, false);
assert.equal(isReviewBundleSnapshot(Object.freeze({ bundle, digest: snapshot.digest })), false);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-bundle-snapshot' }));
