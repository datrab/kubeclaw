// services/polling.ts — Polling engine and lifecycle/ACP polling

import fs from "fs";
import { log } from "../core/logger.ts";
import { getRunId } from "../core/runtime.ts";
import {
  getAcpMonitorState,
  getAcpMonitorConfig,
} from "../agents/acp-monitor.ts";
import { getTrackedAgent } from "../agents/lifecycle.ts";
import {
  sanitizeAcpTranscriptEvidence,
  sanitizeTranscriptDetail,
} from "../egress.ts";
import {
  buildAcpPollLogKey,
  resolveFilePollIdentity,
} from "./polling-identity.ts";
import {
  maybeEmitAcpPollProgress,
  publishAcpTranscriptDelta,
  updateAcpPollObservability,
} from "./polling-observability.ts";
import { pollingPolicyNumber } from "./polling-policy.ts";

import {
  filePollAgentType,
  pollGeneric,
  pollResult,
} from "./polling-core.ts";
import {
  createAcpPollObservabilityState,
  publishAcpPollSignals,
} from "./polling-acp-signals.ts";
function fileRateLimitResult(state: any, identity: any, agentType: any) {
  const { acpState, config } = state;
  log(
    "WARN",
    `[${state.label}] ACP monitor detected rate limit: ${acpState.detail}`,
  );
  return {
    rate_limited: true,
    status: {
      ...(getRunId(config) == null ? {} : { run_id: getRunId(config) }),
      module_id: identity.module_id,
      gate_id: identity.gate_id,
      ...(identity.gate_id == null
        ? {}
        : { gate_type: identity.gate_type ?? null }),
      session_key: identity.session_key,
      attempt: identity.attempt,
      dispatch_id: identity.dispatch_id,
      gateway_label: identity.gateway_label ?? null,
      current_phase: agentType,
      agent_type: agentType,
      reason: acpState.detail,
      detail: acpState.detail,
      transcript: sanitizeAcpTranscriptEvidence(acpState.transcript),
      transcript_detail: sanitizeTranscriptDetail(
        acpState.transcript?.lastDetail,
      ),
    },
  };
}

function fileTerminalResult(state: any, identity: any) {
  const detail = sanitizeTranscriptDetail(state.acpState.detail);
  log(
    "WARN",
    `[${state.label}] ACP monitor terminal (${state.acpState.reason}): ${detail ?? state.acpState.sessionState}`,
  );
  return {
    done: true,
    result: pollResult(
      false,
      "session_ended_no_output",
      {
        state: state.acpState.sessionState,
        reason: state.acpState.reason,
        detail,
        module_id: identity.module_id,
        gate_id: identity.gate_id,
        session_key: identity.session_key,
      },
      { transcript: sanitizeAcpTranscriptEvidence(state.acpState.transcript) },
    ),
  };
}

async function checkFilePollCycle(state: any) {
  if (fs.existsSync(state.filePath)) {
    return {
      done: true,
      result: pollResult(true, "target_reached", { file: state.filePath }),
    };
  }
  if (!state.sessionLabel) return { done: false };
  state.acpState = await getAcpMonitorState({
    config: state.config,
    sessionLabelOrKey: state.sessionLabel,
    previousState: state.acpState,
  });
  const identity = resolveFilePollIdentity(
    state.label,
    getTrackedAgent(state.sessionLabel),
  );
  const agentType = filePollAgentType(
    identity,
    state.sessionLabel,
    state.label,
  );
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
    return fileRateLimitResult(state, identity, agentType);
  if (state.acpState.terminal) return fileTerminalResult(state, identity);
  const limit = getAcpMonitorConfig(state.config).poll_limit;
  return {
    done: false,
    logMsg: `session=${state.acpState.sessionState} unknown=${state.acpState.unknownPolls}/${limit} transcript_stale=${state.acpState.transcriptStalePolls}/${limit}`,
    logKey: buildAcpPollLogKey(state.acpState),
  };
}

export async function pollForFile(
  config: any,
  filePath: any,
  timeoutMinutes: any,
  label: any = "file-poll",
  sessionLabel: any = null,
  opts: any = {},
) {
  const startTime = Date.now();
  const state = {
    config,
    filePath,
    label,
    sessionLabel,
    startTime,
    acpState: {},
    observabilityState: createAcpPollObservabilityState(),
    lastProgressEmit: startTime,
    progressIntervalMs: pollingPolicyNumber(config, "progress_interval_ms"),
  };
  return pollGeneric(
    config,
    () => checkFilePollCycle(state),
    timeoutMinutes,
    label,
    opts,
  );
}

// ─── Status Poller ────────────────────────────────────────────────────────────

/**
 * Status poller — reads lifecycle read-model status until a target status is reached.
 * Lifecycle read models are the only local polling authority for module state.
 * Built on pollGeneric. Returns immediately on RATE_LIMITED (caller decides).
 *
 * opts.sessionLabel — if set, also checks ACP session state each cycle.
 * This helper is not the Forge completion path; Forge completion uses
 * pollForgeCompletion and the typed forge-completion.json artifact.
 */
