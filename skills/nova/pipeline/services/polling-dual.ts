// services/polling-dual.ts — Buster Redis+local lifecycle completion wait helpers.
// Active module completion waits on event adapters/controllers.

import { log } from "../core/logger.ts";
import { getRunId } from "../core/runtime.ts";
import { completionStreamKey, moduleBusterOutputPath } from "../core/paths.ts";
import { loadStatus } from "./status-store.ts";
import {
  buildModuleTerminalOwnedRedisRateLimitExitResult,
  buildModuleSessionRateLimitStatus,
} from "./rate-limit.ts";
import { appendDurableOperatorAlert } from "./telemetry.ts";
import { waitForResilientRedisCompletion } from "./redis-wait.ts";
import {
  createDedicatedRedisCompletionClient,
  createLocalEvidenceEventAdapter,
  createRedisCompletionEventAdapter,
} from "./completion-event-adapters.ts";
import {
  resolveBusterCompletionEvent,
  waitForBusterCompletion,
} from "./buster-completion-controller.ts";
import { logRedisOperation, logRedisReceived } from "./redis-log.ts";
import { scanLatestCompletionFromTail } from "./redis-completion.ts";
import { resolveRedisCompletionPolicy } from "./redis-completion-policy.ts";
import { isBudgetExhaustedError } from "../timing.ts";

const STATUS = {
  FAIL: "FAIL",
};

function busterRuntimePolicyNumber(config, field) {
  const value = config?.buster?.runtime?.[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`config.buster.runtime.${field}: required number in swarm.config.json`);
  }
  return value;
}

function buildModuleRateLimitStatusOptions(
  config,
  moduleId,
  expectedIdentity = {},
) {
  return {
    moduleId,
    phase: "buster",
    identity: {
      agent_type: "buster",
      run_id: expectedIdentity.run_id ?? getRunId(config) ?? null,
      attempt: expectedIdentity.attempt ?? null,
      dispatch_id: expectedIdentity.dispatch_id ?? null,
      gateway_label: expectedIdentity.gateway_label ?? null,
      session_key: expectedIdentity.session_key ?? null,
    },
  };
}

function moduleCompletionWatchPath(config, moduleDir) {
  return moduleBusterOutputPath(config, moduleDir);
}

function buildModuleCompletionIdentity(moduleId, expectedIdentity = {}) {
  return {
    module_id: moduleId,
    ...(expectedIdentity.run_id ? { run_id: expectedIdentity.run_id } : {}),
    ...(expectedIdentity.attempt != null &&
    String(expectedIdentity.attempt) !== ""
      ? { attempt: expectedIdentity.attempt }
      : {}),
    ...(expectedIdentity.dispatch_id
      ? { dispatch_id: expectedIdentity.dispatch_id }
      : {}),
    ...(expectedIdentity.session_key
      ? { session_key: expectedIdentity.session_key }
      : {}),
  };
}

function appendDurableModuleCompletionAlert(
  config,
  moduleId,
  expectedIdentity = {},
  reason,
  extra = {},
) {
  appendDurableOperatorAlert(
    config,
    "module.operator_alert",
    {
      module_id: moduleId,
      attempt: expectedIdentity.attempt ?? null,
      dispatch_id: expectedIdentity.dispatch_id || null,
      gateway_label: expectedIdentity.gateway_label || null,
      session_key: expectedIdentity.session_key || null,
      reason,
      ...extra,
    },
    {
      severity: "CRITICAL",
      source: "completion_event_adapter",
      emitter: "nova/pipeline/services/polling-dual",
    },
  );
}

