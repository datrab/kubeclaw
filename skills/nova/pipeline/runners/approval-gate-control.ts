import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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

const APPROVAL_GATE_TYPE = 'approval';
const APPROVAL_FAILED_STATUS = 'FAILED';
const CORRUPTED_STATE_STATUS = 'CORRUPTED_STATE';
const INVALID_STATE_STATUS = 'INVALID_STATE';

function selectPresentValue(...values: any) {
  return values.find((value: any) => value !== undefined && value !== null && value !== '');
}

function normalizedStatus(value: any) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function approvalGateType(gate: any) {
  return selectPresentValue(gate?.type, APPROVAL_GATE_TYPE);
}

function approvalReason(result: any, fallback: any) {
  return selectPresentValue(result?.reason, fallback);
}

function buildApprovalControlSummary(gateId: any, result: any = {}) {
  const status = normalizedStatus(result?.status);
  if (isApprovalGatePassResult(result) && status === APPROVAL_STATUS.APPROVED) {
    return `Approval gate '${gateId}' approved`;
  }
  if (isApprovalGatePassResult(result) && status === APPROVAL_STATUS.TIMED_OUT && result?.continued === true) {
    return `Approval gate '${gateId}' timed out and auto-continued`;
  }
  if (status === APPROVAL_STATUS.REJECTED) {
    return approvalReason(result, `Approval gate '${gateId}' rejected`);
  }
  if (status === APPROVAL_STATUS.CANCELLED) {
    return approvalReason(result, `Approval gate '${gateId}' cancelled`);
  }
  if (status === APPROVAL_STATUS.TIMED_OUT) {
    return approvalReason(result, `Approval gate '${gateId}' timed out`);
  }
  if (selectTruthyValue(() => (result?.status === CORRUPTED_STATE_STATUS), () => (result?.corrupted_state === true))) {
    return approvalReason(result, `Approval gate '${gateId}' has corrupted persisted state`);
  }
  return approvalReason(result, `Approval gate '${gateId}' failed`);
}

function buildApprovalFindings(result: any = {}) {
  const status = normalizedStatus(result?.status);
  if (isApprovalGatePassResult(result)) return [];

  if (selectTruthyValue(() => (result?.status === CORRUPTED_STATE_STATUS), () => (result?.corrupted_state === true))) {
    return [{
      code: 'APPROVAL_STATE_CORRUPTED',
      severity: 'critical',
      message: approvalReason(result, 'Approval gate persisted state is corrupted'),
      category: 'approval',
      target: selectTruthyValue(() => (result?.gate_id), () => (null)),
      retryable: false,
      environmentIssue: false,
    }];
  }

  return [{
    code: `APPROVAL_${selectPresentValue(status, APPROVAL_FAILED_STATUS)}`,
    severity: 'error',
    message: approvalReason(result, `Approval gate resolved as ${selectPresentValue(status, APPROVAL_FAILED_STATUS)}`),
    category: 'approval',
    target: selectTruthyValue(() => (result?.gate_id), () => (null)),
    retryable: false,
    environmentIssue: false,
  }];
}

function approvalGateDecisionForResult(result: any = {}) {
  const status = normalizedStatus(result?.status);
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
  if (selectTruthyValue(() => (status === CORRUPTED_STATE_STATUS), () => (result?.corrupted_state === true))) {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'contract', outcomeClass: 'needs_nova' };
  }
  if (selectTruthyValue(() => (status === INVALID_STATE_STATUS), () => (result?.invalid_state === true))) {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'contract', outcomeClass: 'needs_nova' };
  }
  if ([APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.CANCELLED, APPROVAL_STATUS.TIMED_OUT].includes(status)) {
    return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'policy', outcomeClass: 'needs_nova' };
  }
  return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: 'contract', outcomeClass: 'error' };
}

function canonicalApprovalGateRunStatus(status: any, result: any = {}) {
  if (status === APPROVAL_STATUS.TIMED_OUT) return 'TIMED_OUT';
  if (isApprovalGatePassResult(result)) return 'PASS';
  if (status === APPROVAL_STATUS.PENDING_APPROVAL) return 'WAIT';
  return 'FAIL';
}

function isApprovalGatePassResult(result: any = {}) {
  return result?.outcome_class === 'passed';
}

function assertApprovalGateResultContract(gateId: any, status: any, result: any = {}) {
  if (result?.outcome_class !== 'passed') return;
  const hasApprovedAuthority = status === APPROVAL_STATUS.APPROVED;
  const hasTimeoutContinueAuthority = status === APPROVAL_STATUS.TIMED_OUT && result?.continued === true;
  if (!hasApprovedAuthority && !hasTimeoutContinueAuthority) {
    throw new Error(`Approval gate '${gateId}' passed outcome requires APPROVED status or continued TIMED_OUT authority`);
  }
}

function tryResolveApprovalTimeoutPolicyFromState(stateAuthority: any, gateId: any) {
  if (!stateAuthority?.timeout_policy) return null;
  try {
    return resolveApprovalTimeoutPolicyFromState(stateAuthority, gateId);
  } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): this optional probe converts unreadable or absent input to explicit absence. */
    return null;
  }
}

function requireApprovalStateAuthority(opts: any = {}, gateId: any) {
  const state = selectDefinedValue(() => (opts?.approvalState), () => (opts?.input?.stateSnapshot?.gate));
  if (selectTruthyValue(() => (!state), () => (typeof state !== 'object'))) {
    throw new Error(`approval gate '${gateId}' persisted state requires timeout_policy authority`);
  }
  return state;
}

