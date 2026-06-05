// runners/buster-gate-task.js — pure Buster gate dispatch payload helpers
// Keep this module side-effect free: the runner owns spawning, polling, Redis, lifecycle, and telemetry.

function createBusterGateDispatchId({ gateId, attempt }) {
  return `buster-gate-${gateId}-${Date.now()}-${attempt}`;
}

export function createBusterGateCompletionIdentity({ runId, gateId, attempt }) {
  return {
    runId,
    attempt,
    dispatchId: createBusterGateDispatchId({ gateId, attempt }),
    sessionKey: null,
    gateway_label: null,
  };
}

export function buildBusterGateRateLimitStatusOptions({ gateId, gate, completionIdentity }) {
  return {
    gateId,
    gateType: gate.type,
    identity: {
      agent_type: gate.type || 'buster',
      run_id: completionIdentity.runId,
      attempt: completionIdentity.attempt,
      dispatch_id: completionIdentity.dispatchId,
      gateway_label: completionIdentity.gateway_label,
      session_key: completionIdentity.sessionKey,
    },
  };
}

export function buildBusterGateArchiveIdentity(completionIdentity) {
  return {
    run_id: completionIdentity.runId,
    attempt: completionIdentity.attempt,
    dispatch_id: completionIdentity.dispatchId,
  };
}

export function buildBusterGateArchiveTarget(gateId, gate) {
  return {
    targetKind: 'gate',
    gate_id: gateId,
    gate_type: gate.type,
    agent_type: 'buster',
  };
}

export function buildBusterGateSpawnOptions(gate, completionIdentity) {
  return {
    taskType: 'gate_test',
    gate,
    run_id: completionIdentity.runId,
    attempt: completionIdentity.attempt,
    dispatch_id: completionIdentity.dispatchId,
  };
}

export function buildBusterGateActiveSessionMetadata(completionIdentity) {
  return {
    run_id: completionIdentity.runId,
    attempt: completionIdentity.attempt,
    dispatch_id: completionIdentity.dispatchId,
    gateway_label: completionIdentity.gateway_label,
  };
}

export function buildBusterGateActiveCompletionIdentity(completionIdentity) {
  return {
    run_id: completionIdentity.runId,
    attempt: completionIdentity.attempt,
    dispatch_id: completionIdentity.dispatchId,
    session_key: completionIdentity.sessionKey,
  };
}

export function applyTrackedBusterGateIdentity(completionIdentity, trackedGate = null) {
  completionIdentity.dispatchId = trackedGate?.telemetry_dispatch_id || trackedGate?.dispatch_id || completionIdentity.dispatchId;
  completionIdentity.gateway_label = trackedGate?.gatewayLabel || completionIdentity.gateway_label;
  completionIdentity.sessionKey = trackedGate?.sessionKey || null;
  return completionIdentity;
}

export function syncBusterGateRateLimitStatusOptions(statusOptions, completionIdentity) {
  statusOptions.identity = {
    ...(statusOptions.identity || {}),
    dispatch_id: completionIdentity.dispatchId,
    gateway_label: completionIdentity.gateway_label,
    session_key: completionIdentity.sessionKey,
  };
  return statusOptions;
}