function buildModuleControllerPollResult({
  config,
  moduleDir,
  moduleId,
  expectedIdentity,
  pollResult,
  controllerResult,
}) {
  const moduleRateLimitStatusOptions = buildModuleRateLimitStatusOptions(
    config,
    moduleId,
    expectedIdentity,
  );
  if (controllerResult?.reason === "fatal_error") {
    appendDurableModuleCompletionAlert(
      config,
      moduleId,
      expectedIdentity,
      "completion_event_adapter_failed",
      {
        status: STATUS.FAIL,
        error:
          controllerResult.error?.error ||
          controllerResult.error?.reason ||
          "completion event adapter failed",
        _source: controllerResult.source || "system",
        event: controllerResult.event || null,
      },
    );
    return pollResult(false, "completion_event_adapter_failed", {
      module_id: moduleId,
      status: STATUS.FAIL,
      failure_class: "completion_event_adapter_failed",
      error:
        controllerResult.error?.error ||
        controllerResult.error?.reason ||
        "completion event adapter failed",
      _source: controllerResult.source || "system",
      event: controllerResult.event || null,
    });
  }

  const redisEntry = controllerResult?.redis_entry;
  const completion = controllerResult?.completion;
  if (!redisEntry?.status || !completion) {
    return pollResult(false, "completion_event_unresolved", {
      module_id: moduleId,
      status: STATUS.FAIL,
      reason: controllerResult?.reason || "unknown",
      failure_class: "completion_event_unresolved",
      _source: controllerResult?.source || "event_controller",
    });
  }

  const localStatus = loadStatus(config, moduleDir);
  const mappedStatus = completion.status;
  const visibleDrift = (completion.drift || []).filter(
    (entry) => entry.code !== "completion_identity_weak",
  );
  if (visibleDrift.length > 0) {
    log(
      "WARN",
      `Completion evidence drift for ${moduleId}: ${visibleDrift.map((entry) => entry.code).join(", ")}`,
    );
  }
  log(
    "OK",
    `Redis completion: status=${redisEntry.status} mapped=${mappedStatus} outcome=${completion.outcome} source=${redisEntry.source || "unknown"} run=${redisEntry.run_id || "—"} attempt=${redisEntry.attempt || "—"} dispatch=${redisEntry.dispatch_id || "—"}`,
  );

  if (completion.completion_conflict) {
    return pollResult(false, "completion_conflict", {
      module_id: moduleId,
      status: mappedStatus,
      failure_class: "completion_conflict",
      local_status: localStatus?.status || null,
      redis_status: redisEntry.status || null,
      completion_summary: redisEntry.summary || null,
      _source: "redis",
      _redis_entry: redisEntry,
      authority_policy: completion.authority_policy,
      drift: completion.drift,
    });
  }

  if (completion.terminalOwnedRateLimited) {
    return buildModuleTerminalOwnedRedisRateLimitExitResult(redisEntry, {
      expectedIdentity,
      moduleId,
      completionSummary: redisEntry.summary || null,
      forgeCommitHash: redisEntry.commit_hash || null,
    });
  }

  if (completion.rateLimited && !completion.targetReached) {
    return pollResult(
      false,
      "rate_limited",
      buildModuleSessionRateLimitStatus(
        redisEntry,
        moduleRateLimitStatusOptions,
      ),
    );
  }

  if (completion.timeout) {
    return pollResult(false, "timeout", {
      module_id: moduleId,
      status: STATUS.FAIL,
      failure_class: "timeout",
      completion_summary: redisEntry.summary || null,
      forge_commit_hash: redisEntry.commit_hash || null,
      _source: "redis",
      _redis_entry: redisEntry,
    });
  }

  if (completion.targetReached) {
    return pollResult(true, "target_reached", {
      module_id: moduleId,
      status: mappedStatus,
      completion_summary: redisEntry.summary || null,
      forge_commit_hash: redisEntry.commit_hash || null,
      _source: "redis",
      _redis_entry: redisEntry,
    });
  }

  if (completion.blocked)
    return pollResult(false, "blocked", {
      ...redisEntry,
      ...(redisEntry?.failure_class ? {} : { failure_class: "blocked" }),
    });

  return pollResult(false, "completion_event_unresolved", {
    module_id: moduleId,
    status: STATUS.FAIL,
    reason: controllerResult?.reason || "pending",
    failure_class: "completion_event_unresolved",
    _source: controllerResult?.source || "event_controller",
  });
}

export async function waitForModuleBusterCompletion(
  config,
  moduleDir,
  moduleId,
  expectedStatuses,
  timeoutMinutes,
  expectedIdentity = {},
  pollResult,
  opts = {},
) {
  const identity = buildModuleCompletionIdentity(moduleId, expectedIdentity);
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const budget = opts.budget || null;

  try {
    const redisCompletionPolicy = resolveRedisCompletionPolicy(config);
    const controllerResult = await waitForResilientRedisCompletion({
      config,
      streamKey: opts.deps?.streamKey || completionStreamKey(config),
      targetKind: "module",
      targetId: moduleId,
      expectedStatuses,
      expectedIdentity: identity,
      timeoutMs,
      watchPaths: [moduleCompletionWatchPath(config, moduleDir)],
      getLocalStatus: () => loadStatus(config, moduleDir),
      statusSource: "local_lifecycle",
      deps: opts.deps,
      budget,
      redisBlockMs: busterRuntimePolicyNumber(config, "completion_event_block_ms"),
      recoveryScanIntervalMs: busterRuntimePolicyNumber(config, "completion_recovery_scan_interval_ms"),
      tailScanBatchSize: redisCompletionPolicy.tailScanBatchSize,
      tailScanLimit: redisCompletionPolicy.tailScanLimit,
      createRedisCompletionEventAdapter,
      createLocalEvidenceEventAdapter,
      createRedisClient: createDedicatedRedisCompletionClient,
      scanLatestCompletionFromTail,
      waitForCompletion: waitForBusterCompletion,
      resolveCompletionEvent: resolveBusterCompletionEvent,
      log,
      logRedisOperation,
      logRedisReceived,
    });
    return buildModuleControllerPollResult({
      config,
      moduleDir,
      moduleId,
      expectedIdentity,
      pollResult,
      controllerResult,
    });
  } catch (error) {
    if (
      error?.code === "PIPELINE_EVENT_WAIT_TIMEOUT" ||
      isBudgetExhaustedError(error)
    ) {
      appendDurableModuleCompletionAlert(
        config,
        moduleId,
        expectedIdentity,
        "timeout",
        {
          status: STATUS.FAIL,
          timeout_ms: timeoutMs,
        },
      );
      return pollResult(false, "timeout", null, {
        failure_class: "timeout",
        ...(isBudgetExhaustedError(error) ? { error } : {}),
      });
    }
    throw error;
  }
}
