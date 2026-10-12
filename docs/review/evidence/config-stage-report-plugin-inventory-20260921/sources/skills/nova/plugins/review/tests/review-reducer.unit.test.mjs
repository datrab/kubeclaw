import assert from 'node:assert/strict';

import { parseReviewPolicy } from '../src/review-policy-parser.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';
import {
  reduceReviewDecision,
} from '../src/review-reducer.ts';
import { certifyReviewReductionInput } from '../src/review-reduction-state.ts';
import { makeReviewPolicy } from './fixtures/review-policy.mjs';

const parsed = parseReviewPolicy(makeReviewPolicy());
assert.equal(parsed.ok, true);
const policy = parsed.value;
const resolvedPolicy = resolveReviewPolicy({ builtIn: policy });
const wait = {
  schemaVersion: 'wait-request.v2',
  waitId: 'review-wait-1',
  kind: 'orchestrator',
  signalType: 'kubeclaw.review.resolve',
  authorizedIssuer: { type: 'orchestrator', id: 'orchestrator:kubeclaw.review' },
  expiresAt: null,
};
const finding = {
  fingerprint: `sha256:${'c'.repeat(64)}`,
  category: 'correctness',
  priority: 'P0',
  message: 'The changed path violates the required behavior.',
  recommendedFix: 'Repair the changed path.',
  changeRelation: 'introduced',
  scopeRelation: 'inside',
  evidenceStrength: 'direct',
  repairable: true,
  verified: true,
};
const base = {
  resolvedPolicy,
  integrityIssues: [],
  unverifiedRequirements: [],
  limitViolations: [],
  findings: [],
  orchestratorWait: wait,
};
const certified = (overrides = {}) => certifyReviewReductionInput({ ...base, ...overrides });

assert.equal(reduceReviewDecision(certified()).outcome, 'passed');
assert.equal(reduceReviewDecision(certified({ findings: [finding] })).outcome, 'request_fix');
assert.equal(reduceReviewDecision(certified({ integrityIssues: ['invalid evidence'] })).outcome, 'blocked');
assert.equal(reduceReviewDecision(certified({ unverifiedRequirements: ['REQ-1'] })).outcome, 'blocked');
assert.equal(reduceReviewDecision(certified({ limitViolations: ['root-cause limit'] })).outcome, 'orchestrator_required');
assert.equal(reduceReviewDecision(certified({
  findings: [{ ...finding, repairable: false }],
})).outcome, 'orchestrator_required');
assert.equal(reduceReviewDecision(certified({
  findings: [{ ...finding, scopeRelation: 'outside' }],
})).outcome, 'passed', 'configured follow-up findings do not block');
assert.equal(reduceReviewDecision(certified({
  resolvedPolicy: resolveReviewPolicy({
    builtIn: { ...policy, scope: { ...policy.scope, unknownScope: 'blocked' } },
  }),
  findings: [{ ...finding, scopeRelation: 'unknown' }],
})).outcome, 'blocked');
assert.equal(reduceReviewDecision(certified({
  orchestratorWait: undefined,
  limitViolations: ['root-cause limit'],
})).outcome, 'blocked', 'missing wait data fails closed');
assert.equal(reduceReviewDecision({
  ...base,
  resolvedPolicy: { ...resolvedPolicy, digest: `sha256:${'b'.repeat(64)}` },
}).outcome, 'blocked', 'policy and digest cannot be separated');
assert.equal(reduceReviewDecision(certified({
  orchestratorWait: { ...wait, schemaVersion: 'wait-request.v1' },
  limitViolations: ['root-cause limit'],
})).outcome, 'blocked', 'malformed waits fail closed');
assert.equal(reduceReviewDecision({
  ...base,
  findings: [{ verified: true }],
}).outcome, 'blocked', 'incomplete verified findings fail closed');
assert.equal(reduceReviewDecision(certified({
  orchestratorWait: { ...wait, signalType: 'other.workflow.resume' },
  limitViolations: ['root-cause limit'],
})).outcome, 'blocked', 'unrelated orchestrator waits are rejected');
assert.equal(reduceReviewDecision({ ...base, findings: null }).outcome, 'blocked');
assert.equal(reduceReviewDecision({ ...base, integrityIssues: null }).outcome, 'blocked');
assert.equal(reduceReviewDecision(null).outcome, 'blocked');
assert.equal(reduceReviewDecision({ ...base, resolvedPolicy: null }).outcome, 'blocked');

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-reducer' }));
