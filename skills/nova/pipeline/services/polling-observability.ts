import { selectDefinedValue, selectTruthyValue } from "../optional-absence.ts";
// services/polling-observability.ts — ACP polling observability helpers
// Centralizes gateway/transcript/progress emissions used by polling surfaces.

import {
  emitEventNonBlocking,
  updateGatewayObservability,
  updateTranscriptObservability,
} from "./telemetry.ts";

function buildAcpObservabilityData(
  acpState: any = {},
  identity: any = {},
  agentType: any = null,
) {
  return {
    session_state: acpState.sessionState,
    detail: acpState.detail,
    gateway_unreachable: acpState.gatewayUnreachable === true,
    gateway_detail: selectTruthyValue(
      () => acpState.gatewayDetail,
      () => null,
    ),
    transcript_detail: selectTruthyValue(
      () => acpState.transcript?.lastDetail,
      () => null,
    ),
    gateway_label: selectDefinedValue(
      () => identity.gateway_label,
      () => null,
    ),
    module_id: identity.module_id,
    gate_id: identity.gate_id,
    attempt: identity.attempt,
    dispatch_id: identity.dispatch_id,
    session_key: identity.session_key,
    agent_type: agentType,
  };
}

export function updateAcpPollObservability(
  ctx: any,
  observabilityState: any,
  acpState: any,
  identity: any,
  agentType: any = null,
) {
  const observabilityData = buildAcpObservabilityData(
    acpState,
    identity,
    agentType,
  );
  updateGatewayObservability(
    ctx,
    observabilityState.gateway,
    observabilityData,
  );
  updateTranscriptObservability(
    ctx,
    observabilityState.transcript,
    observabilityData,
  );
  return observabilityData;
}

export function publishAcpTranscriptDelta(
  ctx: any,
  identity: any = {},
  acpState: any = {},
  opts: any = {},
) {
  const newTranscriptLines = selectDefinedValue(
    () => acpState.transcript?.newLines,
    () => [],
  );
  if (newTranscriptLines.length === 0) return false;
  return false;
}

export function maybeEmitAcpPollProgress(
  ctx: any,
  identity: any = {},
  acpState: any = {},
  opts: any = {},
) {
  const now = pollingNowAuthority(opts);
  const lastEmitAt = selectDefinedValue(
    () => opts.lastEmitAt,
    () => 0,
  );
  const intervalMs = opts.intervalMs;
  if (
    selectTruthyValue(
      () =>
        selectTruthyValue(
          () => typeof intervalMs !== "number",
          () => !Number.isFinite(intervalMs),
        ),
      () => intervalMs < 0,
    )
  ) {
    throw new Error(
      "maybeEmitAcpPollProgress requires explicit intervalMs from swarm.config.json",
    );
  }
  if (now - lastEmitAt < intervalMs) return lastEmitAt;
  const payload = acpProgressPayload(identity, acpState, opts);
  const sourceIdentity = firstPresent(
    identity.session_key,
    identity.dispatch_id,
    "unknown",
  );
  emitEventNonBlocking(ctx, "agent.progress", payload, {
    sourceEventId: `agent-progress/${sourceIdentity}/${now}`,
  });
  return now;
}

function optional(value: any) {
  return value === undefined || value === null ? null : value;
}

function firstPresent(...values: any[]) {
  for (const value of values)
    if (value !== undefined && value !== null) return value;
  return null;
}

function acpProgressPayload(identity: any, acpState: any, opts: any) {
  const lines = acpState.transcript?.newLines;
  return {
    module_id: optional(identity.module_id),
    gate_id: optional(identity.gate_id),
    attempt: optional(identity.attempt),
    dispatch_id: optional(identity.dispatch_id),
    session_key: optional(identity.session_key),
    agent_type: optional(opts.agentType),
    label: optional(firstPresent(opts.label, identity.label)),
    status: firstPresent(acpState.sessionState, "running"),
    elapsed_seconds: optional(opts.elapsedSeconds),
    last_activity: optional(
      firstPresent(acpState.transcript?.lastDetail, acpState.detail),
    ),
    transcript_events: Array.isArray(lines) ? lines.length : null,
    files_touched: null,
  };
}

function pollingNowAuthority(opts: any) {
  if (opts.now) return opts.now;
  return Date.now();
}
