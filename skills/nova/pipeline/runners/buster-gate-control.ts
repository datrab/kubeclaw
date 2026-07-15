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

export const BUSTER_GATE_FAILURE_CLASSES = Object.freeze([
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

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function gateType(gate) {
  return selectDefinedValue(() => (nonEmptyString(gate?.type)), () => ('missing_gate_type'));
}

function fixAttemptsMetric(result) {
  return selectDefinedValue(() => (result?.fix_attempts), () => (0));
}

function issueTitleSummary(issues) {
  const titles = arrayValue(issues)
    .map((issue) => objectRecord(issue)?.title)
    .filter(Boolean);
  return selectTruthyValue(() => (titles.join('; ')), () => ('missing_error_detail'));
}

function requireBusterFailureClass(result = {}, gateId = '') {
  if (isBusterGatePassResult(result)) return null;
  const failureClass = (selectDefinedValue(() => (nonEmptyString(result?.failure_class)), () => (''))).toLowerCase();
  if (!failureClass) {
    throw new Error(`Buster gate '${gateId}' non-pass result requires explicit failure_class`);
  }
  if (!BUSTER_GATE_FAILURE_CLASSES.includes(failureClass)) {
    throw new Error(`Buster gate '${gateId}' failure_class '${failureClass}' is not registered`);
  }
  return failureClass;
}

function buildBusterGateControlSummary(gateId, result = {}) {
  if (isBusterGatePassResult(result)) {
    const source = result?.completion_source ? ` via ${result.completion_source}` : '';
    return `Buster gate '${gateId}' passed${source}`;
  }
  return selectPresentValue(result?.reason, `Buster gate '${gateId}' failed`);
}

function busterGateResultGateId(result = {}, gateId = '') {
  const resultGate = nonEmptyString(result?.gate);
  if (resultGate) return resultGate;
  const configuredGate = nonEmptyString(gateId);
  if (configuredGate) return configuredGate;
  throw new Error('Buster gate control result requires gate id');
}

function busterGateDecisionForResult(result = {}, failureClass = null) {
  if (isBusterGatePassResult(result)) {
    return { nextAction: GATE_CONTROL_ACTIONS.PASS, issueType: undefined, outcomeClass: 'passed' };
  }
  const normalizedFailureClass = (selectDefinedValue(() => (nonEmptyString(failureClass)), () => (''))).toLowerCase();
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

function buildBusterGateFindings(result = {}, gateId, failureClass = null) {
  if (isBusterGatePassResult(result)) return [];
  return [{
    code: `BUSTER_GATE_${(selectDefinedValue(() => (nonEmptyString(failureClass)), () => ('FAILED'))).toUpperCase()}`,
    severity: failureClass === 'parse_corrupted' ? 'critical' : 'error',
    message: selectPresentValue(result?.reason, `Buster gate '${gateId}' failed`),
    category: 'buster_gate',
    target: selectTruthyValue(() => (gateId), () => (null)),
    retryable: false,
    environmentIssue: ['rate_limit_exhausted', 'k8s_infra_unavailable', 'timeout', 'spawn_failed', 'completion_archive_failed', 'completion_event_adapter_failed', 'completion_event_unresolved'].includes(failureClass),
  }];
}

export function buildBusterIssueFindings(issues = []) {
  return arrayValue(issues).map((issue, index) => {
    const record = selectDefinedValue(() => (objectRecord(issue)), () => ({}));
    return ({
    code: `BUSTER_ISSUE_${index + 1}`,
    severity: record.severity === 'critical' ? 'critical' : 'error',
    message: selectPresentValue(record.title, record.description, 'Buster gate issue'),
    category: 'buster_gate',
    target: Array.isArray(record.affected_files) && record.affected_files.length > 0
      ? record.affected_files[0]
      : selectDefinedValue(() => (record.affected_module), () => (null)),
    retryable: false,
    environmentIssue: false,
    metadata: {
      description: selectDefinedValue(() => (record.description), () => (null)),
      severity: selectDefinedValue(() => (record.severity), () => (null)),
      reproduction: selectDefinedValue(() => (record.reproduction), () => (null)),
      affected_files: cloneSerializable(arrayValue(record.affected_files)),
    },
    });
  });
}

function isBusterGatePassResult(result = {}) {
  return selectTruthyValue(() => (selectTruthyValue(() => (result?.passed === true), () => (result?.outcome_class === 'passed'))), () => ((selectDefinedValue(() => (nonEmptyString(result?.status)), () => (''))).toUpperCase() === 'PASS'));
}

function requireTypedRemediationPolicy(policy = null) {
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

export function buildBusterGateControlResult(config, gateId, gate, result = {}, opts = {}) {
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

export function isBusterGateControlResult(result) {
  return isTypedGateControlResult(result, 'buster');
}

export function coerceBusterGateControlResult(config, gateId, gate, result) {
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
export function extractGateIssues(gateResult) {
  if (!gateResult) return [];

  const data = gateResult;

  if (Array.isArray(data.issues)) {
    return data.issues
      .filter(i => selectTruthyValue(() => (selectTruthyValue(() => (i.severity === 'critical'), () => (i.severity === 'moderate'))), () => (!i.severity)))
      .map(i => ({
        title: selectDefinedValue(() => (i.title), () => ('buster_issue_title_missing')),
        description: selectDefinedValue(() => (i.description), () => ('')),
        affected_module: selectDefinedValue(() => (i.affected_module), () => (null)),
        affected_files: arrayValue(i.affected_files),
        severity: selectDefinedValue(() => (i.severity), () => ('error')),
        reproduction: selectDefinedValue(() => (i.reproduction), () => (null)),
      }));
  }

  // Verdict JSON from the Buster Pipeline (enriched Redis FAIL) — extract per-suite failures
  const verdict = data.verdict;
  if (verdict?.suites) {
    const issues = [];
    for (const [suiteName, suite] of Object.entries(verdict.suites)) {
      if (suite.status !== 'FAIL' && suite.status !== 'ERROR') continue;
      if (suite.findings?.length > 0) {
        for (const f of suite.findings.slice(0, 5)) {
          issues.push({
            title: `${suiteName}: ${selectDefinedValue(() => (f.message), () => ('test failure'))}`,
            description: f.rule ? `Rule: ${f.rule}` : '',
            severity: selectDefinedValue(() => (f.severity), () => ('critical')),
            affected_files: f.file ? [f.file] : [],
          });
        }
      } else {
        issues.push({
          title: `${suiteName}: ${selectPresentValue(suite.error, suite.reason, 'failed')}`,
          description: `Suite ${suiteName} ${suite.status} with ${selectDefinedValue(() => (suite.checks_failed), () => (0))} check(s) failed`,
          severity: suite.critical ? 'critical' : 'moderate',
          affected_files: [],
        });
      }
    }
    if (issues.length > 0) return issues;
  }

  const reason = selectPresentValue(data.reason, data.summary, 'Gate test failed without details');
  return [{ title: 'Gate test failure', description: reason, severity: 'error', affected_files: [] }];
}



export function buildBusterRequestFixControlResult(config, gateId, gate, failData = {}, issues = [], opts = {}) {
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
