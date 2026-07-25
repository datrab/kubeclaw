import { getAcpMonitorState } from "../agents/acp-monitor.ts";
import { log } from "../core/logger.ts";
import { getRunId } from "../core/runtime.ts";
import {
  sanitizeAcpTranscriptEvidence,
  sanitizeTranscriptDetail,
} from "../egress.ts";
import { projectSrcPath } from "../core/paths.ts";
import {
  AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE,
  shouldSettleAgentEnded,
} from "./agent-observability-forge-completion.ts";
import { forgeCompletionArtifactFile } from "./forge-completion.ts";
import { statusPollAgentType } from "./polling-core.ts";
import { publishAcpPollSignals } from "./polling-acp-signals.ts";
import { buildModuleSessionRateLimitStatus } from "./rate-limit.ts";
import {
  errorMessage,
  pollRateLimitIdentity,
  pollResult,
  requireTextValue,
} from "./polling-core.ts";
import {
  buildArtifactIdentity,
  completionFromArtifact,
  completionFromDiff,
} from "./polling-forge-artifact.ts";

function terminalDetail(detail: any, reason: any) {
  return detail != null ? detail : (reason ?? null);
}

function terminalGatewayLabel(identity: any, sessionLabel: any) {
  return identity.gateway_label != null
    ? identity.gateway_label
    : (sessionLabel ?? null);
}

async function readAgentEnded(state: any, identity: any) {
  if (state.observedAgentEnded || !state.hookReader) return;
  try {
    state.observedAgentEnded = await state.hookReader.read(identity);
    if (!state.observedAgentEnded) return;
    state.observedAgentEndedAt = Date.now();
    log(
      "INFO",
      `[${state.moduleDir}] agent.ended telemetry observed — waiting ${state.settleMs / 1000}s for final writes`,
    );
  } catch (error: any) {
    state.hookReaderError = error;
    state.hookReaderDegraded = true;
    state.hookReader.close?.();
    state.hookReader = null;
    log(
      "WARN",
      `[${state.moduleDir}] agent.ended telemetry reader degraded; ACP monitor remains diagnostic only (${errorMessage(error)})`,
    );
  }
}

function observedAgentResult(state: any, identity: any) {
  if (!state.observedAgentEnded) return null;
  if (
    shouldSettleAgentEnded(
      state.observedAgentEndedAt,
      Date.now(),
      state.settleMs,
    )
  ) {
    return {
      done: false,
      logMsg: "agent_ended=observed settling_final_writes",
    };
  }
  const artifact = completionFromArtifact(state, identity, null, true);
  if (artifact?.done) return artifact;
  return {
    done: true,
    result: completionFromDiff(
      state,
      state.observedAgentEnded,
      AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE,
    ),
  };
}

function rateLimitResult(
  state: any,
  currentStatus: any,
  pollIdentity: any,
  agentType: any,
) {
  const moduleId = requireTextValue(
    pollIdentity.module_id,
    "poll_identity.module_id",
  );
  const status = buildModuleSessionRateLimitStatus(
    {
      ...currentStatus,
      module_id: moduleId,
      run_id: getRunId(state.config) ?? null,
      attempt: pollIdentity.attempt ?? null,
      dispatch_id: pollIdentity.dispatch_id ?? null,
      gateway_label: pollIdentity.gateway_label ?? null,
      session_key: pollIdentity.session_key ?? null,
      agent_type: agentType,
      rate_limit_reason: state.acpState.detail,
      detail: state.acpState.detail,
    },
    {
      moduleId,
      phase: agentType,
      identity: pollRateLimitIdentity(state.config, pollIdentity, agentType),
    },
  );
  return { rate_limited: true, status };
}

function missingArtifactStatus(
  state: any,
  identity: any,
  pollIdentity: any,
  detail: any,
) {
  return {
    status: "FAIL",
    source: "acp_session_monitor_diagnostic",
    summary:
      "Forge session ended without canonical forge-completion.json artifact",
    detail: terminalDetail(detail, state.acpState.reason),
    completed_at: new Date().toISOString(),
    module_id: identity.module_id,
    dispatch_id: pollIdentity.dispatch_id ?? null,
    gateway_label: terminalGatewayLabel(pollIdentity, state.sessionLabel),
    session_key: pollIdentity.session_key ?? null,
    state: state.acpState.sessionState,
    reason: state.acpState.reason ?? null,
    missing_authority: "forge-completion.json",
    expected_completion_path: forgeCompletionArtifactFile(
      state.config,
      state.moduleDir,
    ),
    project_src_dir: projectSrcPath(state.config),
    swarm_dir: state.config.paths?.swarm_dir,
    repo_root: state.config.repo_root,
  };
}

function terminalResult(state: any, identity: any, pollIdentity: any) {
  const detail = sanitizeTranscriptDetail(state.acpState.detail);
  const transcript = sanitizeAcpTranscriptEvidence(state.acpState.transcript);
  const artifact = completionFromArtifact(state, identity, transcript, true);
  if (artifact?.done) return artifact;
  log(
    "WARN",
    `Session ${state.acpState.sessionState} ended without canonical forge-completion.json artifact (${state.acpState.reason}${detail ? `; ${detail}` : ""})`,
  );
  return {
    done: true,
    result: pollResult(
      false,
      "forge_completion_artifact_missing",
      missingArtifactStatus(state, identity, pollIdentity, detail),
      { transcript },
    ),
  };
}

async function acpResult(
  state: any,
  currentStatus: any,
  pollIdentity: any,
  identity: any,
) {
  if (!state.sessionLabel) return null;
  state.acpState = await getAcpMonitorState({
    config: state.config,
    sessionLabelOrKey: state.sessionLabel,
    previousState: state.acpState,
  });
  const agentType = statusPollAgentType(pollIdentity);
  state.lastProgressEmit = publishAcpPollSignals(
    { config: state.config },
    state.observabilityState,
    state.acpState,
    pollIdentity,
    agentType,
    {
      lastEmitAt: state.lastProgressEmit,
      intervalMs: state.progressIntervalMs,
      startedAt: state.startTime,
    },
  );
  if (state.acpState.rateLimited)
    return rateLimitResult(state, currentStatus, pollIdentity, agentType);
  return state.acpState.terminal
    ? terminalResult(state, identity, pollIdentity)
    : null;
}

export async function checkForgePollCycle(state: any) {
  const { currentStatus, pollIdentity, identity } = buildArtifactIdentity(
    state.config,
    state.moduleDir,
    state.opts,
    state.sessionLabel,
  );
  const artifact = completionFromArtifact(
    state,
    identity,
    null,
    !state.sessionLabel,
  );
  if (artifact) return artifact;
  await readAgentEnded(state, identity);
  const observed = observedAgentResult(state, identity);
  if (observed) return observed;
  const acp = await acpResult(state, currentStatus, pollIdentity, identity);
  if (acp) return acp;
  const fallback = state.hookReaderDegraded
    ? `fallback=acp_monitor${state.hookReaderError ? " reader_degraded" : " reader_unavailable"}`
    : "hook=waiting";
  return {
    done: false,
    logMsg: `observer_agent_ended=missing ${fallback}; awaiting typed completion artifact`,
    logLevel: "DEBUG",
  };
}
