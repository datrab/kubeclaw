import assert from 'node:assert/strict';
import fs from 'node:fs';

import { sha256Text } from '@kubeclaw/plugin-sdk';

import { scalableReviewTask } from '../src/scalable-review-jobs.ts';

const corpus = JSON.parse(fs.readFileSync(new URL('./fixtures/scalable-review-quality-corpus.json', import.meta.url), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/scalable-review-quality-baseline.json', import.meta.url), 'utf8'));
assert.equal(corpus.schemaVersion, 'scalable-review-quality-corpus.v1');
assert.equal(corpus.cases.length, 14);
assert.equal(new Set(corpus.cases.map(({ id }) => id)).size, corpus.cases.length);
assert.equal(new Set(corpus.cases.map(({ path }) => path)).size, corpus.cases.length);
for (const risk of ['security', 'contract', 'concurrency', 'retry', 'persistence', 'deployment', 'recovery']) {
  const cases = corpus.cases.filter((value) => value.risk === risk);
  assert.deepEqual(cases.map(({ expected }) => expected).sort(), ['clean', 'defect']);
}
assert.equal(corpus.cases.filter(({ expected }) => expected === 'defect')
  .every(({ priority }) => ['P0', 'P1', 'P2', 'P3'].includes(priority)), true);
assert.equal(baseline.schemaVersion, 'scalable-review-quality-baseline.v1');
assert.equal(baseline.cases, corpus.cases.length);
assert.equal(baseline.componentTaskDigest, sha256Text(scalableReviewTask('component')),
  'prompt changes require a new live quality baseline');
assert.deepEqual(Object.keys(baseline.promptDigests).sort(), ['balanced', 'dense', 'focused']);
assert.equal(Object.values(baseline.variants).every(({
  invalidJobs, defectRecall, cleanPrecision, eligiblePriorityRecall,
}) => (
  invalidJobs === 0 && defectRecall === 1 && cleanPrecision === 1 && eligiblePriorityRecall === 1
)), true);

console.log(JSON.stringify({ ok: true, suite: 'review-quality-corpus' }));
