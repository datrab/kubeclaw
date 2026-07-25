import { getRunId } from "../../core/runtime.ts";
import {
  selectDefinedValue,
  selectTruthyValue,
} from "../../optional-absence.ts";

const LIFECYCLE_READ_MODELS_VERSION = "pipeline_lifecycle_read_models.v1";

export function createDefaultLifecycleReadModels(config: any) {
  return {
    schema_version: LIFECYCLE_READ_MODELS_VERSION,
    lifecycle_version: "pipeline_lifecycle.v1",
    run_id: selectTruthyValue(
      () => config?._runId,
      () =>
        selectTruthyValue(
          () => config?.run_id,
          () => getRunId(config),
        ),
    ),
    generated_at: new Date().toISOString(),
    last_event_id: null,
    last_event_type: null,
    event_count: 0,
    pipeline: null,
    progression: {
      modules_total: 0,
      modules_passed: 0,
      modules_failed: 0,
      modules_blocked: 0,
      modules_active: 0,
    },
    modules: {},
    gates: {},
    generators: {},
    validators: {},
    pipeline_steps: {},
    attempts: {},
    waits: { by_ref: {} },
    signals: { by_ref: {} },
    active_sessions: { modules: {}, gates: {} },
    cooldowns: { modules: {}, gates: {} },
  };
}

export function recomputeProgression(readModels: any) {
  const moduleEntries = Object.values(
    selectDefinedValue(
      () => readModels.modules,
      () => {},
    ),
  );
  readModels.progression = {
    modules_total: moduleEntries.length,
    modules_passed: moduleEntries.filter(
      (entry: any) => entry.status === "PASS",
    ).length,
    modules_failed: moduleEntries.filter(
      (entry: any) => entry.status === "FAIL",
    ).length,
    modules_blocked: moduleEntries.filter(
      (entry: any) => entry.status === "BLOCKED",
    ).length,
    modules_active: moduleEntries.filter((entry: any) =>
      ["IN_PROGRESS", "READY_FOR_TESTING", "TESTING", "RATE_LIMITED"].includes(
        entry.status,
      ),
    ).length,
  };
  return readModels.progression;
}
