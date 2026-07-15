import assert from 'node:assert/strict';
import test from 'node:test';

import { parseReviewOutputContent } from '../../../../../skills/nova/pipeline/runners/review-gate-output.ts';

function passReview(overrides = {}) {
  return {
    status: 'PASS',
    critical_issues: [],
    deferred_issues: [],
    checked_contracts: ['.swarm/contracts/module-review.json'],
    opened_artifacts: ['.swarm/logs/modules/01-nginx/buster-output.json'],
    failed_commands: [],
    unverified_requirements: [],
    summary: 'x',
    ...overrides,
  };
}

test('parseReviewOutputContent rejects PASS with critical_issues', () => {
  const result = parseReviewOutputContent(JSON.stringify(passReview({
    critical_issues: [{ description: 'real blocker' }],
  })));

  assert.equal(result.ok, false);
  assert.equal(result.decision, 'invalid_contract');
  assert.equal(result.invalid_contract, true);
});

test('parseReviewOutputContent rejects PASS with critical_blockers', () => {
  const result = parseReviewOutputContent(JSON.stringify(passReview({
    critical_blockers: [{ description: 'legacy blocker' }],
  })));

  assert.equal(result.ok, false);
  assert.equal(result.decision, 'invalid_contract');
  assert.equal(result.invalid_contract, true);
});

test('parseReviewOutputContent accepts PASS with required evidence fields', () => {
  const withEmptyIssues = parseReviewOutputContent(JSON.stringify(passReview()));
  const withAbsentIssues = parseReviewOutputContent(JSON.stringify(passReview({ critical_issues: undefined })));

  assert.equal(withEmptyIssues.ok, true);
  assert.equal(withEmptyIssues.decision, 'pass');
  assert.equal(withAbsentIssues.ok, true);
  assert.equal(withAbsentIssues.decision, 'pass');
});

test('parseReviewOutputContent rejects PASS without opened evidence', () => {
  const result = parseReviewOutputContent(JSON.stringify(passReview({
    opened_artifacts: [],
  })));

  assert.equal(result.ok, false);
  assert.equal(result.decision, 'invalid_contract');
  assert.match(result.error, /opened_artifacts/);
});

test('parseReviewOutputContent rejects PASS with failed commands', () => {
  const result = parseReviewOutputContent(JSON.stringify(passReview({
    failed_commands: ['rg .swarm/contracts failed'],
  })));

  assert.equal(result.ok, false);
  assert.equal(result.decision, 'invalid_contract');
  assert.match(result.error, /failed_commands/);
});
