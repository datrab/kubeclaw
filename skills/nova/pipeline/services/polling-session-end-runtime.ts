import fs from "fs";
import path from "path";
import { createAcpMonitorEventAdapter } from "../agents/acp-monitor.ts";
import { getTrackedAgent } from "../agents/lifecycle.ts";
import { log } from "../core/logger.ts";
import { moduleLogDir } from "../core/paths.ts";
import { copyTranscriptArtifact } from "../egress.ts";
import { headHash, invalidateHeadHash } from "../integrations/git-worktree.ts";
import { sessionStatusGatewayPolicy } from "../core/session-policy.ts";
import {
  createPipelineEventBus,
  waitForAny,
} from "./pipeline-event-contract.ts";
import { resolveSessionPollIdentity } from "./polling-identity.ts";
import { getRateLimitConfig } from "./rate-limit.ts";
import { getPipelineDefaultsConfig } from "./runtime-defaults.ts";
import {
  buildSessionPollRateLimitIdentity,
  errorMessage,
  pollingPolicyNumber,
  sessionPollBudget,
  worktreeChangeSignature,
} from "./polling-session-end-support.ts";

function missingSessionKey(label: string, logLabel: string) {
  log(
    "ERROR",
    `[${logLabel}] No sessionKey for label '${label}' — cannot poll`,
  );
  return { completed: false, hasChanges: false, reason: "no_session_key" };
}

function resolvedSessionContext(
  config: any,
  sessionLabel: any,
  logLabel: any,
  opts: any,
) {
  const tracked = getTrackedAgent(sessionLabel);
  if (!tracked?.sessionKey)
    return { errorResult: missingSessionKey(sessionLabel, logLabel) };
  const streamLogPath = tracked.streamLogPath ?? null;
  const moduleId = opts.moduleId ?? null;
  const identity = resolveSessionPollIdentity({
    tracked,
    explicitModuleId: moduleId,
    gateId: opts.gateId ?? null,
    gateType: opts.gateType ?? null,
    sessionKey: tracked.sessionKey,
    logLabel,
    sessionLabel,
  });
  const ignoredPaths = [streamLogPath, config.paths?.swarm_dir];
  const initialSignature = worktreeChangeSignature(config, ignoredPaths);
  if (!initialSignature.ok) {
    log("ERROR", `[${logLabel}] ${initialSignature.error.message}`);
    return {
      errorResult: {
        completed: false,
        hasChanges: false,
        reason: "git_error",
        error: initialSignature.error,
      },
    };
  }
  return {
    tracked,
    streamLogPath,
    moduleId,
    identity,
    ignoredPaths,
    initialSignature,
  };
}

function mutableSessionState(config: any, startTime: number) {
  return {
    startTime,
    headBefore: headHash(config),
    rateLimitPauses: 0,
    nudgeSent: false,
    sessionEndDetected: false,
    sessionEndGraceStart: 0,
    acpState: {},
    observabilityState: {
      gateway: { active: false, degradedAt: null },
      transcript: { active: false, degradedAt: null },
    },
    lastProgressEmit: startTime,
    lastSessionProgressLogAt: 0,
    lastSessionProgressStateKey: null,
    eventBus: createPipelineEventBus(),
    acpAdapter: null,
    pendingFatalEvent: null,
    budgetError: null,
  };
}

