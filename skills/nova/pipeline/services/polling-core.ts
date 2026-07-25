import { selectDefinedValue, selectTruthyValue } from "../optional-absence.ts";
// services/polling.ts — Polling engine and lifecycle/ACP polling

import fs from "fs";
import { log } from "../core/logger.ts";
import { getRunId } from "../core/runtime.ts";
import { loadStatus } from "./status-store.ts";
import {
  getAcpMonitorState,
  getAcpMonitorConfig,
} from "../agents/acp-monitor.ts";
import { getTrackedAgent } from "../agents/lifecycle.ts";
import {
  withRateLimitRecovery,
  buildModuleSessionRateLimitStatus,
} from "./rate-limit.ts";
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from "./correlation.ts";
import { transitionModuleStatus } from "../lifecycle-state.ts";
import {
  sanitizeAcpTranscriptEvidence,
  sanitizeTranscriptDetail,
} from "../egress.ts";
import {
  buildAcpPollLogKey,
  resolveFilePollIdentity,
  resolveStatusPollIdentity,
  sessionLabelAgentType,
} from "./polling-identity.ts";
import { waitForModuleBusterCompletion } from "./polling-dual.ts";
import {
  AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE,
  AGENT_OBSERVABILITY_FORGE_FALLBACK_NO_WORK_REASON,
  AGENT_OBSERVABILITY_FORGE_FALLBACK_READY_REASON,
  AGENT_OBSERVABILITY_FORGE_NO_WORK_REASON,
  AGENT_OBSERVABILITY_FORGE_READY_REASON,
  agentEndedSettleMs,
  buildForgeAgentEndedIdentity,
  buildForgeCompletionStatusFromDiff,
  collectMeaningfulForgeDiffEvidence,
  createAgentEndedTelemetryReader,
  shouldSettleAgentEnded,
} from "./agent-observability-forge-completion.ts";
import {
  forgeCompletionArtifactFile,
  invalidForgeCompletionArtifactStatus,
  readForgeCompletionArtifact,
} from "./forge-completion.ts";
import { projectSrcPath } from "../core/paths.ts";
import {
  BudgetExhaustedError,
  createBudgetFromMinutes,
  isBudgetExhaustedError,
  sleep,
} from "../timing.ts";
import { pollingBudget, pollingPolicyNumber } from "./polling-policy.ts";

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
const DEFAULT_FILE_POLL_AGENT_TYPE = "review";
const DEFAULT_STATUS_POLL_AGENT_TYPE = "forge";
const NO_STATUS_FILE_LOG_STATE = "no-status-file";
const MEANINGFUL_DIFF_EVIDENCE_FAILURE =
  "Unable to collect meaningful Forge diff evidence";

export function objectRecord(value: any) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function textValue(value: any) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function requireTextValue(value: any, field: any) {
  const normalized = textValue(value);
  if (!normalized) {
    throw new Error(`${field}: required non-empty string`);
  }
  return normalized;
}

export function errorMessage(error: any) {
  return error instanceof Error ? error.message : String(error);
}

export function pollProgressMessage(check: any) {
  return selectDefinedValue(
    () => textValue(check?.logMsg),
    () => "pending",
  );
}

export function pollProgressKey(check: any, progressMsg: any) {
  return selectDefinedValue(
    () => textValue(check?.logKey),
    () => progressMsg,
  );
}

export function filePollAgentType(
  pollIdentity: any,
  sessionLabel: any,
  label: any,
) {
  return selectDefinedValue(
    () =>
      selectDefinedValue(
        () => textValue(pollIdentity?.agent_type),
        () =>
          sessionLabelAgentType(
            selectDefinedValue(
              () => textValue(sessionLabel),
              () => label,
            ),
          ),
      ),
    () => DEFAULT_FILE_POLL_AGENT_TYPE,
  );
}

export function statusPollAgentType(pollIdentity: any) {
  return selectDefinedValue(
    () => textValue(pollIdentity?.agent_type),
    () => DEFAULT_STATUS_POLL_AGENT_TYPE,
  );
}

export function statusLogValue(status: any) {
  return selectDefinedValue(
    () => textValue(status?.status),
    () => NO_STATUS_FILE_LOG_STATE,
  );
}

export function pollRateLimitIdentity(
  config: any,
  pollIdentity: any,
  agentType: any,
) {
  return {
    agent_type: agentType,
    run_id: selectDefinedValue(
      () => getRunId(config),
      () => null,
    ),
    attempt: selectDefinedValue(
      () => pollIdentity.attempt,
      () => null,
    ),
    dispatch_id: selectDefinedValue(
      () => pollIdentity.dispatch_id,
      () => null,
    ),
    gateway_label: selectDefinedValue(
      () => pollIdentity.gateway_label,
      () => null,
    ),
    session_key: selectDefinedValue(
      () => pollIdentity.session_key,
      () => null,
    ),
  };
}

