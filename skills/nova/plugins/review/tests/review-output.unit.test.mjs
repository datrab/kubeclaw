import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  parseReviewDispatchResponse,
  parseReviewOutput,
  reviewOutputToStageResult,
} from '../dist/review-output.js';

function fixture(name) {
  return fs.readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
}

const pass = parseReviewOutput(fixture('pass'));
assert.equal(pass.ok, true);
assert.deepEqual(reviewOutputToStageResult(pass), {
  schemaVersion: 'stage-result.v2',
  outcome: 'passed',
  artifacts: [],
});

const fail = parseReviewDispatchResponse({
  result: JSON.parse(fixture('fail')),
});
assert.equal(fail.ok, true);
const failedResult = reviewOutputToStageResult(fail);
assert.equal(failedResult.outcome, 'request_fix');
assert.equal(failedResult.reason.code, 'kubeclaw.review.failed');
assert.equal(failedResult.reason.details.findings.length, 1);
assert.equal(
  failedResult.reason.details.findings[0].target,
  'src/adapter.ts',
);
assert.equal(failedResult.reason.details.deferredIssues.length, 1);

for (const [label, value, message] of [
  ['missing evidence', fixture('malformed'), /checked contract/],
  ['invalid JSON', '{not-json', /valid JSON/],
  ['array root', '[]', /JSON object/],
  ['unknown root field', { ...JSON.parse(fixture('pass')), surprise: true }, /unknown field/],
  ['unknown issue field', {
    ...JSON.parse(fixture('fail')),
    critical_issues: [{
      ...JSON.parse(fixture('fail')).critical_issues[0],
      module: 'legacy-shape',
    }],
  }, /unknown field/],
  ['contradictory PASS', {
    ...JSON.parse(fixture('pass')),
    critical_issues: JSON.parse(fixture('fail')).critical_issues,
  }, /contradicts critical_issues/],
  ['unexplained FAIL', {
    ...JSON.parse(fixture('pass')),
    status: 'FAIL',
  }, /FAIL requires/],
]) {
  const parsed = parseReviewOutput(value);
  assert.equal(parsed.ok, false, label);
  assert.match(parsed.error, message, label);
  const result = reviewOutputToStageResult(parsed);
  assert.equal(result.outcome, 'blocked', label);
  assert.equal(result.reason.code, 'kubeclaw.review.invalid_output', label);
}

const missingResult = parseReviewDispatchResponse({ status: 'completed' });
assert.deepEqual(missingResult, {
  ok: false,
  error: 'runtime dispatch response is missing result',
});

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.review',
  suite: 'review-output-unit',
}));
