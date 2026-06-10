// runners/approval-gate-control.js — typed control-result helpers for approval gates

import {
  GATE_CONTROL_ACTIONS,
  buildTypedGateControlResult,
  coerceTypedGateControlResult,
  isTypedGateControlResult,
} from '../services/contracts/gate-control-result.ts';
import {
  APPROVAL_STATUS,
  resolveApprovalTimeoutPolicyFromState,
} from './approval-gate-shared.ts';

function buildApprovalControlSummary(gateId, result = {}) {
  const status = String(result?.status || '').trim().toUpperCase();
  if (isApprovalGatePassResult(result) && status === APPROVAL_STATUS.APPROVED) {
    return `Approval gate '${gateId}' approved`;
  }
  if (isApprovalGatePassResult(result) && status === APPROVAL_STATUS.TIMED_OUT && result?.continued === true) {
    return `Approval gate '${gateId}' timed out and auto-continued`;
  }
  if (status === APPROVAL_STATUS.REJECTED) {
    return result?.reason || `Approval gate '${gateId}' rejected`;
  }
  if (status === APPROVAL_STATUS.CANCELLED) {
    return result?.reason || `Approval gate '${gateId}' cancelled`;
  }
  if (status === APPROVAL_STATUS.TIMED_OUT) {
    return result?.reason || `Approval gate '${gateId}' timed out`;
  }
  if (result?.status === 'CORRUPTED_STATE' || result?.corrupted_state === true) {
    return result?.reason || `Approval gate '${gateId}' has corrupted persisted state`;
  }
  return result?.reason || `Approval gate '${gateId}' failed`;
}

function buildApprovalFindings(result = {}) {
  const status = String(result?.status || '').trim().toUpperCase();
  if (isApprovalGatePassResult(result)) return [];

  if (result?.status === 'CORRUPTED_STATE' || result?.corrupted_state === true) {
    return [{
      code: 'APPROVAL_STATE_CORRUPTED',
      severity: 'critical',
      message: result?.reason || 'Approval gate persisted state is corrupted',
      category: 'approval',
      target: result?.gate_id || null,
      retryable: false,
      environmentIssue: false,
    }];
  }

  return [{
    code: `APPROVAL_${status || 'FAILED'}`,
    severity: 'error',
    message: result?.reason || `Approval gate resolved as ${status || 'FAILED'}`,
    category: 'approval',
    target: result?.gate_id || null,
    retryable: false,
    environmentIssue: false,
  }];
}

function approvalGateDecisionForResult(result = {}) {
  const status = String(result?.status || '').trim().toUpperCase();
  if (isApprovalGatePassResult(result)) {
    if (status === APPROVAL_STATUS.TIMED_OUT && result?.continued === true) {
      return { nextAction: GATE_CONTROL_ACTIONS.PASS, issueType: 'policy', outcomeClass: 'passed' };
    }
    return {
      nextAction: GATE_CONTROL_ACTIONS.PASS,
      issueType: undefined,
      outcomeClass: 'passed',
    };
  }
  if (status === 'CORRUPTED_STATE' || result?.corrupted_state === true) {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'unknown', outcomeClass: 'needs_nova' };
  }
  if (status === 'INVALID_STATE' || result?.invalid_state === true) {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'unknown', outcomeClass: 'needs_nova' };
  }
  if ([APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.CANCELLED, APPROVAL_STATUS.TIMED_OUT].includes(status)) {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'policy', outcomeClass: 'needs_nova' };
  }
  return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'unknown', outcomeClass: 'error' };
}

function canonicalApprovalGateRunStatus(status, result = {}) {
  if (status === APPROVAL_STATUS.TIMED_OUT) return 'TIMED_OUT';
  if (isApprovalGatePassResult(result)) return 'PASS';
  if (status === APPROVAL_STATUS.PENDING_APPROVAL) return 'WAIT';
  return 'FAIL';
}

function isApprovalGatePassResult(result = {}) {
  const status = String(result?.status || '').trim().toUpperCase();
  return result?.passed === true
    || result?.outcome_class === 'passed'
    || status === APPROVAL_STATUS.APPROVED
    || (status === APPROVAL_STATUS.TIMED_OUT && result?.continued === true);
}

