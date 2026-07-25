import { sanitizeAcpTranscriptEvidence } from "../egress.ts";
import {
  buildGateSessionRateLimitStatus,
  buildModuleSessionRateLimitStatus,
  createTrackedGateSessionRateLimitExhaustedResultOptions,
  createTrackedModuleSessionRateLimitExhaustedResultOptions,
  processSessionRateLimit,
} from "./rate-limit.ts";
import {
  rateLimitModuleId,
  rateLimitTranscript,
  trackedRateLimitIdentity,
} from "./polling-session-end-support.ts";
import {
  startAcpAdapter,
  stopAcpAdapter,
} from "./polling-session-end-runtime.ts";

function rateLimitDetail(state: any, status: any) {
  if (status?.detail) return status.detail;
  return state.acpState.detail || null;
}

function normalizeRateLimitStatus(state: any, status: any, transcript: any) {
  const normalized = {
    ...(status ?? {}),
    detail: rateLimitDetail(state, status),
    transcript: rateLimitTranscript(status, transcript),
  };
  const identity = trackedRateLimitIdentity(state.rateLimitIdentity);
  if (state.rateLimitIdentity.gate_id) {
    return buildGateSessionRateLimitStatus(normalized, {
      gateId: state.rateLimitIdentity.gate_id,
      gateType: state.rateLimitIdentity.gate_type ?? null,
      identity,
    });
  }
  return buildModuleSessionRateLimitStatus(normalized, {
    moduleId: rateLimitModuleId(state.rateLimitIdentity, state.moduleId),
    phase: state.rateLimitIdentity.phase,
    identity,
  });
}

function exhaustedResultOptions(state: any, transcript: any) {
  const identity = trackedRateLimitIdentity(state.rateLimitIdentity);
  const resultOverrides = {
    completed: false,
    hasChanges: false,
    detail: state.acpState.detail || null,
    transcript,
  };
  if (state.rateLimitIdentity.gate_id) {
    return createTrackedGateSessionRateLimitExhaustedResultOptions({
      gateId: state.rateLimitIdentity.gate_id,
      gateType: state.rateLimitIdentity.gate_type ?? null,
      identity,
      resultOverrides,
    });
  }
  return createTrackedModuleSessionRateLimitExhaustedResultOptions({
    moduleId: rateLimitModuleId(state.rateLimitIdentity, state.moduleId),
    moduleDir: state.moduleId,
    phase: state.rateLimitIdentity.phase,
    identity,
    resultOverrides,
  });
}

function processOptions(state: any, transcript: any) {
  return {
    pauseCount: state.rateLimitPauses,
    maxPauses: state.maxRateLimitPauses,
    normalizeStatus: (status: any) =>
      normalizeRateLimitStatus(state, status, transcript),
    pauseLogMessage: ({
      pauseCount,
      maxPauses,
      cooldownHours,
      resumeAt,
    }: any) =>
      `[${state.logLabel}] ACP session rate limited (pause ${pauseCount}/${maxPauses}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
    resumeLogMessage: () =>
      `[${state.logLabel}] ACP session rate limit cooldown complete — resuming monitor`,
    exhaustedLogMessage: ({ pauseCount, maxPauses }: any) =>
      `[${state.logLabel}] ACP session rate limit pauses exhausted (${pauseCount}/${maxPauses})`,
    exhaustedResultOptions: exhaustedResultOptions(state, transcript),
    budget: state.budget,
  };
}

export async function handleSessionEndRateLimit(state: any) {
  state.rateLimitPauses += 1;
  const transcript = sanitizeAcpTranscriptEvidence(state.acpState.transcript);
  await stopAcpAdapter(state, "rate_limit_cooldown");
  const step = await processSessionRateLimit(
    state.config,
    {
      ...state.rateLimitIdentity,
      agent_type: state.rateLimitIdentity.phase,
      provider: state.opts.provider ?? null,
      detail: state.acpState.detail || null,
      transcript,
    },
    processOptions(state, transcript),
  );
  if (step.exhausted) return step.result;
  state.acpState = {
    ...state.acpState,
    rateLimited: false,
    transcript: state.acpState.transcript
      ? { ...state.acpState.transcript, rateLimited: false }
      : state.acpState.transcript,
  };
  startAcpAdapter(state);
  return null;
}
