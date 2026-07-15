import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/polling-identity.ts — pure identity/log-key helpers for polling surfaces
// Keep this module free of filesystem, Redis, gateway, lifecycle, and telemetry side effects.

import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from './correlation.ts';

const REVIEW_GATE_AGENT_TYPE = 'review';

export function sessionLabelAgentType(label = '') {
  if (label === 'Pipeline Review') return 'review';
  if (label === 'Case Study') return 'case_study';
  return null;
}

function gateAgentType(gateType) {
  return selectDefinedValue(() => (gateType), () => (REVIEW_GATE_AGENT_TYPE));
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function filePollLabel(label, tracked) {
  return selectPresentValue(tracked?.gatewayLabel, label);
}

function trackedAgentType(label, tracked) {
  if (!tracked?.telemetry_gate_id) return sessionLabelAgentType(label);
  return gateAgentType(tracked?.telemetry_gate_type);
}

function statusFallbackLabel(moduleDir, status, tracked, sessionLabel) {
  return selectPresentValue(tracked?.gatewayLabel, sessionLabel, status?.module_id, moduleDir);
}

function statusPollLabel(gatewayLabel, fallbackLabel) {
  return selectPresentValue(gatewayLabel, fallbackLabel);
}

function statusPollModuleId(moduleDir, status, tracked) {
  return selectPresentValue(status?.module_id, tracked?.moduleId, moduleDir);
}

export function resolveFilePollIdentity(label, tracked = null) {
  return {
    label: filePollLabel(label, tracked),
    gateway_label: selectTruthyValue(() => (tracked?.gatewayLabel), () => (null)),
    module_id: selectDefinedValue(() => (tracked?.telemetry_module_id), () => (null)),
    gate_id: selectDefinedValue(() => (tracked?.telemetry_gate_id), () => (null)),
    gate_type: tracked?.telemetry_gate_id ? (selectDefinedValue(() => (tracked?.telemetry_gate_type), () => (null))) : undefined,
    attempt: selectDefinedValue(() => (tracked?.telemetry_attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (tracked?.telemetry_dispatch_id), () => (null)),
    session_key: selectTruthyValue(() => (tracked?.sessionKey), () => (null)),
    agent_type: selectDefinedValue(() => (tracked?.telemetry_agent_type), () => (trackedAgentType(label, tracked))),
  };
}

export function resolveSessionPollIdentity({ tracked = null, explicitModuleId = null, gateId = null, gateType = null, sessionKey = null, logLabel = null, sessionLabel = null } = {}) {
  const telemetryGateId = selectDefinedValue(() => (selectDefinedValue(() => (tracked?.telemetry_gate_id), () => (gateId))), () => (null));
  return {
    label: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (tracked?.gatewayLabel), () => (logLabel))), () => (sessionLabel))), () => (null)),
    gateway_label: selectTruthyValue(() => (tracked?.gatewayLabel), () => (null)),
    module_id: telemetryGateId
      ? (selectDefinedValue(() => (tracked?.telemetry_module_id), () => (null)))
      : (selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (tracked?.telemetry_module_id), () => (explicitModuleId))), () => (tracked?.moduleId))), () => (null))),
    gate_id: telemetryGateId,
    gate_type: telemetryGateId ? (gateType) : undefined,
    attempt: selectDefinedValue(() => (tracked?.telemetry_attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (tracked?.telemetry_dispatch_id), () => (null)),
    session_key: selectTruthyValue(() => (selectTruthyValue(() => (sessionKey), () => (tracked?.sessionKey))), () => (null)),
  };
}

export function resolveStatusPollIdentity(moduleDir, status = null, tracked = null, sessionLabel = null) {
  const fallbackLabel = statusFallbackLabel(moduleDir, status, tracked, sessionLabel);
  const gatewayLabel = selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusGatewayLabel(status)), () => (tracked?.gatewayLabel))), () => (null));
  const gateId = selectTruthyValue(() => (selectTruthyValue(() => (status?.gate_id), () => (tracked?.telemetry_gate_id))), () => (null));
  const gateType = gateId ? (status?.gate_type) : undefined;
  return {
    label: statusPollLabel(gatewayLabel, fallbackLabel),
    gateway_label: gatewayLabel,
    module_id: statusPollModuleId(moduleDir, status, tracked),
    gate_id: gateId,
    gate_type: gateType,
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (status?.attempt), () => (tracked?.telemetry_attempt))), () => (null)),
    dispatch_id: selectDefinedValue(() => (resolveStatusDispatchId(status)), () => (null)),
    session_key: selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(status)), () => (tracked?.sessionKey))), () => (null)),
    agent_type: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (status?.current_phase), () => ((gateId ? gateAgentType(gateType) : null)))), () => (sessionLabelAgentType(selectDefinedValue(() => (selectDefinedValue(() => (gatewayLabel), () => (fallbackLabel))), () => ('')))))), () => (null)),
  };
}

export function buildAcpPollLogKey(acpState = {}) {
  const transcriptState = acpState?.transcript?.lastActivityPoll === 0
    ? 'active'
    : (acpState?.transcript?.eventCount > 0 ? 'stale' : 'empty');
  const sessionState = acpState?.sessionState ? acpState.sessionState : 'session_state_missing';
  return [
    `session=${sessionState}`,
    `reason=${selectDefinedValue(() => (acpState?.reason), () => ('pending'))}`,
    `gateway=${acpState?.gatewayUnreachable ? 'unreachable' : 'ok'}`,
    `transcript=${transcriptState}`,
  ].join(' ');
}

export function buildSessionProgressStateKey(sessionEndDetected = false) {
  return sessionEndDetected ? 'session_active_waiting_for_push' : 'session_active';
}
