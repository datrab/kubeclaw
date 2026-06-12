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
import { buildGateRemediationRequestControlResult } from '../services/remediation-handoff.ts';
import {
  buildReviewGateFindings,
  extractReviewIssues,
  summarizeReviewNoGoReason,
} from './review-gate-output.ts';

export const REVIEW_GATE_FAILURE_CLASSES = Object.freeze([
  'config_invalid',
  'invalid_contract',
  'rate_limit_exhausted',
  'review_failed',
  'unknown_failure',
  'verdict_fail',
]);

const REVIEW_GATE_FAILURE_DECISIONS = Object.freeze({
  'config_invalid': { issueType: 'unknown', outcomeClass: 'error' },
  'invalid_contract': { issueType: 'unknown', outcomeClass: 'error' },
  'rate_limit_exhausted': { issueType: 'environment', outcomeClass: 'rate_limited' },
  'review_failed': { issueType: 'environment', outcomeClass: 'error' },
  'unknown_failure': { issueType: 'unknown', outcomeClass: 'error' },
  'verdict_fail': { issueType: 'code', outcomeClass: 'needs_nova' },
});

const REVIEW_GATE_FAILURE_FINDINGS = Object.freeze({
  'config_invalid': { code: 'REVIEW_GATE_CONFIG_INVALID', severity: 'critical', retryable: false, environmentIssue: false },
  'invalid_contract': { code: 'REVIEW_GATE_INVALID_CONTRACT', severity: 'critical', retryable: false, environmentIssue: false },
  'rate_limit_exhausted': { code: 'REVIEW_GATE_RATE_LIMIT_EXHAUSTED', severity: 'error', retryable: true, environmentIssue: true },
  'review_failed': { code: 'REVIEW_GATE_REVIEW_FAILED', severity: 'error', retryable: true, environmentIssue: true },
  'unknown_failure': { code: 'REVIEW_GATE_UNKNOWN_FAILURE', severity: 'error', retryable: false, environmentIssue: false },
  'verdict_fail': { code: 'REVIEW_GATE_VERDICT_FAIL', severity: 'error', retryable: false, environmentIssue: false },
});

function buildReviewControlSummary(gateId, result = {}) {
  if (isReviewGatePassResult(result)) {
    return `Review gate '${gateId}' passed`;
  }
  if (result?.failure_class === 'rate_limit_exhausted' || result?.outcome_class === 'rate_limited') {
    return result?.reason || `Review gate '${gateId}' exceeded max rate limit pauses`;
  }
  if (result?.outcome_class === 'needs_nova') {
    return result?.reason || `Review gate '${gateId}' requires Nova intervention`;
  }
  return result?.reason || `Review gate '${gateId}' failed`;
}

function requireReviewFailureClass(result = {}, gateId = '') {
  if (isReviewGatePassResult(result)) return null;
  const failureClass = String(result?.failure_class || '').trim().toLowerCase();
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
    message: result?.reason || `Review gate '${gateId}' failed`,
    category: 'review',
    target: gateId || null,
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
  const runId = getRunId(config) || config?._runId || config?.run_id || null;
  const attempt = Number(result?.attempt ?? opts?.input?.ids?.attempt);
  const summary = buildReviewControlSummary(gateId, result);
  const issues = extractReviewIssues(result?.last_review || null);
  const findings = buildReviewControlFindings(result, gateId, issues, failureClass);
  const rateLimit = decision.outcomeClass === 'rate_limited'
    ? {
        max_rate_limit_pauses: result?.max_rate_limit_pauses ?? result?.rate_limit_status?.max_rate_limit_pauses ?? null,
        rate_limit_pauses: result?.rate_limit_pauses ?? null,
        rate_limit_status: cloneSerializable(result?.rate_limit_status || null),
      }
    : null;
  const metadata = {
    gate_id: gateId,
    gate_type: gate?.type || 'review',
    run_id: runId,
    gate: result?.gate || gateId,
    reason: result?.reason || null,
    failure_class: failureClass,
    attempt,
    review_attempt: result?.review_attempt ?? attempt,
    fix_cycles: result?.fix_cycles ?? 0,
    dispatch_id: result?.dispatch_id || null,
    gateway_label: result?.gateway_label || null,
    session_key: result?.session_key || null,
    last_review: cloneSerializable(result?.last_review || null),
    domain_status: result?.status || null,
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
      fix_cycles: result?.fix_cycles ?? 0,
      issues_count: issues.length,
    },
  });
}

export function isReviewGateControlResult(result) {
  return isTypedGateControlResult(result, 'review');
}

export function coerceReviewGateControlResult(config, gateId, gate, result) {
  return coerceTypedGateControlResult(result, { producerType: 'review' });
}

export function buildReviewRequestFixControlResult(config, gateId, gate, reviewResult, reviewConfig, opts = {}) {
  const attempt = Number(opts.attempt || 1);
  const issues = opts.issues || extractReviewIssues(reviewResult?.mergedResult);
  const reviewerLabel = opts.reviewerLabel || reviewConfig?.primaryReviewer?.label || null;
  if (!reviewerLabel) throw new Error(`Review gate '${gateId}' remediation requires explicit reviewerLabel or typed primaryReviewer`);
  if (!('gatewayLabel' in opts) || !('sessionKey' in opts)) throw new Error(`Review gate '${gateId}' remediation requires explicit correlation`);
  const gatewayLabel = opts.gatewayLabel ?? null;
  const sessionKey = opts.sessionKey ?? null;
  const summary = summarizeReviewNoGoReason(issues, reviewResult?.mergedResult);

  return buildGateRemediationRequestControlResult({
    producerType: 'review',
    gateId,
    gateType: gate?.type || 'review',
    runId: getRunId(config) || config?._runId || config?.run_id || null,
    attempt,
    summary,
    findings: buildReviewGateFindings(issues),
    metadata: {
      gate_id: gateId,
      gate_type: gate?.type || 'review',
      run_id: getRunId(config) || config?._runId || config?.run_id || null,
      attempt,
      reason: summary,
      reviewer_label: reviewerLabel,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      issues_count: issues.length,
      last_review: cloneSerializable(reviewResult?.mergedResult || null),
    },
    remediation: {
      policy: {
        maxFixCycles: reviewConfig?.maxFixCycles,
        nextFixCycle: attempt,
        rerunStageId: 'gate:review',
      },
      targetRef: `gate:${gateId}`,
      startedAt: opts.gateStartedAt ? new Date(opts.gateStartedAt).toISOString() : null,
      correlation: {
        gateway_label: gatewayLabel,
        session_key: sessionKey,
      },
      diagnostics: {
        issues: cloneSerializable(issues),
        last_review: cloneSerializable(reviewResult?.mergedResult || null),
        merged_file_path: reviewResult?.mergedFilePath || null,
      },
    },
  });
}
