// runners/buster-gate-control.js — Buster gate typed-control and issue mapping helpers
// Keep this module free of runner lifecycle, spawning, polling, and Discord side effects.

import { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_TIMEOUT, EXIT_RATE_LIMITED } from '../core/constants.ts';
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
  'fix_loop_exhausted',
  'git_error',
  'instructions_read_failed',
  'invalid_contract',
  'parse_corrupted',
  'rate_limit_exhausted',
  'spawn_failed',
  'timeout',
  'unexpected_exit',
  'unknown_failure',
  'verdict_fail',
]);

function requireBusterFailureClass(result = {}, gateId = '') {
  if (result?.exit === EXIT_OK) return null;
  const failureClass = String(result?.failure_class || '').trim().toLowerCase();
  if (!failureClass) {
    throw new Error(`Buster gate '${gateId}' non-pass result requires explicit failure_class`);
  }
  if (!BUSTER_GATE_FAILURE_CLASSES.includes(failureClass)) {
    throw new Error(`Buster gate '${gateId}' failure_class '${failureClass}' is not registered`);
  }
  return failureClass;
}

function buildBusterGateControlSummary(gateId, result = {}) {
  if (result?.exit === EXIT_OK) {
    const source = result?.completion_source ? ` via ${result.completion_source}` : '';
    return `Buster gate '${gateId}' passed${source}`;
  }
  return result?.reason || `Buster gate '${gateId}' failed`;
}

function busterGateDecisionForResult(result = {}, failureClass = null) {
  if (result?.exit === EXIT_OK) {
    return { nextAction: GATE_CONTROL_ACTIONS.PASS, issueType: undefined, outcomeClass: 'passed' };
  }
  const normalizedFailureClass = String(failureClass || '').trim().toLowerCase();
  if (['verdict_fail', 'fix_loop_exhausted'].includes(normalizedFailureClass)) {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'code', outcomeClass: 'needs_nova' };
  }
  if (normalizedFailureClass === 'rate_limit_exhausted') {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'environment', outcomeClass: 'rate_limited' };
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
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'unknown', outcomeClass: 'error' };
  }
  if (['parse_corrupted', 'unexpected_exit', 'config_invalid'].includes(normalizedFailureClass)) {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'unknown', outcomeClass: 'needs_nova' };
  }
  return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'unknown', outcomeClass: 'error' };
}

function buildBusterGateFindings(result = {}, gateId, failureClass = null) {
  if (result?.exit === EXIT_OK) return [];
  return [{
    code: `BUSTER_GATE_${String(failureClass || 'FAILED').toUpperCase()}`,
    severity: failureClass === 'parse_corrupted' ? 'critical' : 'error',
    message: result?.reason || `Buster gate '${gateId}' failed`,
    category: 'buster_gate',
    target: gateId || null,
    retryable: false,
    environmentIssue: ['rate_limit_exhausted', 'timeout', 'spawn_failed', 'completion_archive_failed', 'completion_event_adapter_failed', 'completion_event_unresolved'].includes(failureClass),
  }];
}

export function buildBusterIssueFindings(issues = []) {
  return (issues || []).map((issue = {}, index) => ({
    code: `BUSTER_ISSUE_${index + 1}`,
    severity: issue.severity === 'critical' ? 'critical' : 'error',
    message: issue.title || issue.description || 'Buster gate issue',
    category: 'buster_gate',
    target: Array.isArray(issue.affected_files) && issue.affected_files.length > 0
      ? issue.affected_files[0]
      : issue.affected_module || null,
    retryable: false,
    environmentIssue: false,
    metadata: {
      description: issue.description || null,
      severity: issue.severity || null,
      reproduction: issue.reproduction || null,
      affected_files: cloneSerializable(issue.affected_files || []),
    },
  }));
}

