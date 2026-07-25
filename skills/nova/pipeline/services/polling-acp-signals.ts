import {
  maybeEmitAcpPollProgress,
  publishAcpTranscriptDelta,
  updateAcpPollObservability,
} from "./polling-observability.ts";

export function createAcpPollObservabilityState() {
  return {
    gateway: { active: false, degradedAt: null },
    transcript: { active: false, degradedAt: null },
  };
}

export function publishAcpPollSignals(
  ctx: any,
  observabilityState: any,
  acpState: any,
  pollIdentity: any,
  agentType: any,
  progress: any,
) {
  updateAcpPollObservability(
    ctx,
    observabilityState,
    acpState,
    pollIdentity,
    agentType,
  );
  publishAcpTranscriptDelta(ctx, pollIdentity, acpState, {
    label: pollIdentity.label,
    agentType,
  });
  return maybeEmitAcpPollProgress(ctx, pollIdentity, acpState, {
    label: pollIdentity.label,
    agentType,
    lastEmitAt: progress.lastEmitAt,
    intervalMs: progress.intervalMs,
    elapsedSeconds: Math.round((Date.now() - progress.startedAt) / 1000),
  });
}
