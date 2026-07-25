import { selectDefinedValue } from "../optional-absence.ts";
import {
  loadLifecycleReadModels,
  saveLifecycleReadModels,
} from "./status-store-lifecycle.ts";
import { READ_MODEL_SOURCE_CANONICAL_EVENTS } from "./status-store-read-models.ts";
import {
  hasStrongActiveSessionIdentity,
  normalizeActiveSessionIdentity,
} from "./session-authority.ts";
import { resolveModuleIdForDir } from "./status-store-io.ts";
import {
  arrayValue,
  firstTextValue,
  INITIAL_GUARDED_STATUS_VALUES,
  objectRecord,
} from "./status-store-guard.ts";

function firstTruthy(...values: any[]): any {
  for (const value of values) if (value) return value;
  return null;
}

function activeSessionProjection(
  config: any,
  moduleId: string,
  status: any,
  activeAgent: any,
) {
  if (!activeAgent?.session_key) return null;
  const trackedAt = firstTextValue(activeAgent.started_at);
  if (!trackedAt) return null;
  const identity = normalizeActiveSessionIdentity({
    run_id: firstTextValue(activeAgent.run_id, config?._runId, config?.run_id),
    attempt: selectDefinedValue(
      () => activeAgent.attempt,
      () => null,
    ),
    dispatch_id: firstTextValue(activeAgent.dispatch_id, status?.dispatch_id),
    session_key: firstTruthy(activeAgent.session_key),
    gateway_label: firstTextValue(
      activeAgent.gateway_label,
      status?.gateway_label,
    ),
  });
  if (!hasStrongActiveSessionIdentity(identity)) return null;
  return {
    module_id: moduleId,
    ...identity,
    label: firstTruthy(activeAgent.label),
    runtime: firstTruthy(activeAgent.runtime),
    model: firstTruthy(activeAgent.model),
    stream_log_path: firstTruthy(activeAgent.stream_log_path),
    agent_id: firstTruthy(activeAgent.agent_id),
    phase: firstTruthy(activeAgent.phase, status?.current_phase),
    tracked_at: trackedAt,
    projection_source: READ_MODEL_SOURCE_CANONICAL_EVENTS,
  };
}

function identityProjection(
  status: any,
  existing: any,
  activeAgent: any,
  hasActiveAgentField: boolean,
) {
  return {
    dispatch_id: firstTruthy(
      activeAgent?.dispatch_id,
      status?.dispatch_id,
      hasActiveAgentField ? null : existing?.dispatch_id,
    ),
    session_key: firstTruthy(
      activeAgent?.session_key,
      status?.session_key,
      hasActiveAgentField ? null : existing?.session_key,
    ),
    gateway_label: firstTruthy(
      activeAgent?.gateway_label,
      status?.gateway_label,
      hasActiveAgentField ? null : existing?.gateway_label,
    ),
  };
}

function timingProjection(status: any, existing: any) {
  return {
    started_at: firstTruthy(status?.started_at, existing?.started_at),
    attempt_started_at: firstTruthy(
      status?.attempt_started_at,
      existing?.attempt_started_at,
    ),
    phase_started_at: firstTruthy(
      status?.phase_started_at,
      existing?.phase_started_at,
    ),
    completed_at: firstTruthy(status?.completed_at, existing?.completed_at),
  };
}

function blockedProjection(status: any, existing: any) {
  return {
    blocked_at: firstTruthy(
      status?.blockedAt,
      status?.blocked_at,
      existing?.blocked_at,
    ),
    blocked_reason: firstTruthy(
      status?.blockedReason,
      status?.blocked_reason,
      existing?.blocked_reason,
    ),
    blocked_phase: firstTruthy(
      status?.blockedPhase,
      status?.blocked_phase,
      existing?.blocked_phase,
    ),
    blocked_fail_count: selectDefinedValue(
      () => status?.blockedFailCount,
      () => null,
    ),
  };
}

function currentAttempt(status: any, existing: any) {
  if (status?.current_attempt == null || existing?.current_attempt == null) {
    return selectDefinedValue(
      () => status?.current_attempt,
      () => null,
    );
  }
  return Math.max(
    Number(status.current_attempt),
    Number(existing.current_attempt),
  );
}

function statusProjection(status: any, existing: any) {
  const nextStatus = selectDefinedValue(
    () => firstTextValue(status?.status, existing?.status),
    () => INITIAL_GUARDED_STATUS_VALUES.status,
  );
  const preservesRetryBridge = Boolean(
    existing &&
      ["FAIL", "BLOCKED"].includes(existing.status) &&
      nextStatus === "READY_FOR_TESTING" &&
      (status?.current_attempt == null ||
        Number(status.current_attempt) === Number(existing.current_attempt)),
  );
  return {
    status: preservesRetryBridge ? existing.status : nextStatus,
    current_phase: selectDefinedValue(
      () =>
        selectDefinedValue(
          () => status?.current_phase,
          () => existing?.current_phase,
        ),
      () => null,
    ),
    fail_count: selectDefinedValue(
      () =>
        selectDefinedValue(
          () => status?.fail_count,
          () => existing?.fail_count,
        ),
      () => INITIAL_GUARDED_STATUS_VALUES.fail_count,
    ),
    fail_summaries:
      arrayValue(status?.fail_summaries).length > 0
        ? arrayValue(status.fail_summaries)
        : arrayValue(existing?.fail_summaries),
  };
}

function moduleProjection(
  config: any,
  dir: any,
  moduleId: string,
  status: any,
  existing: any,
  activeAgent: any,
) {
  const progressModule = config?._progress?.modules?.[moduleId];
  const hasActiveAgentField = Object.prototype.hasOwnProperty.call(
    objectRecord(status),
    "active_agent",
  );
  return {
    ...objectRecord(existing),
    module_id: moduleId,
    title: firstTruthy(status?.title, existing?.title, progressModule?.title),
    module_dir: firstTruthy(dir, existing?.module_dir, progressModule?.dir),
    ...statusProjection(status, existing),
    ...timingProjection(status, existing),
    ...blockedProjection(status, existing),
    current_attempt: currentAttempt(status, existing),
    ...identityProjection(status, existing, activeAgent, hasActiveAgentField),
    validation: firstTruthy(status?.validation, existing?.validation),
    cost: firstTruthy(existing?.cost, status?.cost),
    projection_source: firstTextValue(
      existing?.projection_source,
      READ_MODEL_SOURCE_CANONICAL_EVENTS,
    ),
  };
}

function updateActiveSession(
  readModels: any,
  config: any,
  moduleId: string,
  status: any,
  activeAgent: any,
) {
  const projection = activeSessionProjection(
    config,
    moduleId,
    status,
    activeAgent,
  );
  if (projection) {
    readModels.active_sessions.modules[moduleId] = projection;
    return;
  }
  delete readModels.active_sessions.modules[moduleId];
}

export function syncRuntimeSnapshotToReadModels(
  config: any,
  dir: any,
  status: any,
) {
  const moduleId = firstTextValue(
    status?.module_id,
    resolveModuleIdForDir(config, dir),
  );
  if (!moduleId) return;
  const readModels = loadLifecycleReadModels(config);
  const existing = firstTruthy(readModels.modules?.[moduleId]);
  if (!existing && status?.status !== "PENDING") return;
  const activeAgent = firstTruthy(status?.active_agent);
  readModels.modules[moduleId] = moduleProjection(
    config,
    dir,
    moduleId,
    status,
    existing,
    activeAgent,
  );
  updateActiveSession(readModels, config, moduleId, status, activeAgent);
  saveLifecycleReadModels(config, readModels);
}
