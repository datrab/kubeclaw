import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/buster-gate-control.js — Buster gate typed-control and issue mapping helpers
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
import { buildBusterIssueFindings } from './buster-gate-issues.ts';
export { buildBusterIssueFindings, extractGateIssues } from './buster-gate-issues.ts';

const BUSTER_GATE_FAILURE_CLASSES = Object.freeze([
  'config_invalid',
  'completion_archive_failed',
  'completion_conflict',
  'completion_event_adapter_failed',
  'completion_event_unresolved',
  'commit_hash_missing',
  'fix_loop_exhausted',
  'git_error',
  'instructions_read_failed',
  'invalid_contract',
  'k8s_infra_unavailable',
  'parse_corrupted',
  'rate_limit_exhausted',
  'spawn_failed',
  'timeout',
  'unexpected_exit',
  'classification_missing',
  'verdict_fail',
]);

function objectRecord(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function arrayValue(value: any) {
  return Array.isArray(value) ? value : [];
}

function nonEmptyString(value: any) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function selectPresentValue(...values: any) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function gateType(gate: any) {
  return selectDefinedValue(() => (nonEmptyString(gate?.type)), () => ('missing_gate_type'));
}

function fixAttemptsMetric(result: any) {
  return selectDefinedValue(() => (result?.fix_attempts), () => (0));
}

function issueTitleSummary(issues: any) {
  const titles = arrayValue(issues)
    .map((issue: any) => objectRecord(issue)?.title)
    .filter(Boolean);
  return selectTruthyValue(() => (titles.join('; ')), () => ('missing_error_detail'));
}

function requireBusterFailureClass(result: any = {}, gateId: any = '') {
  if (isBusterGatePassResult(result)) return null;
  const failureClass = (nonEmptyString(result?.failure_class) ?? '').toLowerCase();
  if (!failureClass) {
    throw new Error(`Buster gate '${gateId}' non-pass result requires explicit failure_class`);
  }
  if (!BUSTER_GATE_FAILURE_CLASSES.includes(failureClass)) {
    throw new Error(`Buster gate '${gateId}' failure_class '${failureClass}' is not registered`);
  }
  return failureClass;
}

function buildBusterGateControlSummary(gateId: any, result: any = {}) {
  if (isBusterGatePassResult(result)) {
    const source = result?.completion_source ? ` via ${result.completion_source}` : '';
    return `Buster gate '${gateId}' passed${source}`;
  }
  return selectPresentValue(result?.reason, `Buster gate '${gateId}' failed`);
}

function busterGateResultGateId(result: any = {}, gateId: any = '') {
  const resultGate = nonEmptyString(result?.gate);
  if (resultGate) return resultGate;
  const configuredGate = nonEmptyString(gateId);
  if (configuredGate) return configuredGate;
  throw new Error('Buster gate control result requires gate id');
}

function busterGateDecisionForResult(result: any = {}, failureClass: any = null) {
  if (isBusterGatePassResult(result)) {
    return { nextAction: GATE_CONTROL_ACTIONS.PASS, issueType: undefined, outcomeClass: 'passed' };
  }
  const normalizedFailureClass = (nonEmptyString(failureClass) ?? '').toLowerCase();
  if (['verdict_fail', 'fix_loop_exhausted'].includes(normalizedFailureClass)) {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'code', outcomeClass: 'needs_nova' };
  }
  if (normalizedFailureClass === 'rate_limit_exhausted') {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'environment', outcomeClass: 'rate_limited' };
  }
  if (normalizedFailureClass === 'k8s_infra_unavailable') {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'environment', outcomeClass: 'error' };
  }
  if (normalizedFailureClass === 'timeout') {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'environment', outcomeClass: 'timeout' };
  }
  if (['spawn_failed', 'instructions_read_failed'].includes(normalizedFailureClass)) {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'environment', outcomeClass: 'error' };
  }
  if (['completion_archive_failed', 'completion_event_adapter_failed', 'completion_event_unresolved'].includes(normalizedFailureClass)) {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'environment', outcomeClass: 'error' };
  }
  if (normalizedFailureClass === 'completion_conflict') {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'contract', outcomeClass: 'error' };
  }
  if (['parse_corrupted', 'unexpected_exit', 'config_invalid', 'commit_hash_missing'].includes(normalizedFailureClass)) {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'contract', outcomeClass: 'needs_nova' };
  }
  return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'contract', outcomeClass: 'error' };
}

