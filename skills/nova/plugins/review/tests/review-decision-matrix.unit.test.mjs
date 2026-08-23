import assert from 'node:assert/strict';

import { reduceReviewDecision } from '../src/review-reducer.ts';
import { certifyReviewReductionInput } from '../src/review-reduction-state.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';
import { makeReviewPolicy } from './fixtures/review-policy.mjs';

const wait = {
  schemaVersion: 'wait-request.v2',
  waitId: 'review-matrix-wait',
  kind: 'orchestrator',
  signalType: 'kubeclaw.review.resolve',
  authorizedIssuer: { type: 'orchestrator', id: 'orchestrator:kubeclaw.review' },
  expiresAt: null,
};
const finding = {
  fingerprint: `sha256:${'d'.repeat(64)}`,
  category: 'correctness',
  priority: 'P0',
  message: 'Verified review finding.',
  recommendedFix: 'Apply the smallest in-scope repair.',
  changeRelation: 'introduced',
  scopeRelation: 'inside',
  evidenceStrength: 'direct',
  repairable: true,
  verified: true,
};

function nestedPolicy(overrides = {}) {
  const base = makeReviewPolicy();
  return Object.fromEntries(Object.entries(base).map(([key, value]) => [
    key,
    value && typeof value === 'object' && !Array.isArray(value)
      ? { ...value, ...(overrides[key] ?? {}) }
      : (overrides[key] ?? value),
  ]));
}

function decide(testCase) {
  const resolvedPolicy = resolveReviewPolicy({ builtIn: nestedPolicy(testCase.policy) });
  const state = certifyReviewReductionInput({
    resolvedPolicy,
    integrityIssues: [],
    unverifiedRequirements: [],
    limitViolations: [],
    findings: [{ ...finding, ...(testCase.finding ?? {}) }],
    orchestratorWait: wait,
    ...(testCase.input ?? {}),
  });
  return reduceReviewDecision(state);
}

