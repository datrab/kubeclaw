import { selectDefinedValue } from "../optional-absence.ts";
import {
  applyGateCompletion,
  applyModuleCompletion,
  appendModuleLifecycleEvent,
  getLifecycleModuleState,
} from "./status-store-lifecycle.ts";
import {
  assertLifecycleGuardAllowsSave,
  normalizeLifecycleMutation,
} from "./status-store-guard.ts";
import { syncRuntimeSnapshotToReadModels } from "./status-store-projection.ts";

export function saveStatus(
  config: any,
  dir: any,
  status: any,
  lifecycleTransition: any = null,
) {
  status.updated_at = new Date().toISOString();

  const lifecycleMutation = normalizeLifecycleMutation(lifecycleTransition);
  assertLifecycleGuardAllowsSave(config, dir, status, lifecycleMutation);
  if (lifecycleMutation?.eventType) {
    appendModuleLifecycleEvent(config, dir, status, lifecycleMutation);
  }
  syncRuntimeSnapshotToReadModels(config, dir, status);
}

export function initStatus(moduleId: any, moduleConfig: any) {
  return {
    module_id: moduleId,
    title: moduleConfig.title,
    status: "PENDING",
    current_phase: null,
    fail_count: 0,
    fail_summaries: [],
    history: [],
    started_at: null,
    attempt_started_at: null,
    phase_started_at: null,
    completed_at: null,
    cost: {
      total_duration_seconds: 0,
      attempt_duration_seconds: 0,
    },
    validation: {
      attempt: 1,
      delivery_lint_passed: false,
      delivery_lint_passed_at: null,
      pre_check_passed: false,
      pre_check_passed_at: null,
    },
    forge_commit: null,
    buster_commit: null,
  };
}

// ---------------------------------------------------------------------------
// Prompt / transcript persistence
// ---------------------------------------------------------------------------