function isTimedOutApproval(status: any, result: any = {}) {
  return selectTruthyValue(() => (result?.timed_out === true), () => (status === APPROVAL_STATUS.TIMED_OUT));
}

function approvalSchedulerConsumed(status: any, result: any = {}) {
  return selectTruthyValue(() => (status === APPROVAL_STATUS.APPROVED), () => ((status === APPROVAL_STATUS.TIMED_OUT && result?.continued === true)));
}

export function buildApprovalGateControlResult(config: any, gateId: any, gate: any, result: any = {}, opts: any = {}) {
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => (null));
  const status = selectTruthyValue(() => (normalizedStatus(result?.status)), () => (null));
  assertApprovalGateResultContract(gateId, status, result);
  const decision = approvalGateDecisionForResult(result);
  const stateAuthority = requireApprovalStateAuthority(opts, gateId);
  const attempt = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (result?.attempt), () => (stateAuthority?.attempt))), () => (opts?.input?.ids?.attempt))), () => (null));
  const dispatchId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (result?.dispatch_id), () => (result?.dispatchId))), () => (stateAuthority?.dispatch_id))), () => (stateAuthority?.dispatchId))), () => (opts?.input?.ids?.dispatchId))), () => (opts?.input?.ids?.dispatch_id))), () => (null));
  const timeoutPolicy = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (result?.corrupted_state === true), () => (result?.invalid_state === true))), () => (status === CORRUPTED_STATE_STATUS))), () => (status === INVALID_STATE_STATUS))
    ? tryResolveApprovalTimeoutPolicyFromState(stateAuthority, gateId)
    : resolveApprovalTimeoutPolicyFromState(stateAuthority, gateId);
  const metadata = {
    gate_id: gateId,
    gate_type: approvalGateType(gate),
    run_id: runId,
    attempt,
    dispatch_id: dispatchId,
    reason: selectTruthyValue(() => (result?.reason), () => (null)),
    timeout_policy: timeoutPolicy,
    continued: result?.continued === true,
    timed_out: isTimedOutApproval(status, result),
    decision_by: selectTruthyValue(() => (result?.decision_by), () => (null)),
    decision_via: selectTruthyValue(() => (result?.decision_via), () => (null)),
    corrupted_state: selectTruthyValue(() => (result?.corrupted_state === true), () => (result?.status === CORRUPTED_STATE_STATUS)),
    invalid_state: selectTruthyValue(() => (result?.invalid_state === true), () => (result?.status === INVALID_STATE_STATUS)),
    wait_ref: selectTruthyValue(() => (opts?.input?.refs?.waitRef), () => (null)),
    scheduler_consumed: approvalSchedulerConsumed(status, result),
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
      timed_out: isTimedOutApproval(status, result),
    },
  });
}

export function buildApprovalGateWaitControlResult(config: any, gateId: any, gate: any, gateState: any = {}, opts: any = {}) {
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => (gateState?.run_id))), () => (null));
  const timeoutPolicy = resolveApprovalTimeoutPolicyFromState(gateState, gateId);
  const waitRef = selectTruthyValue(() => (selectTruthyValue(() => (gateState?.wait_ref), () => (opts?.input?.refs?.waitRef))), () => (null));
  const attempt = selectDefinedValue(() => (selectDefinedValue(() => (gateState?.attempt), () => (opts?.input?.ids?.attempt))), () => (null));
  const dispatchId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (gateState?.dispatch_id), () => (gateState?.dispatchId))), () => (opts?.input?.ids?.dispatchId))), () => (opts?.input?.ids?.dispatch_id))), () => (null));
  return buildTypedGateControlResult({
    producerType: 'approval',
    nextAction: GATE_CONTROL_ACTIONS.WAIT,
    issueType: 'policy',
    summary: `Approval gate '${gateId}' is waiting for operator decision`,
    findings: [],
    metadata: {
      gate_id: gateId,
      gate_type: approvalGateType(gate),
      run_id: runId,
      attempt,
      dispatch_id: dispatchId,
      timeout_policy: timeoutPolicy,
      deadline: selectTruthyValue(() => (gateState?.deadline), () => (null)),
      timeout_minutes: selectDefinedValue(() => (gateState?.timeout_minutes), () => (null)),
      requested_at: selectTruthyValue(() => (gateState?.requested_at), () => (null)),
      wait_ref: waitRef,
    },
    gateRunStatus: 'WAIT',
    outcomeClass: 'waiting',
    recommendation: 'wait',
    metrics: {
      timeout_minutes: selectDefinedValue(() => (gateState?.timeout_minutes), () => (null)),
    },
    wait: {
      schemaVersion: 'v1',
      waitKind: 'approval',
      waitRef,
      status: APPROVAL_STATUS.PENDING_APPROVAL,
      deadline: selectTruthyValue(() => (gateState?.deadline), () => (null)),
      timeoutPolicy,
      signalKinds: ['approve', 'reject', 'cancel', 'timeout_continue', 'timeout_block'],
    },
  });
}

export function isApprovalGateControlResult(result: any) {
  return isTypedGateControlResult(result, 'approval');
}

export function coerceApprovalGateControlResult(config: any, gateId: any, gate: any, result: any) {
  return coerceTypedGateControlResult(result, { producerType: 'approval' });
}