const cases = [
  { name: 'clean', input: { findings: [] }, outcome: 'passed' },
  { name: 'integrity failure', input: { integrityIssues: ['invalid output'] }, outcome: 'blocked', code: 'kubeclaw.review.untrusted_state' },
  { name: 'unverified requirement', input: { unverifiedRequirements: ['REQ-1'] }, outcome: 'blocked', code: 'kubeclaw.review.requirements_unverified' },
  { name: 'unverified requirement escalation', policy: { verification: { unverifiedRequirement: 'orchestrator_required' } }, input: { unverifiedRequirements: ['REQ-1'] }, outcome: 'orchestrator_required' },
  { name: 'limit escalation', input: { limitViolations: ['root causes'] }, outcome: 'orchestrator_required' },
  { name: 'verifier uncertainty escalation', input: { orchestratorProposalIds: [`sha256:${'a'.repeat(64)}`], findings: [] }, outcome: 'orchestrator_required' },
  { name: 'verifier follow-up passes', input: { followUpProposalIds: [`sha256:${'b'.repeat(64)}`], findings: [] }, outcome: 'passed' },
  { name: 'integrity precedes verifier uncertainty', input: { integrityIssues: ['invalid'], orchestratorProposalIds: [`sha256:${'a'.repeat(64)}`] }, outcome: 'blocked', code: 'kubeclaw.review.untrusted_state' },
  { name: 'repairable blocker', outcome: 'request_fix', code: 'kubeclaw.review.verified_blockers' },
  { name: 'unrepairable blocker', finding: { repairable: false }, outcome: 'orchestrator_required' },
  { name: 'nonblocking priority', finding: { priority: 'P1' }, outcome: 'passed' },
  { name: 'configured P1 blocker', policy: { blocking: { priorities: ['P0', 'P1'] } }, finding: { priority: 'P1' }, outcome: 'request_fix' },
  { name: 'nonblocking category', finding: { category: 'architecture' }, outcome: 'passed' },
  { name: 'configured architecture blocker', policy: { blocking: { categories: ['correctness', 'security', 'contract', 'architecture'] } }, finding: { category: 'architecture' }, outcome: 'request_fix' },
  { name: 'exposed finding follows up', finding: { changeRelation: 'exposed' }, outcome: 'passed' },
  { name: 'pre-existing finding ignored', policy: { scope: { retainPreExisting: false } }, finding: { changeRelation: 'pre_existing' }, outcome: 'passed' },
  { name: 'inferred evidence rejected', finding: { evidenceStrength: 'inferred' }, outcome: 'passed' },
  { name: 'inferred evidence follows up', policy: { verification: { insufficientFindingEvidence: 'follow_up' } }, finding: { evidenceStrength: 'inferred' }, outcome: 'passed' },
  { name: 'inferred evidence escalates', policy: { verification: { insufficientFindingEvidence: 'orchestrator_required' } }, finding: { evidenceStrength: 'inferred' }, outcome: 'orchestrator_required' },
  { name: 'direct evidence not mandatory', policy: { blocking: { requireDirectEvidence: false } }, finding: { evidenceStrength: 'inferred' }, outcome: 'request_fix' },
  { name: 'outside scope follows up', finding: { scopeRelation: 'outside' }, outcome: 'passed' },
  { name: 'outside scope escalates', policy: { scope: { outsideScope: 'orchestrator_required' } }, finding: { scopeRelation: 'outside' }, outcome: 'orchestrator_required' },
  { name: 'unknown scope escalates', finding: { scopeRelation: 'unknown' }, outcome: 'orchestrator_required' },
  { name: 'unknown scope blocks', policy: { scope: { unknownScope: 'blocked' } }, finding: { scopeRelation: 'unknown' }, outcome: 'blocked', code: 'kubeclaw.review.scope_unknown' },
  { name: 'unknown scope follows up', policy: { scope: { unknownScope: 'follow_up' } }, finding: { scopeRelation: 'unknown' }, outcome: 'passed' },
  { name: 'integrity precedes limit escalation', input: { integrityIssues: ['invalid'], limitViolations: ['limit'] }, outcome: 'blocked', code: 'kubeclaw.review.untrusted_state' },
  { name: 'requirement precedes finding repair', input: { unverifiedRequirements: ['REQ-1'] }, outcome: 'blocked', code: 'kubeclaw.review.requirements_unverified' },
  { name: 'escalation precedes repair', input: { findings: [finding, { ...finding, fingerprint: `sha256:${'e'.repeat(64)}`, repairable: false }] }, outcome: 'orchestrator_required' },
  { name: 'requirement escalation needs wait', policy: { verification: { unverifiedRequirement: 'orchestrator_required' } }, input: { unverifiedRequirements: ['REQ-1'], orchestratorWait: undefined }, outcome: 'blocked', code: 'kubeclaw.review.missing_orchestrator_wait' },
  { name: 'requirement escalation rejects malformed wait', policy: { verification: { unverifiedRequirement: 'orchestrator_required' } }, input: { unverifiedRequirements: ['REQ-1'], orchestratorWait: { ...wait, signalType: 'other.workflow.resume' } }, outcome: 'blocked', code: 'kubeclaw.review.missing_orchestrator_wait' },
  { name: 'limit escalation needs wait', input: { limitViolations: ['limit'], orchestratorWait: undefined }, outcome: 'blocked', code: 'kubeclaw.review.missing_orchestrator_wait' },
  { name: 'limit escalation rejects malformed wait', input: { limitViolations: ['limit'], orchestratorWait: { ...wait, signalType: 'other.workflow.resume' } }, outcome: 'blocked', code: 'kubeclaw.review.missing_orchestrator_wait' },
  { name: 'finding escalation needs wait', finding: { repairable: false }, input: { orchestratorWait: undefined }, outcome: 'blocked', code: 'kubeclaw.review.missing_orchestrator_wait' },
  { name: 'finding escalation needs valid wait', finding: { repairable: false }, input: { orchestratorWait: { ...wait, signalType: 'other.workflow.resume' } }, outcome: 'blocked', code: 'kubeclaw.review.missing_orchestrator_wait' },
];

for (const testCase of cases) {
  const result = decide(testCase);
  assert.equal(result.outcome, testCase.outcome, testCase.name);
  if (testCase.code) assert.equal(result.reason?.code, testCase.code, testCase.name);
}

assert.equal(reduceReviewDecision(null).outcome, 'blocked', 'uncertified state fails closed');
assert.throws(() => certifyReviewReductionInput({
  resolvedPolicy: resolveReviewPolicy({ builtIn: makeReviewPolicy() }),
  integrityIssues: [],
  unverifiedRequirements: [],
  limitViolations: [],
  findings: [{ ...finding, evidenceStrength: 'insufficient' }],
}), /cannot be certified/u, 'insufficient evidence cannot masquerade as verified');

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-decision-matrix', cases: cases.length }));
