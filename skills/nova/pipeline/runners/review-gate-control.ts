import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/review-gate-control.ts — Review gate typed-control and remediation request helpers
// Keep this module free of runner lifecycle, spawning, polling, and Discord side effects.

import { getRunId } from '../core/runtime.ts';
import {
  GATE_CONTROL_ACTIONS,
  buildTypedGateControlResult,
  cloneSerializable,
  coerceTypedGateControlResult,
  isTypedGateControlResult,
} from '../services/contracts/gate-control-result.ts';
import {
  buildReviewGateFindings,
  extractReviewIssues,
} from './review-gate-output.ts';

export const REVIEW_GATE_FAILURE_CLASSES = Object.freeze([
  'config_invalid',
  'invalid_contract',
  'rate_limit_exhausted',
  'review_failed',
  'classification_missing',
  'verdict_fail',
]);

const REVIEW_GATE_FAILURE_DECISIONS = Object.freeze({
  'config_invalid': { issueType: 'contract', outcomeClass: 'error' },
  'invalid_contract': { issueType: 'contract', outcomeClass: 'error' },
  'rate_limit_exhausted': { issueType: 'environment', outcomeClass: 'rate_limited' },
  'review_failed': { issueType: 'environment', outcomeClass: 'error' },
  'classification_missing': { issueType: 'contract', outcomeClass: 'error' },
  'verdict_fail': { issueType: 'code', outcomeClass: 'needs_nova' },
});

const REVIEW_GATE_FAILURE_FINDINGS = Object.freeze({
  'config_invalid': { code: 'REVIEW_GATE_CONFIG_INVALID', severity: 'critical', retryable: false, environmentIssue: false },
  'invalid_contract': { code: 'REVIEW_GATE_INVALID_CONTRACT', severity: 'critical', retryable: false, environmentIssue: false },
  'rate_limit_exhausted': { code: 'REVIEW_GATE_RATE_LIMIT_EXHAUSTED', severity: 'error', retryable: true, environmentIssue: true },
  'review_failed': { code: 'REVIEW_GATE_REVIEW_FAILED', severity: 'error', retryable: true, environmentIssue: true },
  'classification_missing': { code: 'REVIEW_GATE_CLASSIFICATION_MISSING', severity: 'error', retryable: false, environmentIssue: false },
  'verdict_fail': { code: 'REVIEW_GATE_VERDICT_FAIL', severity: 'error', retryable: false, environmentIssue: false },
});
const REVIEW_GATE_TYPE = 'review';
const REVIEW_GATE_FAILED_STATUS = 'failed';
const REVIEW_GATE_ZERO_FIX_CYCLES = 0;

function selectPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizedFailureClass(result = {}) {
  return typeof result?.failure_class === 'string' ? result.failure_class.trim().toLowerCase() : '';
}

function gateType(gate) {
  return selectPresentValue(gate?.type, REVIEW_GATE_TYPE);
}

function reviewReason(result, fallback) {
  return selectPresentValue(result?.reason, fallback);
}

function buildReviewControlSummary(gateId, result = {}) {
  if (isReviewGatePassResult(result)) {
    return `Review gate '${gateId}' passed`;
  }
  if (selectTruthyValue(() => (result?.failure_class === 'rate_limit_exhausted'), () => (result?.outcome_class === 'rate_limited'))) {
    return reviewReason(result, `Review gate '${gateId}' exceeded max rate limit pauses`);
  }
  if (result?.outcome_class === 'needs_nova') {
    return reviewReason(result, `Review gate '${gateId}' requires Nova intervention`);
  }
  return reviewReason(result, `Review gate '${gateId}' failed`);
}

function requireReviewFailureClass(result = {}, gateId = '') {
  if (isReviewGatePassResult(result)) return null;
  const failureClass = normalizedFailureClass(result);
  if (!failureClass) {
    throw new Error(`Review gate '${gateId}' non-pass result requires explicit failure_class`);
  }
  if (!REVIEW_GATE_FAILURE_CLASSES.includes(failureClass)) {
    throw new Error(`Review gate '${gateId}' failure_class '${failureClass}' is not registered`);
  }
  return failureClass;
}

function reviewGateDecisionForResult(result = {}, failureClass = null) {
  if (isReviewGatePassResult(result)) {
    return { nextAction: GATE_CONTROL_ACTIONS.PASS, issueType: undefined, outcomeClass: 'passed' };
  }
  const decision = REVIEW_GATE_FAILURE_DECISIONS[failureClass];
  if (!decision) {
    throw new Error(`Review failure_class '${failureClass}' does not have a registered decision mapping`);
  }
  return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, ...decision };
}