export function createSessionEndState(
  config: any,
  sessionLabel: any,
  timeoutMinutes: any,
  logLabel: any,
  opts: any,
) {
  const context = resolvedSessionContext(config, sessionLabel, logLabel, opts);
  if (context.errorResult) return context;
  const {
    tracked,
    streamLogPath,
    moduleId,
    identity,
    ignoredPaths,
    initialSignature,
  } = context;
  const startTime = Date.now();
  const budget = sessionPollBudget(opts, timeoutMinutes, logLabel);
  return {
    config,
    sessionLabel,
    timeoutMinutes,
    logLabel,
    opts,
    tracked,
    sessionKey: tracked.sessionKey,
    streamLogPath,
    moduleId,
    identity,
    rateLimitIdentity: buildSessionPollRateLimitIdentity({
      config,
      telemetryIdentity: identity,
      agentType: opts.agentType ?? null,
      attempt: opts.attempt ?? null,
    }),
    ignoredPaths,
    initialSignature,
    budget,
    interval:
      pollingPolicyNumber(config, "interval_seconds", { positive: true }) *
      1000,
    graceMs: pollingPolicyNumber(config, "session_end_grace_ms"),
    progressIntervalMs: pollingPolicyNumber(config, "progress_interval_ms"),
    nudgeThreshold: getPipelineDefaultsConfig(config).session_nudge_threshold,
    maxRateLimitPauses: getRateLimitConfig(config).max_pauses_per_module,
    ...mutableSessionState(config, startTime),
  };
}

export function mirrorSubagentTranscript(state: any) {
  const destination = moduleLogDir(state.config, state.moduleId);
  if (
    state.tracked.runtime !== "subagent" ||
    !state.streamLogPath ||
    !destination
  )
    return;
  try {
    if (!fs.existsSync(state.streamLogPath)) return;
    fs.mkdirSync(destination, { recursive: true });
    const target = path.join(destination, "subagent-transcript.jsonl");
    copyTranscriptArtifact(state.streamLogPath, target);
    log(
      "OK",
      `[${state.logLabel}] Subagent transcript metadata mirrored → ${target}`,
    );
  } catch (error: any) {
    log(
      "DEBUG",
      `[${state.logLabel}] Transcript mirror failed (non-critical): ${errorMessage(error).split("\n")[0]}`,
    );
  }
}

export function detectFinalChanges(state: any) {
  invalidateHeadHash(state.config);
  const finalHead = headHash(state.config);
  const signature = worktreeChangeSignature(state.config, state.ignoredPaths);
  if (!signature.ok) {
    log("ERROR", `[${state.logLabel}] ${signature.error.message}`);
    return { ok: false, error: signature.error };
  }
  return {
    ok: true,
    hasChanges:
      finalHead !== state.headBefore ||
      signature.signature !== state.initialSignature.signature,
  };
}

function fatalAdapterEvent(state: any, error: any) {
  return {
    type: "fatal.error",
    source: "acp_gateway",
    identity: state.identity,
    payload: {
      adapter: "acp_monitor",
      reason: "acp_monitor_adapter_failed",
      error: errorMessage(error),
    },
  };
}

export function startAcpAdapter(state: any) {
  state.acpAdapter = createAcpMonitorEventAdapter(
    state.sessionKey,
    state.streamLogPath,
    {
      eventBus: state.eventBus,
      identity: state.identity,
      budget: state.budget,
      pollMs: state.interval,
      monitorOpts: {
        ...state.config,
        gatewayStatusPolicy: sessionStatusGatewayPolicy(state.config),
      },
      initialState: state.acpState,
      stopOnTerminal: false,
      ...(state.opts.getAcpMonitorState
        ? { getAcpMonitorState: state.opts.getAcpMonitorState }
        : {}),
    },
  );
  state.acpAdapter.start()?.catch?.((error: any) => {
    state.pendingFatalEvent = fatalAdapterEvent(state, error);
    state.eventBus.emit(state.pendingFatalEvent);
  });
}

export async function waitForAcpMonitorEvent(state: any) {
  if (state.pendingFatalEvent) {
    const event = state.pendingFatalEvent;
    state.pendingFatalEvent = null;
    return event;
  }
  return waitForAny(
    state.eventBus,
    ["acp.session.state", "acp.transcript.delta", "fatal.error"],
    state.identity,
    {
      signal: state.budget.signal,
      budget: state.budget,
      timeoutMs: Math.min(state.interval, state.budget.remainingMs()),
    },
  );
}

export async function stopAcpAdapter(state: any, reason: any) {
  if (!state.acpAdapter) return;
  const adapter = state.acpAdapter;
  state.acpAdapter = null;
  adapter.stop(reason);
  await adapter.done?.catch?.(() => {});
}
