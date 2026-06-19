import assert from 'node:assert/strict';
import test from 'node:test';

import { parseReviewOutputContent } from '../../../../../skills/nova/pipeline/runners/review-gate-output.ts';

test('parseReviewOutputContent rejects PASS with critical_issues', () => {
  const result = parseReviewOutputContent(JSON.stringify({
    status: 'PASS',
    critical_issues: [{ description: 'real blocker' }],
    deferred_issues: [],
    summary: 'x',
  }));

  assert.equal(result.ok, false);
  assert.equal(result.decision, 'invalid_contract');
  assert.equal(result.invalid_contract, true);
});

test('parseReviewOutputContent rejects PASS with critical_blockers', () => {
  const result = parseReviewOutputContent(JSON.stringify({
    status: 'PASS',
    critical_issues: [],
    critical_blockers: [{ description: 'legacy blocker' }],
    deferred_issues: [],
    summary: 'x',
  }));

  assert.equal(result.ok, false);
  assert.equal(result.decision, 'invalid_contract');
  assert.equal(result.invalid_contract, true);
});

test('parseReviewOutputContent accepts PASS with empty or absent critical lists', () => {
  const withEmptyIssues = parseReviewOutputContent(JSON.stringify({
    status: 'PASS',
    critical_issues: [],
    deferred_issues: [],
    summary: 'x',
  }));
  const withAbsentIssues = parseReviewOutputContent(JSON.stringify({
    status: 'PASS',
    deferred_issues: [],
    summary: 'x',
  }));

  assert.equal(withEmptyIssues.ok, true);
  assert.equal(withEmptyIssues.decision, 'pass');
  assert.equal(withAbsentIssues.ok, true);
  assert.equal(withAbsentIssues.decision, 'pass');
});