function buildBusterGateFindings(result: any = {}, gateId: any, failureClass: any = null) {
  if (isBusterGatePassResult(result)) return [];
  return [{
    code: `BUSTER_GATE_${(nonEmptyString(failureClass) ?? 'FAILED').toUpperCase()}`,
    severity: failureClass === 'parse_corrupted' ? 'critical' : 'error',
    message: selectPresentValue(result?.reason, `Buster gate '${gateId}' failed`),
    category: 'buster_gate',
    target: selectTruthyValue(() => (gateId), () => (null)),
    retryable: false,
    environmentIssue: ['rate_limit_exhausted', 'k8s_infra_unavailable', 'timeout', 'spawn_failed', 'completion_archive_failed', 'completion_event_adapter_failed', 'completion_event_unresolved'].includes(failureClass),
  }];
}

function isBusterGatePassResult(result: any = {}) {
  return selectTruthyValue(() => (selectTruthyValue(() => (result?.passed === true), () => (result?.outcome_class === 'passed'))), () => ((nonEmptyString(result?.status) ?? '').toUpperCase() === 'PASS'));
}

function requireTypedRemediationPolicy(policy: any = null) {
  const nextFixCycle = Number(policy?.nextFixCycle);
  const maxFixCycles = Number(policy?.maxFixCycles);
  const rerunStageId = typeof policy?.rerunStageId === 'string' && policy.rerunStageId
    ? policy.rerunStageId
    : null;
  if (selectTruthyValue(() => (!Number.isFinite(nextFixCycle)), () => (nextFixCycle < 1))) {
    throw new Error('Buster remediation policy must include a positive nextFixCycle');
  }
  if (selectTruthyValue(() => (!Number.isFinite(maxFixCycles)), () => (maxFixCycles < 1))) {
    throw new Error('Buster remediation policy must include a positive maxFixCycles');
  }
  if (!rerunStageId) {
    throw new Error('Buster remediation policy must include rerunStageId');
  }
  return { nextFixCycle, maxFixCycles, rerunStageId };
}

export function buildBusterGateControlResult(config: any, gateId: any, gate: any, result: any = {}, opts: any = {}) {
  const failureClass = requireBusterFailureClass(result, gateId);
  const decision = busterGateDecisionForResult(result, failureClass);
  const runId = selectPresentValue(result?.run_id, config?._runId, config?.run_id);
  const rateLimit = decision.outcomeClass === 'rate_limited'
    ? {
        max_rate_limit_pauses: selectDefinedValue(() => (selectDefinedValue(() => (result?.max_rate_limit_pauses), () => (result?.rate_limit_status?.max_rate_limit_pauses))), () => (null)),
        rate_limit_pauses: selectDefinedValue(() => (result?.rate_limit_pauses), () => (null)),
        rate_limit_status: cloneSerializable(selectDefinedValue(() => (result?.rate_limit_status), () => (null))),
      }
    : null;
  const metadata = {
    gate_id: gateId,
    gate_type: gateType(gate),
    run_id: runId,
    gate: busterGateResultGateId(result, gateId),
    reason: selectDefinedValue(() => (result?.reason), () => (null)),
    failure_class: failureClass,
    completion_source: selectDefinedValue(() => (result?.completion_source), () => (null)),
    fix_attempts: selectDefinedValue(() => (result?.fix_attempts), () => (null)),
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (result?.attempt), () => (opts?.input?.ids?.attempt))), () => (null)),
    gateway_label: selectDefinedValue(() => (result?.gateway_label), () => (null)),
    session_key: selectDefinedValue(() => (result?.session_key), () => (null)),
    dispatch_id: selectDefinedValue(() => (result?.dispatch_id), () => (null)),
    status: cloneSerializable(selectDefinedValue(() => (result?.status), () => (null))),
    polling_git: cloneSerializable(selectDefinedValue(() => (result?.polling_git), () => (null))),
    remaining_issues: cloneSerializable(selectDefinedValue(() => (result?.remaining_issues), () => (null))),
  };

  return buildTypedGateControlResult({
    producerType: 'buster',
    nextAction: decision.nextAction,
    issueType: decision.issueType,
    summary: buildBusterGateControlSummary(gateId, result),
    findings: buildBusterGateFindings(result, gateId, failureClass),
    metadata,
    gateRunStatus: isBusterGatePassResult(result) ? 'PASS' : 'FAIL',
    outcomeClass: decision.outcomeClass,
    recommendation: decision.nextAction === 'pass' ? 'proceed' : 'stop',
    rateLimit,
    metrics: {
      fix_attempts: fixAttemptsMetric(result),
      completion_source: selectDefinedValue(() => (result?.completion_source), () => (null)),
    },
  });
}

