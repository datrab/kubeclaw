import { monitorStateFromAcpEvent } from "../agents/acp-monitor.ts";
import { log } from "../core/logger.ts";
import { sanitizeAcpTranscriptEvidence } from "../egress.ts";
import { sendGatewaySessionMessage } from "../integrations/gateway.ts";
import { sessionSendGatewayPolicy } from "../core/session-policy.ts";
import { isBudgetExhaustedError } from "../timing.ts";
import { buildSessionProgressStateKey } from "./polling-identity.ts";
import {
  maybeEmitAcpPollProgress,
  publishAcpTranscriptDelta,
  updateAcpPollObservability,
} from "./polling-observability.ts";
import {
  appendDurableSessionEndAlert,
  buildSessionLifecycleFailureResult,
  errorMessage,
  isTerminalSessionFailure,
  telemetryLabel,
} from "./polling-session-end-support.ts";
import {
  detectFinalChanges,
  mirrorSubagentTranscript,
  waitForAcpMonitorEvent,
} from "./polling-session-end-runtime.ts";
import { handleSessionEndRateLimit } from "./polling-session-end-rate-limit.ts";

function sessionAgentType(state: any) {
  const prefix = state.sessionLabel.split("-")[0];
  return prefix || "forge";
}

function publishMonitorSignals(state: any) {
  const agentType = sessionAgentType(state);
  updateAcpPollObservability(
    { config: state.config },
    state.observabilityState,
    state.acpState,
    state.identity,
    agentType,
  );
  publishAcpTranscriptDelta(
    { config: state.config },
    state.identity,
    state.acpState,
    {
      label: telemetryLabel(state.identity, state.sessionLabel),
      agentType,
    },
  );
  state.lastProgressEmit = maybeEmitAcpPollProgress(
    { config: state.config },
    state.identity,
    state.acpState,
    {
      label: telemetryLabel(state.identity, state.sessionLabel),
      agentType,
      lastEmitAt: state.lastProgressEmit,
      intervalMs: state.progressIntervalMs,
      elapsedSeconds: Math.round((Date.now() - state.startTime) / 1000),
    },
  );
}

function hasRateLimitEvidence(acpState: any) {
  return (
    acpState.rateLimited === true || acpState.transcript?.rateLimited === true
  );
}

async function handleMonitorEvent(state: any, event: any) {
  if (state.sessionEndDetected || !event) return null;
  if (event.type === "fatal.error") {
    return {
      completed: false,
      hasChanges: false,
      reason: "monitor_adapter_failed",
      error: event.payload ?? { reason: "missing_monitor_adapter_payload" },
    };
  }
  const eventState = monitorStateFromAcpEvent(event);
  if (!eventState) return null;
  state.acpState = eventState;
  publishMonitorSignals(state);
  if (hasRateLimitEvidence(state.acpState))
    return handleSessionEndRateLimit(state);
  if (state.acpState.terminal) {
    state.sessionEndDetected = true;
    state.sessionEndGraceStart = Date.now();
    log(
      "INFO",
      `[${state.logLabel}] Session ${state.acpState.sessionState} (${state.acpState.reason}) — waiting ${state.graceMs / 1000}s for final writes to settle`,
    );
  }
  return null;
}

function terminalFailureResult(state: any, hasChanges: boolean) {
  const transcript = sanitizeAcpTranscriptEvidence(state.acpState.transcript);
  const failure = buildSessionLifecycleFailureResult({
    acpState: state.acpState,
    identity: state.rateLimitIdentity,
    hasChanges,
    transcript,
  });
  log(
    "ERROR",
    `[${state.logLabel}] Session lifecycle failure: ${failure.detail}`,
  );
  appendDurableSessionEndAlert(
    state.config,
    state.rateLimitIdentity,
    "agent_session_lifecycle_unstable",
    {
      session_state: state.acpState.sessionState || null,
      monitor_reason: state.acpState.reason || null,
      detail: failure.detail,
      has_changes: hasChanges,
      transcript,
    },
  );
  return failure;
}

function terminalResult(state: any) {
  if (
    !state.sessionEndDetected ||
    Date.now() - state.sessionEndGraceStart < state.graceMs
  )
    return null;
  const changes = detectFinalChanges(state);
  if (!changes.ok)
    return {
      completed: false,
      hasChanges: false,
      reason: "git_error",
      error: changes.error,
    };
  mirrorSubagentTranscript(state);
  if (isTerminalSessionFailure(state.acpState))
    return terminalFailureResult(state, Boolean(changes.hasChanges));
  log(
    changes.hasChanges ? "OK" : "WARN",
    `[${state.logLabel}] Session closed ${changes.hasChanges ? "with changes" : "without file changes — agent may have crashed or made no edits"}`,
  );
  return {
    completed: true,
    hasChanges: changes.hasChanges,
    reason: changes.hasChanges ? "session_ended" : "session_closed_no_changes",
    transcript: sanitizeAcpTranscriptEvidence(state.acpState.transcript),
  };
}

