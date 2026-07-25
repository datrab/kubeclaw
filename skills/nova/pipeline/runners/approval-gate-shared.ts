import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/approval-gate-shared.js — shared approval gate constants and identity helpers

export const APPROVAL_STATUS = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED:         'APPROVED',
  REJECTED:         'REJECTED',
  TIMED_OUT:        'TIMED_OUT',
  CANCELLED:        'CANCELLED',
};

export const APPROVAL_TIMEOUT_POLICY = {
  BLOCK: 'BLOCK',
  CONTINUE: 'CONTINUE',
};

export const APPROVAL_TERMINAL_OR_WAIT_STATUSES = new Set(Object.values(APPROVAL_STATUS));

export function normalizeApprovalTimeoutPolicy(value: any) {
  const normalized = String(selectDefinedValue(() => (value), () => (''))).trim().toUpperCase();
  if (selectTruthyValue(() => (normalized === APPROVAL_TIMEOUT_POLICY.BLOCK), () => (normalized === APPROVAL_TIMEOUT_POLICY.CONTINUE))) {
    return normalized;
  }
  throw new Error(`approval timeout_policy is required and must be ${APPROVAL_TIMEOUT_POLICY.BLOCK} or ${APPROVAL_TIMEOUT_POLICY.CONTINUE}`);
}

export function resolveApprovalTimeoutPolicyFromGate(gate: any = {}, gateId: any = 'approval') {
  if (selectTruthyValue(() => (selectTruthyValue(() => (gate?.on_timeout === undefined), () => (gate?.on_timeout === null))), () => (gate?.on_timeout === ''))) {
    throw new Error(`approval gate '${gateId}' requires explicit on_timeout policy`);
  }
  return normalizeApprovalTimeoutPolicy(gate.on_timeout);
}

export function resolveApprovalTimeoutPolicyFromState(state: any = {}, gateId: any = 'approval') {
  if (selectTruthyValue(() => (!state), () => (typeof state !== 'object'))) {
    throw new Error(`approval gate '${gateId}' requires persisted timeout_policy authority`);
  }
  if (selectTruthyValue(() => (selectTruthyValue(() => (state.timeout_policy === undefined), () => (state.timeout_policy === null))), () => (state.timeout_policy === ''))) {
    throw new Error(`approval gate '${gateId}' persisted state requires timeout_policy authority`);
  }
  return normalizeApprovalTimeoutPolicy(state.timeout_policy);
}

export function isApprovalTimeoutContinue(value: any) {
  return normalizeApprovalTimeoutPolicy(value) === APPROVAL_TIMEOUT_POLICY.CONTINUE;
}

export function normalizeApprovalGateState(state: any, identity: any = {}) {
  if (!state || typeof state !== 'object') return state;
  const hasTimeoutPolicy = state.timeout_policy !== undefined && state.timeout_policy !== null && state.timeout_policy !== '';
  const timeoutPolicy = hasTimeoutPolicy ? normalizeApprovalTimeoutPolicy(state.timeout_policy) : null;
  const identityUpdates = approvalIdentityUpdates(state, identity);
  const normalized = {
    ...(hasTimeoutPolicy && state.timeout_policy !== timeoutPolicy ? { timeout_policy: timeoutPolicy } : {}),
    ...identityUpdates,
  };
  return Object.keys(normalized).length > 0 ? { ...state, ...normalized } : state;
}

function approvalIdentityUpdates(state: any, identity: any) {
  const gateId = firstPresent(state.gate_id, identity.gate_id, identity.gateId);
  const gateType = firstPresent(state.gate_type, identity.gate_type, identity.gateType);
  const project = firstPresent(state.project, identity.project);
  return {
    ...(gateId && state.gate_id !== gateId ? { gate_id: gateId } : {}),
    ...(gateType && state.gate_type !== gateType ? { gate_type: gateType } : {}),
    ...(project && state.project !== project ? { project } : {}),
  };
}

function firstPresent(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

export function buildApprovalIdentity(config: any, gateId: any, gate: any = null, state: any = null) {
  return {
    run_id: firstPresent(state?.run_id, config._runId, config.run_id),
    project: firstPresent(state?.project, config.project),
    gate_id: firstPresent(state?.gate_id, gateId),
    gate_type: firstPresent(state?.gate_type, gate?.type, 'approval'),
  };
}