function requireTypedRemediationPolicy(policy = null) {
  const nextFixCycle = Number(policy?.nextFixCycle);
  const maxFixCycles = Number(policy?.maxFixCycles);
  const rerunStageId = typeof policy?.rerunStageId === 'string' && policy.rerunStageId
    ? policy.rerunStageId
    : null;
  if (!Number.isFinite(nextFixCycle) || nextFixCycle < 1) {
    throw new Error('Buster remediation policy must include a positive nextFixCycle');
  }
  if (!Number.isFinite(maxFixCycles) || maxFixCycles < 1) {
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
  const runId = result?.run_id || config?._runId || config?.run_id || null;
  const metadata = {
    gate_id: gateId,
    gate_type: gate?.type || 'buster',
    run_id: runId,
    gate: result?.gate || gateId,
    reason: result?.reason || null,
    failure_class: failureClass,
    completion_source: result?.completion_source || null,
    fix_attempts: result?.fix_attempts ?? null,
    attempt: result?.attempt ?? opts?.input?.ids?.attempt ?? null,
    gateway_label: result?.gateway_label || null,
    session_key: result?.session_key || null,
    dispatch_id: result?.dispatch_id || null,
    max_rate_limit_pauses: result?.max_rate_limit_pauses ?? result?.rate_limit_status?.max_rate_limit_pauses ?? null,
    rate_limit_status: cloneSerializable(result?.rate_limit_status || null),
    status: cloneSerializable(result?.status || null),
    polling_git: cloneSerializable(result?.polling_git || null),
    remaining_issues: cloneSerializable(result?.remaining_issues || null),
  };

  return buildTypedGateControlResult({
    producerType: 'buster',
    nextAction: decision.nextAction,
    issueType: decision.issueType,
    summary: buildBusterGateControlSummary(gateId, result),
    findings: buildBusterGateFindings(result, gateId, failureClass),
    metadata,
    gateRunStatus: result?.exit === EXIT_OK ? STATUS.PASS : STATUS.FAIL,
    outcomeClass: decision.outcomeClass,
    recommendation: decision.nextAction === 'pass' ? 'proceed' : 'stop',
    metrics: {
      fix_attempts: result?.fix_attempts ?? 0,
      completion_source: result?.completion_source || null,
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
      .filter(i => i.severity === 'critical' || i.severity === 'moderate' || !i.severity)
      .map(i => ({
        title: i.title || 'Unknown issue',
        description: i.description || '',
        affected_module: i.affected_module || null,
        affected_files: i.affected_files || [],
        severity: i.severity || 'unknown',
        reproduction: i.reproduction || null,
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
            title: `${suiteName}: ${f.message || 'test failure'}`,
            description: f.rule ? `Rule: ${f.rule}` : '',
            severity: f.severity || 'critical',
            affected_files: f.file ? [f.file] : [],
          });
        }
      } else {
        issues.push({
          title: `${suiteName}: ${suite.error || suite.reason || 'failed'}`,
          description: `Suite ${suiteName} ${suite.status} with ${suite.checks_failed || 0} check(s) failed`,
          severity: suite.critical ? 'critical' : 'moderate',
          affected_files: [],
        });
      }
    }
    if (issues.length > 0) return issues;
  }

  const reason = data.reason || data.summary || 'Gate test failed without details';
  return [{ title: 'Gate test failure', description: reason, severity: 'unknown', affected_files: [] }];
}



export function buildBusterRequestFixControlResult(config, gateId, gate, failData = {}, issues = [], opts = {}) {
  const remediationPolicy = requireTypedRemediationPolicy(opts.remediationPolicy);
  const attempt = remediationPolicy.nextFixCycle;
  const failReason = issues.map((issue = {}) => issue.title).filter(Boolean).join('; ') || 'unknown (no error detail available)';
  if (!('dispatchId' in opts) || !('gatewayLabel' in opts) || !('sessionKey' in opts)) throw new Error(`Buster gate '${gateId}' remediation requires explicit correlation`);
  const dispatchId = opts.dispatchId ?? null;
  const gatewayLabel = opts.gatewayLabel ?? null;
  const sessionKey = opts.sessionKey ?? null;

  return buildGateRemediationRequestControlResult({
    producerType: 'buster',
    gateId,
    gateType: gate?.type || 'buster',
    runId: getRunId(config) || config?._runId || config?.run_id || null,
    attempt,
    summary: failReason,
    findings: buildBusterIssueFindings(issues),
    metadata: {
      gate_id: gateId,
      gate_type: gate?.type || 'buster',
      run_id: getRunId(config) || config?._runId || config?.run_id || null,
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
