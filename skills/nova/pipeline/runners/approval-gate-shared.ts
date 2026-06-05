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

export function normalizeApprovalTimeoutPolicy(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === APPROVAL_TIMEOUT_POLICY.BLOCK || normalized === APPROVAL_TIMEOUT_POLICY.CONTINUE) {
    return normalized;
  }
  throw new Error(`approval timeout_policy is required and must be ${APPROVAL_TIMEOUT_POLICY.BLOCK} or ${APPROVAL_TIMEOUT_POLICY.CONTINUE}`);
}

export function resolveApprovalTimeoutPolicyFromGate(gate = {}, gateId = 'approval') {
  if (gate?.on_timeout === undefined || gate?.on_timeout === null || gate?.on_timeout === '') {
    throw new Error(`approval gate '${gateId}' requires explicit on_timeout policy`);
  }
  return normalizeApprovalTimeoutPolicy(gate.on_timeout);
}

export function resolveApprovalTimeoutPolicyFromState(state = {}, gateId = 'approval') {
  if (!state || typeof state !== 'object') {
    throw new Error(`approval gate '${gateId}' requires persisted timeout_policy authority`);
  }
  if (state.timeout_policy === undefined || state.timeout_policy === null || state.timeout_policy === '') {
    throw new Error(`approval gate '${gateId}' persisted state requires timeout_policy authority`);
  }
  return normalizeApprovalTimeoutPolicy(state.timeout_policy);
}

export function isApprovalTimeoutContinue(value) {
  return normalizeApprovalTimeoutPolicy(value) === APPROVAL_TIMEOUT_POLICY.CONTINUE;
}

export function normalizeApprovalGateState(state, identity = {}) {
  if (!state || typeof state !== 'object') return state;
  const normalizedGateId = state.gate_id || identity.gate_id || identity.gateId || null;
  const normalizedGateType = state.gate_type || identity.gate_type || identity.gateType || null;
  const normalizedProject = state.project || identity.project || null;
  const hasTimeoutPolicy = state.timeout_policy !== undefined && state.timeout_policy !== null && state.timeout_policy !== '';
  const timeoutPolicy = hasTimeoutPolicy ? normalizeApprovalTimeoutPolicy(state.timeout_policy) : null;
  let next = state;

  if (hasTimeoutPolicy && state.timeout_policy !== timeoutPolicy) next = { ...next, timeout_policy: timeoutPolicy };
  if (normalizedGateId && state.gate_id !== normalizedGateId) next = next === state ? { ...next, gate_id: normalizedGateId } : { ...next, gate_id: normalizedGateId };
  if (normalizedGateType && state.gate_type !== normalizedGateType) next = next === state ? { ...next, gate_type: normalizedGateType } : { ...next, gate_type: normalizedGateType };
  if (normalizedProject && state.project !== normalizedProject) next = next === state ? { ...next, project: normalizedProject } : { ...next, project: normalizedProject };

  return next;
}

export function buildApprovalIdentity(config, gateId, gate = null, state = null) {
  return {
    run_id: state?.run_id || config._runId || config.run_id || null,
    project: state?.project || config.project || null,
    gate_id: state?.gate_id || gateId || null,
    gate_type: state?.gate_type || gate?.type || 'approval',
  };
}
