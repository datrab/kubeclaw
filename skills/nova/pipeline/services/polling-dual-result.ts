import { log } from "../core/logger.ts";
import { getRunId } from "../core/runtime.ts";
import { loadStatus } from "./status-store.ts";
import {
  buildModuleSessionRateLimitStatus,
  buildModuleTerminalOwnedRedisRateLimitExitResult,
} from "./rate-limit.ts";
import { appendDurableOperatorAlert } from "./telemetry.ts";

const FAIL = "FAIL";

function source(result: any, fallback: string) {
  return result?.source ?? fallback;
}

export function controllerFailureError(result: any) {
  if (result?.error?.error != null) return result.error.error;
  return result?.error?.reason ?? "completion event adapter failed";
}

export function appendModuleCompletionAlert(
  state: any,
  reason: string,
  extra: any = {},
) {
  appendDurableOperatorAlert(
    state.config,
    "module.operator_alert",
    {
      module_id: state.moduleId,
      attempt: state.expectedIdentity.attempt ?? null,
      dispatch_id: state.expectedIdentity.dispatch_id ?? null,
      gateway_label: state.expectedIdentity.gateway_label ?? null,
      session_key: state.expectedIdentity.session_key ?? null,
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

function fatalResult(state: any, controller: any) {
  const error = controllerFailureError(controller);
  const status = {
    module_id: state.moduleId,
    status: FAIL,
    failure_class: "completion_event_adapter_failed",
    error,
    _source: source(controller, "system"),
    event: controller.event ?? null,
  };
  appendModuleCompletionAlert(state, "completion_event_adapter_failed", status);
  return state.pollResult(false, "completion_event_adapter_failed", status);
}

function unresolvedResult(state: any, controller: any) {
  return state.pollResult(false, "completion_event_unresolved", {
    module_id: state.moduleId,
    status: FAIL,
    reason: controller?.reason ?? "missing_controller_reason",
    failure_class: "completion_event_unresolved",
    _source: source(controller, "event_controller"),
  });
}

function rateLimitOptions(state: any) {
  const identity = state.expectedIdentity;
  const runId =
    identity.run_id != null
      ? identity.run_id
      : (getRunId(state.config) ?? null);
  return {
    moduleId: state.moduleId,
    phase: "buster",
    identity: {
      agent_type: "buster",
      run_id: runId,
      attempt: identity.attempt ?? null,
      dispatch_id: identity.dispatch_id ?? null,
      gateway_label: identity.gateway_label ?? null,
      session_key: identity.session_key ?? null,
    },
  };
}

function conflictResult(state: any, completion: any, redis: any) {
  const local = loadStatus(state.config, state.moduleDir);
  return state.pollResult(false, "completion_conflict", {
    module_id: state.moduleId,
    status: completion.status,
    failure_class: "completion_conflict",
    local_status: local?.status ?? null,
    redis_status: redis.status ?? null,
    completion_summary: redis.summary ?? null,
    _source: "redis",
    _redis_entry: redis,
    authority_policy: completion.authority_policy,
    drift: completion.drift,
  });
}

function timeoutResult(state: any, redis: any) {
  return state.pollResult(false, "timeout", {
    module_id: state.moduleId,
    status: FAIL,
    failure_class: "timeout",
    completion_summary: redis.summary ?? null,
    forge_commit_hash: redis.commit_hash ?? null,
    _source: "redis",
    _redis_entry: redis,
  });
}

function targetResult(state: any, completion: any, redis: any) {
  const failureClass =
    typeof redis.failure_class === "string" && redis.failure_class.trim()
      ? redis.failure_class.trim()
      : null;
  const status = {
    module_id: state.moduleId,
    status: completion.status,
    completion_summary: redis.summary ?? null,
    forge_commit_hash: redis.commit_hash ?? null,
    _source: "redis",
    _redis_entry: redis,
    ...(failureClass ? { failure_class: failureClass } : {}),
  };
  return state.pollResult(
    true,
    "target_reached",
    status,
    failureClass ? { failure_class: failureClass } : {},
  );
}

function resolvedResult(state: any, completion: any, redis: any) {
  if (completion.completion_conflict)
    return conflictResult(state, completion, redis);
  if (completion.terminalOwnedRateLimited) {
    return buildModuleTerminalOwnedRedisRateLimitExitResult(redis, {
      expectedIdentity: state.expectedIdentity,
      moduleId: state.moduleId,
      completionSummary: redis.summary ?? null,
      forgeCommitHash: redis.commit_hash ?? null,
    });
  }
  if (completion.rateLimited && !completion.targetReached) {
    return state.pollResult(
      false,
      "rate_limited",
      buildModuleSessionRateLimitStatus(redis, rateLimitOptions(state)),
    );
  }
  if (completion.timeout) return timeoutResult(state, redis);
  if (completion.targetReached) return targetResult(state, completion, redis);
  if (completion.blocked) {
    return state.pollResult(false, "blocked", {
      ...redis,
      ...(redis.failure_class ? {} : { failure_class: "blocked" }),
    });
  }
  return unresolvedResult(state, {
    reason: "pending",
    source: "event_controller",
  });
}

export function buildModuleControllerPollResult(state: any, controller: any) {
  if (controller?.reason === "fatal_error")
    return fatalResult(state, controller);
  const redis = controller?.redis_entry;
  const completion = controller?.completion;
  if (!redis?.status) return unresolvedResult(state, controller);
  if (!completion) return unresolvedResult(state, controller);
  const drift = (
    Array.isArray(completion.drift) ? completion.drift : []
  ).filter((entry: any) => entry.code !== "completion_identity_weak");
  if (drift.length > 0) {
    log(
      "WARN",
      `Completion evidence drift for ${state.moduleId}: ${drift.map((entry: any) => entry.code).join(", ")}`,
    );
  }
  log(
    "OK",
    `Redis completion: status=${redis.status} mapped=${completion.status} outcome=${completion.outcome} source=${redis.source ?? "missing_completion_source"} run=${redis.run_id ?? "—"} attempt=${redis.attempt ?? "—"} dispatch=${redis.dispatch_id ?? "—"}`,
  );
  return resolvedResult(state, completion, redis);
}