function canonicalReviewGateRunStatus(result = {}) {
  return isReviewGatePassResult(result) ? 'PASS' : 'FAIL';
}

function reviewGateAttemptAuthority(result = {}, opts = {}) {
  return Number(selectDefinedValue(() => (result?.attempt), () => (opts?.input?.ids?.attempt)));
}

function reviewGateIdAuthority(result = {}, gateId) {
  return selectTruthyValue(() => (result?.gate), () => (gateId));
}

function reviewAttemptAuthority(result = {}, attempt) {
  return selectDefinedValue(() => (result?.review_attempt), () => (attempt));
}

function buildReviewControlFindings(result = {}, gateId, issues = [], failureClass = null) {
  if (issues.length > 0) return buildReviewGateFindings(issues);
  if (isReviewGatePassResult(result)) return [];
  const finding = REVIEW_GATE_FAILURE_FINDINGS[failureClass];
  if (!finding) {
    throw new Error(`Review failure_class '${failureClass}' does not have a registered finding mapping`);
  }
  return [{
    code: finding.code,
    severity: finding.severity,
    message: reviewReason(result, `Review gate '${gateId}' failed`),
    category: 'review',
    target: selectTruthyValue(() => (gateId), () => (null)),
    retryable: finding.retryable,
    environmentIssue: finding.environmentIssue,
  }];
}

function isReviewGatePassResult(result = {}) {
  return result?.outcome_class === 'passed';
}

export function buildReviewGateControlResult(config, gateId, gate, result = {}, opts = {}) {
  const failureClass = requireReviewFailureClass(result, gateId);
  const decision = reviewGateDecisionForResult(result, failureClass);
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (getRunId(config)), () => (config?._runId))), () => (config?.run_id))), () => (null));
  const attempt = reviewGateAttemptAuthority(result, opts);
  const summary = buildReviewControlSummary(gateId, result);
  const issues = extractReviewIssues(selectTruthyValue(() => (result?.last_review), () => (null)));
  const findings = buildReviewControlFindings(result, gateId, issues, failureClass);
  const rateLimit = decision.outcomeClass === 'rate_limited'
    ? {
        max_rate_limit_pauses: selectDefinedValue(() => (selectDefinedValue(() => (result?.max_rate_limit_pauses), () => (result?.rate_limit_status?.max_rate_limit_pauses))), () => (null)),
        rate_limit_pauses: selectDefinedValue(() => (result?.rate_limit_pauses), () => (null)),
        rate_limit_status: cloneSerializable(selectTruthyValue(() => (result?.rate_limit_status), () => (null))),
      }
    : null;
  const metadata = {
    gate_id: gateId,
    gate_type: gateType(gate),
    run_id: runId,
    gate: reviewGateIdAuthority(result, gateId),
    reason: selectTruthyValue(() => (result?.reason), () => (null)),
    failure_class: failureClass,
    attempt,
    review_attempt: reviewAttemptAuthority(result, attempt),
    fix_cycles: selectDefinedValue(() => (result?.fix_cycles), () => (REVIEW_GATE_ZERO_FIX_CYCLES)),
    dispatch_id: selectTruthyValue(() => (result?.dispatch_id), () => (null)),
    gateway_label: selectTruthyValue(() => (result?.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (result?.session_key), () => (null)),
    last_review: cloneSerializable(selectTruthyValue(() => (result?.last_review), () => (null))),
    domain_status: selectTruthyValue(() => (result?.status), () => (null)),
  };

  return buildTypedGateControlResult({
    producerType: 'review',
    nextAction: decision.nextAction,
    issueType: decision.issueType,
    summary,
    findings,
    metadata,
    gateRunStatus: canonicalReviewGateRunStatus(result),
    outcomeClass: decision.outcomeClass,
    recommendation: decision.nextAction === 'pass' ? 'proceed' : 'stop',
    rateLimit,
    metrics: {
      attempt,
      fix_cycles: selectDefinedValue(() => (result?.fix_cycles), () => (REVIEW_GATE_ZERO_FIX_CYCLES)),
      issues_count: issues.length,
      blockers_count: selectDefinedValue(() => (result?.critical_issues_count), () => (null)),
      duration_seconds: selectDefinedValue(() => (result?.duration_seconds), () => (null)),
    },
  });
}

export function isReviewGateControlResult(result) {
  return isTypedGateControlResult(result, 'review');
}

export function coerceReviewGateControlResult(config, gateId, gate, result) {
  return coerceTypedGateControlResult(result, { producerType: 'review' });
}
