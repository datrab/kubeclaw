import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/polling-observability.ts — ACP polling observability helpers
// Centralizes gateway/transcript/progress emissions used by polling surfaces.

import {
  updateGatewayObservability,
  updateTranscriptObservability,
} from './telemetry.ts';

export function buildAcpObservabilityData(acpState = {}, identity = {}, agentType = null) {
  return {
    session_state: acpState.sessionState,
    detail: acpState.detail,
    gateway_unreachable: acpState.gatewayUnreachable === true,
    gateway_detail: selectTruthyValue(() => (acpState.gatewayDetail), () => (null)),
    transcript_detail: selectTruthyValue(() => (acpState.transcript?.lastDetail), () => (null)),
    gateway_label: selectDefinedValue(() => (identity.gateway_label), () => (null)),
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
  const newTranscriptLines = selectDefinedValue(() => (acpState.transcript?.newLines), () => ([]));
  if (newTranscriptLines.length === 0) return false;
  return false;
}

export function maybeEmitAcpPollProgress(ctx, identity = {}, acpState = {}, opts = {}) {
  const now = pollingNowAuthority(opts);
  const lastEmitAt = selectDefinedValue(() => (opts.lastEmitAt), () => (0));
  const intervalMs = opts.intervalMs;
  if (selectTruthyValue(() => (selectTruthyValue(() => (typeof intervalMs !== 'number'), () => (!Number.isFinite(intervalMs)))), () => (intervalMs < 0))) {
    throw new Error('maybeEmitAcpPollProgress requires explicit intervalMs from swarm.config.json');
  }
  if (now - lastEmitAt < intervalMs) return lastEmitAt;

  return now;
}

function pollingNowAuthority(opts) {
  if (opts.now) return opts.now;
  return Date.now();
}
