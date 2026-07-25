import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/buster-gate-task.js — pure Buster gate dispatch payload helpers
// Keep this module side-effect free: the runner owns spawning, polling, Redis, lifecycle, and telemetry.

function createBusterGateDispatchId({ gateId, attempt }: any) {
  return `buster-gate-${gateId}-${Date.now()}-${attempt}`;
}

export function createBusterGateCompletionIdentity({ runId, gateId, attempt }: any) {
  return {
    runId,
    attempt,
    dispatchId: createBusterGateDispatchId({ gateId, attempt }),
    sessionKey: null,
    gateway_label: null,
  };
}

export function buildBusterGateRateLimitStatusOptions({ gateId, gate, completionIdentity }: any) {
  return {
    gateId,
    gateType: gate.type,
    identity: {
      agent_type: selectDefinedValue(() => (gate.type), () => ('buster')),
      run_id: completionIdentity.runId,
      attempt: completionIdentity.attempt,
      dispatch_id: completionIdentity.dispatchId,
      gateway_label: completionIdentity.gateway_label,
      session_key: completionIdentity.sessionKey,
    },
  };
}

export function buildBusterGateArchiveIdentity(completionIdentity: any) {
  return {
    run_id: completionIdentity.runId,
    attempt: completionIdentity.attempt,
    dispatch_id: completionIdentity.dispatchId,
  };
}

export function buildBusterGateArchiveTarget(gateId: any, gate: any) {
  return {
    targetKind: 'gate',
    gate_id: gateId,
    gate_type: gate.type,
    agent_type: 'buster',
  };
}

export function buildBusterGateSpawnOptions(gate: any, completionIdentity: any) {
  const commitHash = typeof completionIdentity.commitHash === 'string'
    ? completionIdentity.commitHash.trim()
    : '';
  if (!commitHash) {
    throw new Error('Buster gate spawn options require commitHash');
  }
  return {
    taskType: 'gate_test',
    gate,
    run_id: completionIdentity.runId,
    attempt: completionIdentity.attempt,
    dispatch_id: completionIdentity.dispatchId,
    commit_hash: commitHash,
  };
}

export function buildBusterGateActiveSessionMetadata(completionIdentity: any) {
  return {
    run_id: completionIdentity.runId,
    attempt: completionIdentity.attempt,
    dispatch_id: completionIdentity.dispatchId,
    gateway_label: completionIdentity.gateway_label,
  };
}

export function buildBusterGateActiveCompletionIdentity(completionIdentity: any) {
  return {
    run_id: completionIdentity.runId,
    attempt: completionIdentity.attempt,
    dispatch_id: completionIdentity.dispatchId,
    session_key: completionIdentity.sessionKey,
  };
}

export function applyTrackedBusterGateIdentity(completionIdentity: any, trackedGate: any = null) {
  completionIdentity.dispatchId = trackedBusterGateDispatchId(completionIdentity, trackedGate);
  completionIdentity.gateway_label = trackedBusterGateGatewayLabel(completionIdentity, trackedGate);
  completionIdentity.sessionKey = selectTruthyValue(() => (trackedGate?.sessionKey), () => (null));
  return completionIdentity;
}

function trackedBusterGateDispatchId(completionIdentity: any, trackedGate: any = null) {
  if (trackedGate?.telemetry_dispatch_id) return trackedGate.telemetry_dispatch_id;
  if (trackedGate?.dispatch_id) return trackedGate.dispatch_id;
  if (completionIdentity?.dispatchId) return completionIdentity.dispatchId;
  throw new Error('Buster gate tracked identity requires dispatch id');
}

function trackedBusterGateGatewayLabel(completionIdentity: any, trackedGate: any = null) {
  if (trackedGate?.gatewayLabel) return trackedGate.gatewayLabel;
  if (completionIdentity?.gateway_label) return completionIdentity.gateway_label;
  return null;
}

export function syncBusterGateRateLimitStatusOptions(statusOptions: any, completionIdentity: any) {
  statusOptions.identity = {
    ...(selectDefinedValue(() => (statusOptions.identity), () => ({}))),
    dispatch_id: completionIdentity.dispatchId,
    gateway_label: completionIdentity.gateway_label,
    session_key: completionIdentity.sessionKey,
  };
  return statusOptions;
}
