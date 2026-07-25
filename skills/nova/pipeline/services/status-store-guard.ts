import { selectDefinedValue, selectTruthyValue } from "../optional-absence.ts";
import { getLifecycleModuleState } from "./status-store-lifecycle.ts";
import { resolveModuleIdForDir } from "./status-store-io.ts";

const STATUS_LIFECYCLE_GUARDED_FIELDS = Object.freeze([
  "status",
  "current_phase",
  "fail_count",
  "fail_summaries",
  "completed_at",
  "blockedAt",
  "blockedReason",
  "blockedPhase",
  "attempt_started_at",
  "phase_started_at",
]);

export const INITIAL_GUARDED_STATUS_VALUES: Record<string, any> = Object.freeze(
  {
    status: "PENDING",
    current_phase: null,
    fail_count: 0,
    fail_summaries: [],
    completed_at: null,
    blockedAt: null,
    blockedReason: null,
    blockedPhase: null,
    attempt_started_at: null,
    phase_started_at: null,
  },
);

export function objectRecord(value: any) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function arrayValue(value: any) {
  return Array.isArray(value) ? value : [];
}

export function firstTextValue(...values: any) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function stableGuardValue(value: any) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function lifecycleModuleToGuardStatus(lifecycleModule: any) {
  if (!lifecycleModule) return null;
  return {
    status: lifecycleModule.status,
    current_phase: lifecycleModule.current_phase,
    fail_count: lifecycleModule.fail_count,
    fail_summaries: lifecycleModule.fail_summaries,
    completed_at: lifecycleModule.completed_at,
    blockedAt: lifecycleModule.blocked_at,
    blockedReason: lifecycleModule.blocked_reason,
    blockedPhase: lifecycleModule.blocked_phase,
    attempt_started_at: lifecycleModule.attempt_started_at,
    phase_started_at: lifecycleModule.phase_started_at,
  };
}

function getUnguardedLifecycleFieldChanges(
  previousStatus: any,
  nextStatus: any,
) {
  const previous = selectDefinedValue(
    () => previousStatus,
    () => INITIAL_GUARDED_STATUS_VALUES,
  );
  const changes: any[] = [];
  for (const field of STATUS_LIFECYCLE_GUARDED_FIELDS) {
    const oldValue =
      previous[field] === undefined
        ? INITIAL_GUARDED_STATUS_VALUES[field]
        : previous[field];
    const newValue =
      nextStatus?.[field] === undefined
        ? INITIAL_GUARDED_STATUS_VALUES[field]
        : nextStatus[field];
    if (stableGuardValue(oldValue) !== stableGuardValue(newValue)) {
      changes.push({
        field,
        old_value: oldValue === undefined ? null : oldValue,
        new_value: newValue === undefined ? null : newValue,
      });
    }
  }
  return changes;
}

export function normalizeLifecycleMutation(candidate: any) {
  if (!candidate) return null;
  if (candidate.lifecycleMutation) return candidate.lifecycleMutation;
  if (
    selectTruthyValue(
      () => candidate.eventType,
      () => candidate.lifecycleIntent,
    )
  )
    return candidate;
  return null;
}

export function assertLifecycleGuardAllowsSave(
  config: any,
  dir: any,
  status: any,
  lifecycleMutation: any,
) {
  if (lifecycleMutation) return;
  const moduleId = firstTextValue(
    status?.module_id,
    resolveModuleIdForDir(config, dir),
  );
  const previousStatus = lifecycleModuleToGuardStatus(
    getLifecycleModuleState(config, moduleId),
  );
  const changes = getUnguardedLifecycleFieldChanges(
    previousStatus,
    status,
  ).filter((entry: any) => {
    if (
      entry.field === "status" &&
      ["FAIL", "BLOCKED"].includes(previousStatus?.status) &&
      status?.status === "READY_FOR_TESTING"
    ) {
      return false;
    }
    return true;
  });
  if (changes.length === 0) return;

  const fields = changes.map((entry: any) => entry.field).join(", ");
  const err = Object.assign(
    new Error(
      `Illegal status save: guarded lifecycle fields changed without lifecycle transition (${fields})`,
    ),
    {
      code: "STATUS_LIFECYCLE_GUARD_VIOLATION",
      guarded_fields: changes.map((entry: any) => entry.field),
      changes,
    },
  );
  throw err;
}