async function maybeNudge(state: any) {
  const elapsed =
    (Date.now() - state.startTime) / (state.timeoutMinutes * 60 * 1000);
  if (
    state.sessionEndDetected ||
    state.nudgeSent ||
    elapsed < state.nudgeThreshold
  )
    return;
  state.nudgeSent = true;
  const remaining = Math.round(state.budget.remainingMs() / 60000);
  log(
    "WARN",
    `[${state.logLabel}] Session at ${Math.round(elapsed * 100)}% of timeout — sending completion nudge`,
  );
  try {
    const policy = sessionSendGatewayPolicy(state.config);
    await sendGatewaySessionMessage(
      state.sessionKey,
      `TIMEOUT WARNING: You have ~${remaining} minutes remaining. Complete your current task and write your output files now. Unfinished work will be lost.`,
      policy.timeoutMs,
      { ...policy, budget: state.budget, signal: state.budget.signal },
    );
  } catch (error: any) {
    appendDurableSessionEndAlert(
      state.config,
      state.rateLimitIdentity,
      "timeout_nudge_failed",
      {
        error: errorMessage(error),
        timeout_minutes: state.timeoutMinutes,
        remaining_minutes: remaining,
      },
    );
  }
}

function logProgress(state: any) {
  const now = Date.now();
  const key = buildSessionProgressStateKey(state.sessionEndDetected);
  const changed =
    !state.lastSessionProgressStateKey ||
    key !== state.lastSessionProgressStateKey;
  if (
    !changed &&
    now - state.lastSessionProgressLogAt < state.progressIntervalMs
  )
    return;
  const elapsed = Math.round((now - state.startTime) / 1000);
  const remaining = Math.round(state.budget.remainingMs() / 1000);
  const suffix = state.sessionEndDetected
    ? " (session closed, waiting for final writes)"
    : "";
  log(
    "INFO",
    `[${state.logLabel}] Session active | ${elapsed}s elapsed, ${remaining}s remaining${suffix}`,
  );
  state.lastSessionProgressLogAt = now;
  state.lastSessionProgressStateKey = key;
}

async function nextMonitorEvent(state: any) {
  try {
    return await waitForAcpMonitorEvent(state);
  } catch (error: any) {
    if (error?.code === "PIPELINE_EVENT_WAIT_TIMEOUT") return null;
    const budgetAbort =
      error?.code === "PIPELINE_EVENT_WAIT_ABORTED" &&
      state.budget.signal?.aborted &&
      isBudgetExhaustedError(state.budget.signal.reason);
    if (
      budgetAbort ||
      (error?.code === "PIPELINE_EVENT_WAIT_ABORTED" &&
        state.budget.remainingMs() <= 0)
    ) {
      state.budget.throwIfExhausted();
    }
    throw error;
  }
}

export async function runSessionEndCycle(state: any) {
  state.budget.throwIfExhausted();
  const handled = await handleMonitorEvent(
    state,
    await nextMonitorEvent(state),
  );
  if (handled) return handled;
  const terminal = terminalResult(state);
  if (terminal) return terminal;
  await maybeNudge(state);
  logProgress(state);
  return null;
}

export function timeoutResult(state: any) {
  const transcript = state.acpState.transcript || null;
  const description = transcript
    ? transcript.lastActivityPoll === 0
      ? `active (${transcript.eventCount} events)`
      : `stale (no activity for ${transcript.lastActivityPoll} polls)`
    : "transcript_not_observed";
  log(
    "WARN",
    `[${state.logLabel}] Timeout — session still running after ${state.timeoutMinutes}min | Transcript: ${description}`,
  );
  appendDurableSessionEndAlert(
    state.config,
    state.rateLimitIdentity,
    "timeout",
    {
      timeout_minutes: state.timeoutMinutes,
      transcript: sanitizeAcpTranscriptEvidence(transcript),
    },
  );
  mirrorSubagentTranscript(state);
  const changes = detectFinalChanges(state);
  if (!changes.ok)
    return {
      completed: false,
      hasChanges: false,
      reason: "git_error",
      error: changes.error,
    };
  if (changes.hasChanges)
    log("OK", `[${state.logLabel}] Timeout reached with changes`);
  return {
    completed: false,
    hasChanges: changes.hasChanges,
    reason: changes.hasChanges ? "timeout_with_changes" : "timeout",
    transcript: sanitizeAcpTranscriptEvidence(transcript),
    ...(state.budgetError ? { error: state.budgetError } : {}),
  };
}