function tryResolveApprovalTimeoutPolicyFromState(stateAuthority, gateId) {
  if (!stateAuthority?.timeout_policy) return null;
  try {
    return resolveApprovalTimeoutPolicyFromState(stateAuthority, gateId);
  } catch (_error) {
    return null;
  }
}

export function buildApprovalGateControlResult(config, gateId, gate, result = {}, opts = {}) {
  const decision = approvalGateDecisionForResult(result);
  const runId = config?._runId || config?.run_id || null;
  const status = String(result?.status || '').trim().toUpperCase() || null;
  const stateAuthority = opts?.approvalState || opts?.input?.stateSnapshot?.gate;
  const timeoutPolicy = result?.corrupted_state === true || result?.invalid_state === true || status === 'CORRUPTED_STATE' || status === 'INVALID_STATE'
    ? tryResolveApprovalTimeoutPolicyFromState(stateAuthority, gateId)
    : resolveApprovalTimeoutPolicyFromState(stateAuthority, gateId);
  const metadata = {
    gate_id: gateId,
    gate_type: gate?.type || 'approval',
    run_id: runId,
    reason: result?.reason || null,
    timeout_policy: timeoutPolicy,
    continued: result?.continued === true,
    timed_out: result?.timed_out === true || status === APPROVAL_STATUS.TIMED_OUT,
    decision_by: result?.decision_by || null,
    decision_via: result?.decision_via || null,
    corrupted_state: result?.corrupted_state === true || result?.status === 'CORRUPTED_STATE',
    invalid_state: result?.invalid_state === true || result?.status === 'INVALID_STATE',
    wait_ref: opts?.input?.refs?.waitRef || null,
    scheduler_consumed: status === APPROVAL_STATUS.APPROVED || (status === APPROVAL_STATUS.TIMED_OUT && result?.continued === true),
    domain_status: status,
  };

  return buildTypedGateControlResult({
    producerType: 'approval',
    nextAction: decision.nextAction,
    issueType: decision.issueType,
    summary: buildApprovalControlSummary(gateId, result),
    findings: buildApprovalFindings({ ...result, gate_id: gateId }),
    metadata,
    gateRunStatus: canonicalApprovalGateRunStatus(status, result),
    outcomeClass: decision.outcomeClass,
    recommendation: decision.nextAction === 'pass' ? 'proceed' : 'stop',
    metrics: {
      continued: result?.continued === true,
      timed_out: result?.timed_out === true || status === APPROVAL_STATUS.TIMED_OUT,
    },
  });
}

export function buildApprovalGateWaitControlResult(config, gateId, gate, gateState = {}, opts = {}) {
  const runId = config?._runId || config?.run_id || gateState?.run_id || null;
  const timeoutPolicy = resolveApprovalTimeoutPolicyFromState(gateState, gateId);
  const waitRef = gateState?.wait_ref || opts?.input?.refs?.waitRef || null;
  return buildTypedGateControlResult({
    producerType: 'approval',
    nextAction: GATE_CONTROL_ACTIONS.WAIT,
    issueType: 'policy',
    summary: `Approval gate '${gateId}' is waiting for operator decision`,
    findings: [],
    metadata: {
      gate_id: gateId,
      gate_type: gate?.type || 'approval',
      run_id: runId,
      timeout_policy: timeoutPolicy,
      deadline: gateState?.deadline || null,
      timeout_minutes: gateState?.timeout_minutes ?? null,
      requested_at: gateState?.requested_at || null,
      wait_ref: waitRef,
    },
    gateRunStatus: 'WAIT',
    outcomeClass: 'waiting',
    recommendation: 'wait',
    metrics: {
      timeout_minutes: gateState?.timeout_minutes ?? null,
    },
    wait: {
      schemaVersion: 'v1',
      waitKind: 'approval',
      waitRef,
      status: APPROVAL_STATUS.PENDING_APPROVAL,
      deadline: gateState?.deadline || null,
      timeoutPolicy,
      signalKinds: ['approve', 'reject', 'cancel', 'timeout_continue', 'timeout_block'],
    },
  });
}

export function isApprovalGateControlResult(result) {
  return isTypedGateControlResult(result, 'approval');
}

export function coerceApprovalGateControlResult(config, gateId, gate, result) {
  return coerceTypedGateControlResult(result, { producerType: 'approval' });
}
