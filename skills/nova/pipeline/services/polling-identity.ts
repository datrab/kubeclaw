// services/polling-identity.ts — pure identity/log-key helpers for polling surfaces
// Keep this module free of filesystem, Redis, gateway, lifecycle, and telemetry side effects.

import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from './correlation.ts';

export function sessionLabelAgentType(label = '') {
  if (label === 'Pipeline Review') return 'review';
  if (label === 'Case Study') return 'case_study';
  return null;
}

export function resolveFilePollIdentity(label, tracked = null) {
  return {
    label: tracked?.gatewayLabel || label,
    gateway_label: tracked?.gatewayLabel || null,
    module_id: tracked?.telemetry_module_id ?? null,
    gate_id: tracked?.telemetry_gate_id ?? null,
    gate_type: tracked?.telemetry_gate_id ? (tracked?.telemetry_gate_type ?? null) : undefined,
    attempt: tracked?.telemetry_attempt ?? null,
    dispatch_id: tracked?.telemetry_dispatch_id ?? null,
    session_key: tracked?.sessionKey || null,
    agent_type: tracked?.telemetry_agent_type
      ?? (tracked?.telemetry_gate_id
        ? (tracked?.telemetry_gate_type ?? 'review')
        : (sessionLabelAgentType(label) || null)),
  };
}

export function resolveSessionPollIdentity({ tracked = null, explicitModuleId = null, gateId = null, gateType = null, sessionKey = null, logLabel = null, sessionLabel = null } = {}) {
  const telemetryGateId = tracked?.telemetry_gate_id ?? gateId ?? null;
  return {
    label: tracked?.gatewayLabel || logLabel || sessionLabel || null,
    gateway_label: tracked?.gatewayLabel || null,
    module_id: telemetryGateId
      ? (tracked?.telemetry_module_id ?? null)
      : (tracked?.telemetry_module_id ?? explicitModuleId ?? tracked?.moduleId ?? null),
    gate_id: telemetryGateId,
    gate_type: telemetryGateId ? (gateType ?? tracked?.telemetry_gate_type ?? null) : undefined,
    attempt: tracked?.telemetry_attempt ?? null,
    dispatch_id: tracked?.telemetry_dispatch_id ?? null,
    session_key: sessionKey || tracked?.sessionKey || null,
  };
}

export function resolveStatusPollIdentity(moduleDir, status = null, tracked = null, sessionLabel = null) {
  const fallbackLabel = tracked?.gatewayLabel || sessionLabel || status?.module_id || moduleDir;
  const gatewayLabel = resolveStatusGatewayLabel(status) ?? tracked?.gatewayLabel ?? null;
  const gateId = status?.gate_id || tracked?.telemetry_gate_id || null;
  const gateType = gateId ? (status?.gate_type ?? tracked?.telemetry_gate_type ?? null) : undefined;
  return {
    label: gatewayLabel || fallbackLabel,
    gateway_label: gatewayLabel,
    module_id: status?.module_id || tracked?.moduleId || moduleDir,
    gate_id: gateId,
    gate_type: gateType,
    attempt: status?.attempt ?? tracked?.telemetry_attempt ?? null,
    dispatch_id: resolveStatusDispatchId(status) ?? tracked?.telemetry_dispatch_id ?? null,
    session_key: resolveStatusSessionKey(status) ?? tracked?.sessionKey ?? null,
    agent_type: status?.current_phase
      || (gateId ? (gateType ?? 'review') : null)
      || sessionLabelAgentType(gatewayLabel || fallbackLabel || '')
      || null,
  };
}

export function buildAcpPollLogKey(acpState = {}) {
  const transcriptState = acpState?.transcript?.lastActivityPoll === 0
    ? 'active'
    : (acpState?.transcript?.eventCount > 0 ? 'stale' : 'empty');
  return [
    `session=${acpState?.sessionState || 'unknown'}`,
    `reason=${acpState?.reason || 'pending'}`,
    `gateway=${acpState?.gatewayUnreachable ? 'unreachable' : 'ok'}`,
    `transcript=${transcriptState}`,
  ].join(' ');
}

export function buildSessionProgressStateKey(sessionEndDetected = false) {
  return sessionEndDetected ? 'session_active_waiting_for_push' : 'session_active';
}
