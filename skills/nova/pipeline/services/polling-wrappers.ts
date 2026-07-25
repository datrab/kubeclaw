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
import {
  maybeEmitAcpPollProgress,
  publishAcpTranscriptDelta,
  updateAcpPollObservability,
} from "./polling-observability.ts";
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

export { archiveModuleCompletions } from "./polling-redis-completion.ts";
export {
  BudgetExhaustedError,
  createBudget,
  createBudgetFromMinutes,
  isBudgetExhaustedError,
  sleep,
} from "../timing.ts";
export { pollForSessionEnd } from "./polling-session-end.ts";

export {
  mapRedisStatus,
  isRedisTimeoutOutcome,
  isRedisRateLimitedOutcome,
  isBusterPipelineOwnedSource,
  isTerminalOwnedRateLimitedOutcome,
  projectCompletionState,
  adjudicateCompletionEvidence,
} from "./completion-adjudicator.ts";

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

import { pollStatus } from "./polling-status.ts";
import { pollForgeCompletion } from "./polling-forge.ts";
import { pollResult } from "./polling-core.ts";
export async function pollDual(
  config: any,
  moduleDir: any,
  moduleId: any,
  expectedStatuses: any,
  timeoutMinutes: any,
  expectedIdentity: any = {},
  opts: any = {},
) {
  return waitForModuleBusterCompletion({
    config,
    moduleDir,
    moduleId,
    expectedStatuses,
    timeoutMinutes,
    expectedIdentity,
    pollResult,
    opts,
  });
}

// ─── Rate-Limit Recovery Wrappers ─────────────────────────────────────────────

/** Status-backed rate-limit recovery for legacy/non-Forge callers. */
export async function pollWithRateLimitRecovery(
  config: any,
  moduleDir: any,
  expectedStatuses: any,
  timeoutMinutes: any,
  opts: any = {},
) {
  const budget = pollingBudget(opts, timeoutMinutes, moduleDir);
  return withRateLimitRecovery(
    config,
    moduleDir,
    () =>
      pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes, {
        ...opts,
        budget,
      }),
    { ...opts, budget, phase: "forge" },
  );
}

/** Forge-phase rate-limit recovery (wraps typed completion artifact polling). */
export async function pollForgeCompletionWithRateLimitRecovery(
  config: any,
  moduleDir: any,
  timeoutMinutes: any,
  opts: any = {},
) {
  const budget = pollingBudget(opts, timeoutMinutes, moduleDir);
  return withRateLimitRecovery(
    config,
    moduleDir,
    () =>
      pollForgeCompletion(config, moduleDir, timeoutMinutes, {
        ...opts,
        budget,
      }),
    { ...opts, budget, phase: "forge" },
  );
}

/** Buster-phase rate-limit recovery (wraps pollDual). */
export async function pollDualWithRateLimitRecovery(
  config: any,
  moduleDir: any,
  moduleId: any,
  expectedStatuses: any,
  timeoutMinutes: any,
  expectedIdentity: any = {},
  opts: any = {},
) {
  const budget = pollingBudget(opts, timeoutMinutes, moduleDir);
  return withRateLimitRecovery(
    config,
    moduleDir,
    () =>
      pollDual(
        config,
        moduleDir,
        moduleId,
        expectedStatuses,
        timeoutMinutes,
        expectedIdentity,
        { ...opts, budget },
      ),
    { ...opts, budget, phase: "buster", moduleId },
  );
}
