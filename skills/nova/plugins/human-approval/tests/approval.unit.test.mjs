import assert from 'node:assert/strict';

import {
  DEFAULT_APPROVAL_TIMEOUT_MINUTES,
  calculateApprovalExpiresAt,
  parseApprovalConfig,
  parseApprovalGuidance,
  parseApprovalInput,
  pendingApprovalResult,
  resultForApprovalGuidance,
  validateCreatedWait,
} from '../src/approval.ts';

assert.deepEqual(parseApprovalInput({ summary: '  Deploy release  ' }), {
  summary: 'Deploy release',
});
assert.throws(() => parseApprovalInput({ summary: ' \n ' }), /APPROVAL_SUMMARY_INVALID/);
assert.throws(
  () => parseApprovalInput({ summary: 'Deploy', hidden: true }),
  /APPROVAL_INPUT_UNKNOWN_FIELD:hidden/,
);

assert.deepEqual(parseApprovalConfig({
  target: 'release-operators',
  issuerId: 'operator:release',
}), {
  target: 'release-operators',
  issuerId: 'operator:release',
  timeoutMinutes: DEFAULT_APPROVAL_TIMEOUT_MINUTES,
});
assert.throws(
  () => parseApprovalConfig({ target: 'release-operators', issuerId: 'operator:release', timeoutMinutes: 0 }),
  /APPROVAL_TIMEOUT_MINUTES_INVALID/,
);

assert.deepEqual(parseApprovalGuidance(undefined, 'operator:release'), {
  decision: 'pending',
});
assert.deepEqual(parseApprovalGuidance({ decision: 'pending' }, 'operator:release'), {
  decision: 'pending',
});
const approved = parseApprovalGuidance({
  decision: 'approved',
  issuer: { type: 'operator', id: 'operator:release' },
}, 'operator:release');
assert.equal(resultForApprovalGuidance(approved).outcome, 'passed');

const rejected = parseApprovalGuidance({
  decision: 'rejected',
  issuer: { type: 'operator', id: 'operator:release' },
  reason: 'Required review is incomplete.',
}, 'operator:release');
const rejectedResult = resultForApprovalGuidance(rejected);
assert.equal(rejectedResult.outcome, 'blocked');
assert.equal(rejectedResult.reason.message, 'Required review is incomplete.');
assert.equal(rejectedResult.reason.details.issuer, 'operator:release');

assert.throws(
  () => parseApprovalGuidance({
    decision: 'approved',
    issuer: { type: 'operator', id: 'operator:other' },
  }, 'operator:release'),
  /APPROVAL_ISSUER_DENIED/,
);
assert.throws(
  () => parseApprovalGuidance({ decision: 'approved' }, 'operator:release'),
  /APPROVAL_ISSUER_INVALID/,
);
assert.throws(
  () => parseApprovalGuidance({ decision: 'maybe' }, 'operator:release'),
  /APPROVAL_DECISION_INVALID/,
);

assert.equal(
  calculateApprovalExpiresAt(new Date('2026-07-26T12:00:00.000Z'), 15),
  '2026-07-26T12:15:00.000Z',
);
assert.throws(
  () => calculateApprovalExpiresAt(new Date('invalid'), 15),
  /APPROVAL_CLOCK_INVALID/,
);

const wait = validateCreatedWait({
  created: true,
  wait: {
    schemaVersion: 'wait-request.v2',
    waitId: 'wait:approval-1',
    kind: 'signal',
    signalType: 'approval.resolved',
    authorizedIssuer: { type: 'operator', id: 'operator:release' },
    expiresAt: '2026-07-26T12:15:00.000Z',
    request: { summary: 'Deploy release' },
  },
}, {
  issuerId: 'operator:release',
  expiresAt: '2026-07-26T12:15:00.000Z',
  summary: 'Deploy release',
});
assert.equal(pendingApprovalResult(wait).outcome, 'wait');
assert.throws(
  () => validateCreatedWait({
    created: true,
    wait: {
      ...wait,
      authorizedIssuer: { type: 'operator', id: 'operator:other' },
    },
  }, {
    issuerId: 'operator:release',
    expiresAt: '2026-07-26T12:15:00.000Z',
    summary: 'Deploy release',
  }),
  /APPROVAL_ISSUER_DENIED/,
);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.human-approval', suite: 'unit' }));
