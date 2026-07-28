// services/polling.ts — Polling engine and lifecycle/ACP polling

import fs from "fs";
import { withRateLimitRecovery } from "./rate-limit.ts";
import { waitForModuleBusterCompletion } from "./polling-dual.ts";
import { pollingBudget } from "./polling-policy.ts";

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
