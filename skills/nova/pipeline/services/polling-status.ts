// services/polling.ts — Polling engine and lifecycle/ACP polling

import fs from "fs";
import { log } from "../core/logger.ts";
import { loadStatus } from "./status-store.ts";
import { getAcpMonitorState } from "../agents/acp-monitor.ts";
import { getTrackedAgent } from "../agents/lifecycle.ts";
import {
  sanitizeAcpTranscriptEvidence,
  sanitizeTranscriptDetail,
} from "../egress.ts";
import { resolveStatusPollIdentity } from "./polling-identity.ts";
import {
  maybeEmitAcpPollProgress,
  publishAcpTranscriptDelta,
  updateAcpPollObservability,
} from "./polling-observability.ts";
import { pollingPolicyNumber } from "./polling-policy.ts";

const STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  READY_FOR_TESTING: "READY_FOR_TESTING",
  TESTING: "TESTING",
  PASS: "PASS",
  FAIL: "FAIL",
  BLOCKED: "BLOCKED",
  RATE_LIMITED: "RATE_LIMITED",
};
import {
  objectRecord,
  phaseLogValue,
  pollGeneric,
  pollResult,
  requireTextValue,
  statusLogValue,
  statusPollAgentType,
} from "./polling-core.ts";
import {
  createAcpPollObservabilityState,
  publishAcpPollSignals,
} from "./polling-acp-signals.ts";
import {
  acpRateLimitResult,
  storedRateLimitResult,
} from "./polling-status-rate-limit.ts";

function storedStatusResult(state: any, status: any) {
  if (!status) return null;
  if (state.expectedStatuses.includes(status.status)) {
    return { done: true, result: pollResult(true, "target_reached", status) };
  }
  if (status.status === STATUS.BLOCKED) {
    return { done: true, result: pollResult(false, "blocked", status) };
  }
  return status.status === STATUS.RATE_LIMITED
    ? storedRateLimitResult(state, status)
    : null;
}

function acpTerminalResult(
  state: any,
  status: any,
  identity: any,
  agentType: any,
) {
  const detail = sanitizeTranscriptDetail(state.acpState.detail);
  const moduleId = requireTextValue(
    identity.module_id,
    "poll_identity.module_id",
  );
  log(
    "WARN",
    `Session ${state.acpState.sessionState} before target lifecycle status (${state.acpState.reason}${detail ? `; ${detail}` : ""})`,
  );
  return {
    done: true,
    result: pollResult(
      false,
      "session_ended_no_changes",
      {
        ...objectRecord(status),
        module_id: moduleId,
        gate_id: identity.gate_id,
        session_key: identity.session_key,
        current_phase: agentType,
        state: state.acpState.sessionState,
        reason: state.acpState.reason,
        detail,
      },
      { transcript: sanitizeAcpTranscriptEvidence(state.acpState.transcript) },
    ),
  };
}

async function acpStatusResult(state: any, status: any) {
  if (!state.sessionLabel) return null;
  state.acpState = await getAcpMonitorState({
    config: state.config,
    sessionLabelOrKey: state.sessionLabel,
    previousState: state.acpState,
  });
  const identity = resolveStatusPollIdentity(
    state.moduleDir,
    status,
    getTrackedAgent(state.sessionLabel),
    state.sessionLabel,
  );
  const agentType = statusPollAgentType(identity);
  state.lastProgressEmit = publishAcpPollSignals(
    { config: state.config },
    state.observabilityState,
    state.acpState,
    identity,
    agentType,
    {
      lastEmitAt: state.lastProgressEmit,
      intervalMs: state.progressIntervalMs,
      startedAt: state.startTime,
    },
  );
  if (state.acpState.rateLimited)
    return acpRateLimitResult(state, status, identity, agentType);
  return state.acpState.terminal
    ? acpTerminalResult(state, status, identity, agentType)
    : null;
}

async function checkStatusPollCycle(state: any) {
  const status = loadStatus(state.config, state.moduleDir);
  const stored = storedStatusResult(state, status);
  if (stored) return stored;
  const acp = await acpStatusResult(state, status);
  if (acp) return acp;
  return {
    done: false,
    logMsg: `status=${statusLogValue(status)} phase=${phaseLogValue(status)}`,
  };
}

export async function pollStatus(
  config: any,
  moduleDir: any,
  expectedStatuses: any,
  timeoutMinutes: any,
  opts: any = {},
) {
  const startTime = Date.now();
  const state = {
    config,
    moduleDir,
    expectedStatuses,
    sessionLabel: opts.sessionLabel,
    acpState: {},
    observabilityState: createAcpPollObservabilityState(),
    startTime,
    lastProgressEmit: startTime,
    progressIntervalMs: pollingPolicyNumber(config, "progress_interval_ms"),
  };
  return pollGeneric(
    config,
    () => checkStatusPollCycle(state),
    timeoutMinutes,
    moduleDir,
    opts,
  );
}

// ─── Forge Completion Polling (typed artifact + agent.ended authority) ──
// Forge completion closes as soon as the worker writes a valid typed
// forge-completion.json artifact. Canonical agent.ended telemetry remains
// useful for diff-derived readiness, but Nova no longer waits on hook/session
// timing once the worker has published its durable completion contract.