function isBusterGateControlResult(result: any) {
  return isTypedGateControlResult(result, 'buster');
}

export function coerceBusterGateControlResult(config: any, gateId: any, gate: any, result: any) {
  return coerceTypedGateControlResult(result, { producerType: 'buster' });
}

/**
 * Extract actionable issues from a Buster gate result for Forge to fix.
 *
 * Input shapes (depending on poll source):
 *   Redis:       { gate, status: 'FAIL', reason: '...', source: 'buster-pipeline', verdict: {...} }
 *   Output file: { status: 'FAIL', issues: [...] }
 *   gate-status: { status: 'FAIL', reason: '...' }
 */
export function buildBusterRequestFixControlResult(config: any, gateId: any, gate: any, failData: any = {}, issues: any = [], opts: any = {}) {
  const remediationPolicy = requireTypedRemediationPolicy(opts.remediationPolicy);
  const attempt = remediationPolicy.nextFixCycle;
  const failReason = issueTitleSummary(issues);
  if (selectTruthyValue(() => (selectTruthyValue(() => (!('dispatchId' in opts)), () => (!('gatewayLabel' in opts)))), () => (!('sessionKey' in opts)))) throw new Error(`Buster gate '${gateId}' remediation requires explicit correlation`);
  const dispatchId = selectDefinedValue(() => (opts.dispatchId), () => (null));
  const gatewayLabel = selectDefinedValue(() => (opts.gatewayLabel), () => (null));
  const sessionKey = selectDefinedValue(() => (opts.sessionKey), () => (null));

  return buildGateRemediationRequestControlResult({
    producerType: 'buster',
    gateId,
    gateType: gateType(gate),
    runId: selectPresentValue(getRunId(config), config?._runId, config?.run_id),
    attempt,
    summary: failReason,
    findings: buildBusterIssueFindings(issues),
    metadata: {
      gate_id: gateId,
      gate_type: gateType(gate),
      run_id: selectPresentValue(getRunId(config), config?._runId, config?.run_id),
      attempt,
      reason: failReason,
      failure_class: 'verdict_fail',
      issues_count: issues.length,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      status: cloneSerializable(failData),
    },
    remediation: {
      policy: remediationPolicy,
      targetRef: `gate:${gateId}`,
      startedAt: opts.gateStartedAt ? new Date(opts.gateStartedAt).toISOString() : null,
      correlation: {
        dispatch_id: dispatchId,
        gateway_label: gatewayLabel,
        session_key: sessionKey,
      },
      diagnostics: {
        issues: cloneSerializable(issues),
        status: cloneSerializable(failData),
        fail_reason: failReason,
      },
    },
  });
}
