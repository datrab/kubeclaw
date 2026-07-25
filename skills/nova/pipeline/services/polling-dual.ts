import { completionStreamKey, moduleBusterOutputPath } from "../core/paths.ts";
import { loadStatus } from "./status-store.ts";
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
import { log } from "../core/logger.ts";
import { logRedisOperation, logRedisReceived } from "./redis-log.ts";
import { scanLatestCompletionFromTail } from "./redis-completion.ts";
import { resolveRedisCompletionPolicy } from "./redis-completion-policy.ts";
import { isBudgetExhaustedError } from "../timing.ts";
import {
  appendModuleCompletionAlert,
  buildModuleControllerPollResult,
  controllerFailureError,
} from "./polling-dual-result.ts";

function hasOwn(value: any, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function requireFactory(value: any, name: string) {
  if (typeof value === "function") return value;
  throw new TypeError(`waitForModuleBusterCompletion requires ${name}`);
}

function validateOverrides(explicit: any, adapters: any) {
  const adapterOverride =
    hasOwn(adapters, "createRedisCompletionEventAdapter") ||
    hasOwn(adapters, "createLocalEvidenceEventAdapter");
  const tailOverride =
    hasOwn(explicit, "createDedicatedRedisCompletionClient") ||
    hasOwn(explicit, "scanLatestCompletionFromTail");
  if (
    adapterOverride &&
    (!hasOwn(adapters, "createRedisCompletionEventAdapter") ||
      !hasOwn(adapters, "createLocalEvidenceEventAdapter"))
  ) {
    throw new TypeError(
      "waitForModuleBusterCompletion requires complete completion event adapter overrides",
    );
  }
  if (
    tailOverride &&
    (!hasOwn(explicit, "createDedicatedRedisCompletionClient") ||
      !hasOwn(explicit, "scanLatestCompletionFromTail"))
  ) {
    throw new TypeError(
      "waitForModuleBusterCompletion requires complete Redis tail recovery overrides",
    );
  }
  return { adapterOverride, tailOverride };
}

function adapterFactories(adapters: any, override: boolean) {
  return {
    RedisCtor: hasOwn(adapters, "RedisCtor") ? adapters.RedisCtor : null,
    redisOptions: hasOwn(adapters, "redisOptions")
      ? adapters.redisOptions
      : null,
    createRedisCompletionEventAdapter: override
      ? requireFactory(
          adapters.createRedisCompletionEventAdapter,
          "createRedisCompletionEventAdapter",
        )
      : createRedisCompletionEventAdapter,
    createLocalEvidenceEventAdapter: override
      ? requireFactory(
          adapters.createLocalEvidenceEventAdapter,
          "createLocalEvidenceEventAdapter",
        )
      : createLocalEvidenceEventAdapter,
  };
}

function tailFactories(explicit: any, override: boolean) {
  return {
    createRedisClient: override
      ? requireFactory(
          explicit.createDedicatedRedisCompletionClient,
          "createDedicatedRedisCompletionClient",
        )
      : createDedicatedRedisCompletionClient,
    scanLatestCompletionFromTail: override
      ? requireFactory(
          explicit.scanLatestCompletionFromTail,
          "scanLatestCompletionFromTail",
        )
      : scanLatestCompletionFromTail,
  };
}

function completionWaitFactories(opts: any = {}) {
  const explicit = opts.deps || {};
  const adapters = explicit.completionEventAdapters || {};
  const { adapterOverride, tailOverride } = validateOverrides(
    explicit,
    adapters,
  );
  return {
    ...adapterFactories(adapters, adapterOverride),
    ...tailFactories(explicit, tailOverride),
  };
}

function runtimeNumber(config: any, field: string) {
  const value = config?.buster?.runtime?.[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `config.buster.runtime.${field}: required number in swarm.config.json`,
    );
  }
  return value;
}

function completionIdentity(moduleId: any, expected: any) {
  return {
    module_id: moduleId,
    ...(expected.run_id ? { run_id: expected.run_id } : {}),
    ...(expected.attempt != null && String(expected.attempt) !== ""
      ? { attempt: expected.attempt }
      : {}),
    ...(expected.dispatch_id ? { dispatch_id: expected.dispatch_id } : {}),
  };
}

function waitRequest(state: any, factories: any) {
  const policy = resolveRedisCompletionPolicy(state.config);
  return {
    config: state.config,
    streamKey: state.opts.deps?.streamKey || completionStreamKey(state.config),
    targetKind: "module",
    targetId: state.moduleId,
    expectedStatuses: state.expectedStatuses,
    expectedIdentity: completionIdentity(
      state.moduleId,
      state.expectedIdentity,
    ),
    timeoutMs: state.timeoutMs,
    watchPaths: [moduleBusterOutputPath(state.config, state.moduleDir)],
    getLocalStatus: () => loadStatus(state.config, state.moduleDir),
    statusSource: "local_lifecycle",
    RedisCtor: factories.RedisCtor,
    redisOptions: factories.redisOptions,
    budget: state.opts.budget || null,
    redisBlockMs: runtimeNumber(state.config, "completion_event_block_ms"),
    recoveryScanIntervalMs: runtimeNumber(
      state.config,
      "completion_recovery_scan_interval_ms",
    ),
    tailScanBatchSize: policy.tailScanBatchSize,
    tailScanLimit: policy.tailScanLimit,
    ...factories,
    waitForCompletion: waitForBusterCompletion,
    resolveCompletionEvent: resolveBusterCompletionEvent,
    log,
    logRedisOperation,
    logRedisReceived,
  };
}

function timeoutErrorResult(state: any, error: any) {
  appendModuleCompletionAlert(state, "timeout", {
    status: "FAIL",
    timeout_ms: state.timeoutMs,
  });
  return state.pollResult(false, "timeout", null, {
    failure_class: "timeout",
    ...(isBudgetExhaustedError(error) ? { error } : {}),
  });
}

function parseErrorResult(state: any, error: any) {
  const errorText = controllerFailureError({
    error: { error: error?.message },
  });
  appendModuleCompletionAlert(state, "parse_corrupted", {
    status: "FAIL",
    error: errorText,
  });
  return state.pollResult(
    false,
    "parse_corrupted",
    {
      module_id: state.moduleId,
      status: "FAIL",
      failure_class: "parse_corrupted",
      error: errorText,
      _source: "completion_wait",
    },
    { failure_class: "parse_corrupted", error },
  );
}

function isJsonParseFailure(error: any) {
  if (error instanceof SyntaxError) return true;
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("json") &&
    ["parse", "unexpected", "expected", "property name"].some((part) =>
      message.includes(part),
    )
  );
}

export async function waitForModuleBusterCompletion(request: any) {
  const state = {
    ...request,
    expectedIdentity: request.expectedIdentity || {},
    opts: request.opts || {},
    timeoutMs: request.timeoutMinutes * 60 * 1000,
  };
  try {
    const factories = completionWaitFactories(state.opts);
    const controller = await waitForResilientRedisCompletion(
      waitRequest(state, factories),
    );
    return buildModuleControllerPollResult(state, controller);
  } catch (error: any) {
    if (
      error?.code === "PIPELINE_EVENT_WAIT_TIMEOUT" ||
      isBudgetExhaustedError(error)
    ) {
      return timeoutErrorResult(state, error);
    }
    if (isJsonParseFailure(error)) return parseErrorResult(state, error);
    throw error;
  }
}
