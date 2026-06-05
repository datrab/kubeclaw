// services/polling-observability.ts — ACP polling observability helpers
// Centralizes gateway/transcript/progress emissions used by polling surfaces.

import { publishTranscriptDelta } from '../agents/acp-monitor.ts';
import { log } from '../core/logger.ts';
import {
  emitTranscriptLine,
  emitAgentProgress,
  updateGatewayObservability,
  updateTranscriptObservability,
} from './telemetry.ts';

export function buildAcpObservabilityData(acpState = {}, identity = {}, agentType = null) {
  return {
    session_state: acpState.sessionState,
    detail: acpState.detail,
    gateway_unreachable: acpState.gatewayUnreachable === true,
    gateway_detail: acpState.gatewayDetail || null,
    transcript_detail: acpState.transcript?.lastDetail || null,
    gateway_label: identity.gateway_label ?? null,
    module_id: identity.module_id,
    gate_id: identity.gate_id,
    attempt: identity.attempt,
    dispatch_id: identity.dispatch_id,
    session_key: identity.session_key,
    agent_type: agentType,
  };
}

export function updateAcpPollObservability(ctx, observabilityState, acpState, identity, agentType = null) {
  const observabilityData = buildAcpObservabilityData(acpState, identity, agentType);
  updateGatewayObservability(ctx, observabilityState.gateway, observabilityData);
  updateTranscriptObservability(ctx, observabilityState.transcript, observabilityData);
  return observabilityData;
}

export function publishAcpTranscriptDelta(ctx, identity = {}, acpState = {}, opts = {}) {
  const newTranscriptLines = acpState.transcript?.newLines || [];
  if (newTranscriptLines.length === 0) return false;

  const label = opts.label || identity.label;
  const agentType = opts.agentType || opts.agent_type || 'forge';
  Promise.resolve().then(() => {
    try {
      publishTranscriptDelta(ctx, {
        label,
        agent_type: agentType,
        module_id: identity.module_id,
        gate_id: identity.gate_id,
        gate_type: identity.gate_type,
        session_key: identity.session_key,
        dispatch_id: identity.dispatch_id,
      }, newTranscriptLines, emitTranscriptLine);
    } catch (e) {
      log('DEBUG', `Transcript delta publish failed (non-critical): ${e?.message || e}`);
    }
  }).catch((e) => {
    log('DEBUG', `Transcript delta publish scheduling failed (non-critical): ${e?.message || e}`);
  });
  return true;
}

export function maybeEmitAcpPollProgress(ctx, identity = {}, acpState = {}, opts = {}) {
  const now = opts.now || Date.now();
  const lastEmitAt = opts.lastEmitAt || 0;
  const intervalMs = opts.intervalMs ?? 30000;
  if (now - lastEmitAt < intervalMs) return lastEmitAt;

  emitAgentProgress(ctx, {
    agent_type: opts.agentType || opts.agent_type || 'forge',
    label: opts.label || identity.label,
    module_id: identity.module_id,
    gate_id: identity.gate_id,
    gate_type: identity.gate_type,
    session_key: identity.session_key,
    dispatch_id: identity.dispatch_id,
    elapsed_seconds: opts.elapsedSeconds ?? null,
    transcript_events: acpState.transcript?.eventCount ?? null,
    last_activity: acpState.transcript?.lastDetail || null,
    status: opts.status || 'active',
  });
  return now;
}
