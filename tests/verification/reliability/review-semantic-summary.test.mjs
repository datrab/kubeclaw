import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { summaryReviewBundleDigest, SUMMARY_REVIEW_SEMANTIC_ENCODING } from '../../../skills/nova/plugins/project-summary/src/review-semantics.ts';
const child = fileURLToPath(new URL('./review-semantic-summary-child.mjs', import.meta.url));

test('original Summary consumes exact new semantic artifacts through Core/ArtifactStore in en and cs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-semantic-summary-'));
  try {
    for (const [phase, locale] of [['produce', 'en_US.UTF-8'], ['read-en', 'en_US.UTF-8'], ['read-cs', 'cs_CZ.UTF-8']]) {
      const env = { ...process.env, LANG: locale, LC_ALL: locale }; delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, [child, root, phase], { env, encoding: 'utf8', timeout: 30000 });
      console.log(JSON.stringify({ phase, locale, status: result.status, stdout: result.stdout, stderr: result.stderr }));
      assert.equal(result.status, 0, result.stderr); assert.equal(result.signal, null);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Summary semantic reader rejects proxy/getter, partial and unknown version pairs', () => {
  const bundle = { revisions: {}, evidence: [] }, report = { revision: {}, outcome: 'passed' };
  assert.match(summaryReviewBundleDigest(report, bundle), /^sha256:/);
  for (const [r, b] of [[{ ...report, schemaVersion: 'future' }, bundle], [report, { ...bundle, schemaVersion: 'review-bundle.v1' }]]) {
    assert.throws(() => summaryReviewBundleDigest(r, b), /SEMANTIC_PAIR_INVALID/);
  }
  assert.throws(() => summaryReviewBundleDigest(report, bundle, SUMMARY_REVIEW_SEMANTIC_ENCODING), /SEMANTIC_PAIR_INVALID/);
  let calls = 0;
  const trapped = { get schemaVersion() { calls++; return 'review-bundle.v2'; } };
  assert.throws(() => summaryReviewBundleDigest(report, trapped));
  assert.throws(() => summaryReviewBundleDigest(new Proxy(report, { ownKeys() { calls++; return []; } }), bundle));
  assert.equal(calls, 0);
});
