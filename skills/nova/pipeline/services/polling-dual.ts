import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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

const COMPLETION_ADAPTER_FAILED_ERROR = "completion event adapter failed";
const COMPLETION_EVENT_CONTROLLER_SOURCE = "event_controller";
const COMPLETION_EVENT_PENDING_REASON = "pending";
const COMPLETION_SYSTEM_SOURCE = "system";

function completionFailureClass(entry) {
  return typeof entry?.failure_class === "string" && entry.failure_class.trim()
    ? entry.failure_class.trim()
    : null;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function controllerSource(controllerResult, fallbackSource) {
  return selectDefinedValue(() => (controllerResult?.source), () => (fallbackSource));
}

function controllerFailureError(controllerResult) {
  return selectDefinedValue(() => (selectDefinedValue(() => (controllerResult?.error?.error), () => (controllerResult?.error?.reason))), () => (COMPLETION_ADAPTER_FAILED_ERROR));
}

function isJsonParseFailure(error) {
  if (error instanceof SyntaxError) return true;
  const message = String(selectDefinedValue(() => (error?.message), () => ('')).toLowerCase());
  return message.includes('json') && (
    message.includes('parse')
    || message.includes('unexpected')
    || message.includes('expected')
    || message.includes('property name')
  );
}

function requireWaitFactory(value, name) {
  if (typeof value === "function") return value;
  throw new TypeError(`waitForModuleBusterCompletion requires ${name}`);
}

function completionWaitFactories(opts = {}) {
  const explicit = selectTruthyValue(() => (opts.deps), () => ({}));
  const adapterOverrides = selectTruthyValue(() => (explicit.completionEventAdapters), () => ({}));
  const hasAdapterFactoryOverride = selectTruthyValue(() => (hasOwn(adapterOverrides, "createRedisCompletionEventAdapter")), () => (hasOwn(adapterOverrides, "createLocalEvidenceEventAdapter")));
  const hasTailFactoryOverride = selectTruthyValue(() => (hasOwn(explicit, "createDedicatedRedisCompletionClient")), () => (hasOwn(explicit, "scanLatestCompletionFromTail")));
  if (
    hasAdapterFactoryOverride
    && (
      selectTruthyValue(() => (!hasOwn(adapterOverrides, "createRedisCompletionEventAdapter")), () => (!hasOwn(adapterOverrides, "createLocalEvidenceEventAdapter")))
    )
  ) {
    throw new TypeError("waitForModuleBusterCompletion requires complete completion event adapter overrides");
  }
  if (
    hasTailFactoryOverride
    && (
      selectTruthyValue(() => (!hasOwn(explicit, "createDedicatedRedisCompletionClient")), () => (!hasOwn(explicit, "scanLatestCompletionFromTail")))
    )
  ) {
    throw new TypeError("waitForModuleBusterCompletion requires complete Redis tail recovery overrides");
  }
  return {
    RedisCtor: hasOwn(adapterOverrides, "RedisCtor") ? adapterOverrides.RedisCtor : null,
    redisOptions: hasOwn(adapterOverrides, "redisOptions") ? adapterOverrides.redisOptions : null,
    createRedisCompletionEventAdapter: hasAdapterFactoryOverride
      ? requireWaitFactory(adapterOverrides.createRedisCompletionEventAdapter, "createRedisCompletionEventAdapter")
      : createRedisCompletionEventAdapter,
    createLocalEvidenceEventAdapter: hasAdapterFactoryOverride
      ? requireWaitFactory(adapterOverrides.createLocalEvidenceEventAdapter, "createLocalEvidenceEventAdapter")
      : createLocalEvidenceEventAdapter,
    createRedisClient: hasTailFactoryOverride
      ? requireWaitFactory(explicit.createDedicatedRedisCompletionClient, "createDedicatedRedisCompletionClient")
      : createDedicatedRedisCompletionClient,
    scanLatestCompletionFromTail: hasTailFactoryOverride
      ? requireWaitFactory(explicit.scanLatestCompletionFromTail, "scanLatestCompletionFromTail")
      : scanLatestCompletionFromTail,
  };
}

function busterRuntimePolicyNumber(config, field) {
  const value = config?.buster?.runtime?.[field];
  if (selectTruthyValue(() => (typeof value !== "number"), () => (!Number.isFinite(value)))) {
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
      run_id: selectDefinedValue(() => (selectDefinedValue(() => (expectedIdentity.run_id), () => (getRunId(config)))), () => (null)),
      attempt: selectDefinedValue(() => (expectedIdentity.attempt), () => (null)),
      dispatch_id: selectDefinedValue(() => (expectedIdentity.dispatch_id), () => (null)),
      gateway_label: selectDefinedValue(() => (expectedIdentity.gateway_label), () => (null)),
      session_key: selectDefinedValue(() => (expectedIdentity.session_key), () => (null)),
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
      attempt: selectDefinedValue(() => (expectedIdentity.attempt), () => (null)),
      dispatch_id: selectTruthyValue(() => (expectedIdentity.dispatch_id), () => (null)),
      gateway_label: selectTruthyValue(() => (expectedIdentity.gateway_label), () => (null)),
      session_key: selectTruthyValue(() => (expectedIdentity.session_key), () => (null)),
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
        error: controllerFailureError(controllerResult),
        _source: controllerSource(controllerResult, COMPLETION_SYSTEM_SOURCE),
        event: selectDefinedValue(() => (controllerResult.event), () => (null)),
      },
    );
    return pollResult(false, "completion_event_adapter_failed", {
      module_id: moduleId,
      status: STATUS.FAIL,
      failure_class: "completion_event_adapter_failed",
      error: controllerFailureError(controllerResult),
      _source: controllerSource(controllerResult, COMPLETION_SYSTEM_SOURCE),
      event: selectDefinedValue(() => (controllerResult.event), () => (null)),
    });
  }

  const redisEntry = controllerResult?.redis_entry;
  const completion = controllerResult?.completion;
  if (selectTruthyValue(() => (!redisEntry?.status), () => (!completion))) {
    return pollResult(false, "completion_event_unresolved", {
      module_id: moduleId,
      status: STATUS.FAIL,
      reason: selectDefinedValue(() => (controllerResult?.reason), () => ("missing_controller_reason")),
      failure_class: "completion_event_unresolved",
      _source: controllerSource(controllerResult, COMPLETION_EVENT_CONTROLLER_SOURCE),
    });
  }

  const localStatus = loadStatus(config, moduleDir);
  const mappedStatus = completion.status;
  const visibleDrift = (Array.isArray(completion.drift) ? completion.drift : []).filter(
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
    `Redis completion: status=${redisEntry.status} mapped=${mappedStatus} outcome=${completion.outcome} source=${selectTruthyValue(() => (redisEntry.source), () => ("missing_completion_source"))} run=${selectTruthyValue(() => (redisEntry.run_id), () => ("—"))} attempt=${selectTruthyValue(() => (redisEntry.attempt), () => ("—"))} dispatch=${selectTruthyValue(() => (redisEntry.dispatch_id), () => ("—"))}`,
  );

  if (completion.completion_conflict) {
    return pollResult(false, "completion_conflict", {
      module_id: moduleId,
      status: mappedStatus,
      failure_class: "completion_conflict",
      local_status: selectTruthyValue(() => (localStatus?.status), () => (null)),
      redis_status: selectTruthyValue(() => (redisEntry.status), () => (null)),
      completion_summary: selectTruthyValue(() => (redisEntry.summary), () => (null)),
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
      completionSummary: selectTruthyValue(() => (redisEntry.summary), () => (null)),
      forgeCommitHash: selectTruthyValue(() => (redisEntry.commit_hash), () => (null)),
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
      completion_summary: selectTruthyValue(() => (redisEntry.summary), () => (null)),
      forge_commit_hash: selectTruthyValue(() => (redisEntry.commit_hash), () => (null)),
      _source: "redis",
      _redis_entry: redisEntry,
    });
  }

  if (completion.targetReached) {
    const failureClass = completionFailureClass(redisEntry);
    return pollResult(true, "target_reached", {
      module_id: moduleId,
      status: mappedStatus,
      completion_summary: selectTruthyValue(() => (redisEntry.summary), () => (null)),
      forge_commit_hash: selectTruthyValue(() => (redisEntry.commit_hash), () => (null)),
      _source: "redis",
      _redis_entry: redisEntry,
      ...(failureClass ? { failure_class: failureClass } : {}),
    }, {
      ...(failureClass ? { failure_class: failureClass } : {}),
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
      reason: selectDefinedValue(() => (controllerResult?.reason), () => (COMPLETION_EVENT_PENDING_REASON)),
      failure_class: "completion_event_unresolved",
      _source: controllerSource(controllerResult, COMPLETION_EVENT_CONTROLLER_SOURCE),
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
  const budget = selectTruthyValue(() => (opts.budget), () => (null));

  try {
    const redisCompletionPolicy = resolveRedisCompletionPolicy(config);
    const waitFactories = completionWaitFactories(opts);
    const controllerResult = await waitForResilientRedisCompletion({
      config,
    streamKey: dualPollingStreamKeyAuthority(config, opts),
      targetKind: "module",
      targetId: moduleId,
      expectedStatuses,
      expectedIdentity: identity,
      timeoutMs,
      watchPaths: [moduleCompletionWatchPath(config, moduleDir)],
      getLocalStatus: () => loadStatus(config, moduleDir),
      statusSource: "local_lifecycle",
      RedisCtor: waitFactories.RedisCtor,
      redisOptions: waitFactories.redisOptions,
      budget,
      redisBlockMs: busterRuntimePolicyNumber(config, "completion_event_block_ms"),
      recoveryScanIntervalMs: busterRuntimePolicyNumber(config, "completion_recovery_scan_interval_ms"),
      tailScanBatchSize: redisCompletionPolicy.tailScanBatchSize,
      tailScanLimit: redisCompletionPolicy.tailScanLimit,
      createRedisCompletionEventAdapter: waitFactories.createRedisCompletionEventAdapter,
      createLocalEvidenceEventAdapter: waitFactories.createLocalEvidenceEventAdapter,
      createRedisClient: waitFactories.createRedisClient,
      scanLatestCompletionFromTail: waitFactories.scanLatestCompletionFromTail,
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
      selectTruthyValue(() => (error?.code === "PIPELINE_EVENT_WAIT_TIMEOUT"), () => (isBudgetExhaustedError(error)))
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
    if (isJsonParseFailure(error)) {
      const errorText = controllerFailureError({ error: { error: error?.message } });
      appendDurableModuleCompletionAlert(
        config,
        moduleId,
        expectedIdentity,
        "parse_corrupted",
        {
          status: STATUS.FAIL,
          error: errorText,
        },
      );
      return pollResult(false, "parse_corrupted", {
        module_id: moduleId,
        status: STATUS.FAIL,
        failure_class: "parse_corrupted",
        error: errorText,
        _source: "completion_wait",
      }, {
        failure_class: "parse_corrupted",
        error,
      });
    }
    throw error;
  }
}

function dualPollingStreamKeyAuthority(config, opts) {
  if (opts.deps?.streamKey) return opts.deps.streamKey;
  return completionStreamKey(config);
}