export function phaseLogValue(status: any) {
  return selectDefinedValue(
    () => textValue(status?.current_phase),
    () => "",
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

/**
 * Consistent poll result wrapper — all callers get the same shape.
 *
 * IMPORTANT: ok=true means "a terminal status was reached", NOT "module passed".
 * FAIL is a valid terminal status — the caller inspects status.status to decide
 * whether it's a PASS or FAIL and handles each case separately.
 *
 * @typedef {Object} PollResult
 * @property {boolean} ok - Whether a terminal status was reached (PASS, FAIL, etc.)
 * @property {string} reason - 'target_reached' | 'verdict_fail' | 'timeout' | 'blocked' | 'rate_limited' | 'rate_limit_exhausted' | 'parse_corrupted' | 'spawn_failed' | 'completion_conflict'
 * @property {object|null} status - The lifecycle read-model projection or Redis completion data
 * @property {object|null} transcript - Optional ACP transcript state when polling owns it
 */
export function pollResult(
  ok: any,
  reason: any,
  status: any = null,
  extra: any = {},
) {
  return { ok, reason, status, ...extra };
}

// ─── Generic Polling Engine ───────────────────────────────────────────────────

/**
 * Generic polling loop with rate-limit handling, parse-corruption tracking,
 * and deadline management. All polling in the pipeline shares this scaffolding.
 *
 * @param {object} config - Pipeline config
 * @param {function} checkFn - Called each cycle. Returns:
 *   { done: true, result: PollResult }              → terminal, return immediately
 *   { done: false, logMsg?: string, logKey?: string } → keep polling (optional status message)
 *   { rate_limited: true, status: object, ...extra } → rate limit detected
 *   { parse_error: true }                           → increment corruption counter
 * @param {number} timeoutMinutes - Max polling duration
 * @param {string} label - For log messages (e.g. "Gate 'review-01'" or "module-06")
 * @returns {PollResult}
 */
export async function pollGeneric(
  config: any,
  checkFn: any,
  timeoutMinutes: any,
  label: any = "poll",
  opts: any = {},
) {
  const intervalSeconds = pollingPolicyNumber(config, "interval_seconds", {
    positive: true,
  });
  const interval = intervalSeconds * 1000;
  const progressLogIntervalMs = pollingPolicyNumber(
    config,
    "progress_interval_ms",
  );
  const budget = pollingBudget(opts, timeoutMinutes, label);
  const startTime = Date.now();
  const state = {
    consecutiveParseFailures: 0,
    lastProgressLogAt: 0,
    lastProgressLogKey: null as string | null,
  };
  let firstCycle = true;
  log(
    "INFO",
    `[${label}] Polling every ${intervalSeconds}s | timeout: ${timeoutMinutes}min`,
  );

  try {
    while (true) {
      budget.throwIfExhausted();
      if (!firstCycle) {
        await sleep(interval, { budget });
      } else {
        firstCycle = false;
      }

      const check = await checkFn({ budget });

      const result = processGenericCheck(check, state, {
        label,
        startTime,
        budget,
        progressLogIntervalMs,
      });
      if (result) return result;
    }
  } catch (error: any) {
    if (!isBudgetExhaustedError(error)) throw error;
    if (typeof opts.onTimeoutBeforeResult === "function") {
      const timeoutResult = await opts.onTimeoutBeforeResult(error);
      if (timeoutResult) return timeoutResult;
    }
    log(
      "ERROR",
      `[${label}] Timeout after ${timeoutMinutes} minutes (${error.name})`,
    );
    return pollResult(false, "timeout", null, { error });
  }
}

export function processGenericCheck(check: any, state: any, context: any) {
  if (check.done) return check.result;
  if (check.parse_error) return processParseFailure(state, context.label);
  state.consecutiveParseFailures = 0;
  if (check.rate_limited) return rateLimitedPollResult(check, context.label);
  logGenericProgress(check, state, context);
  return null;
}

export function processParseFailure(state: any, label: string) {
  state.consecutiveParseFailures += 1;
  if (state.consecutiveParseFailures >= 10) {
    log(
      "ERROR",
      `[${label}] Parse corruption limit reached (${state.consecutiveParseFailures})`,
    );
    return pollResult(false, "parse_corrupted", null);
  }
  log("WARN", `[${label}] Parse failure ${state.consecutiveParseFailures}/10`);
  return null;
}

export function rateLimitedPollResult(check: any, label: string) {
  log("WARN", `[${label}] Rate limit detected — returning to caller`);
  const {
    status,
    rate_limited: _rateLimited,
    done: _done,
    parse_error: _parseError,
    logMsg: _logMsg,
    logKey: _logKey,
    result: _result,
    ...extra
  } = check;
  return pollResult(false, "rate_limited", status, extra);
}

export function logGenericProgress(check: any, state: any, context: any) {
  const message = pollProgressMessage(check),
    key = pollProgressKey(check, message),
    now = Date.now();
  const changed = !state.lastProgressLogKey || key !== state.lastProgressLogKey;
  if (!changed && now - state.lastProgressLogAt < context.progressLogIntervalMs)
    return;
  const elapsed = Math.round((now - context.startTime) / 1000);
  const remaining = Math.round(context.budget.remainingMs() / 1000);
  log(
    selectDefinedValue(
      () => textValue(check?.logLevel),
      () => "INFO",
    ) ?? "INFO",
    `[${context.label}] ${message} | ${elapsed}s elapsed, ${remaining}s remaining`,
  );
  state.lastProgressLogAt = now;
  state.lastProgressLogKey = key;
}

// ─── File Poller ──────────────────────────────────────────────────────────────
