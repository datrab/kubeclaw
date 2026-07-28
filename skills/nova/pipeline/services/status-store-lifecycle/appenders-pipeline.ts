import { getPipelineArtifactBundle } from "../artifact-bundle.ts";
import { buildPipelineRefs } from "./refs.ts";
import { loadLifecycleReadModels } from "./read-models.ts";
import { cloneSerializable } from "../serialization.ts";
import {
  selectDefinedValue,
  selectTruthyValue,
} from "../../optional-absence.ts";
import {
  appendLifecycleEvent,
  selectPresentValue,
  pipelineProgressModules,
  pipelineProgressGates,
  PIPELINE_RUN_COMPLETED_STATUS,
  PIPELINE_RUN_COMPLETED_REASON,
  PIPELINE_RUN_HALTED_REASON,
} from "./appenders-base.ts";
function buildPipelineStartData(config: any, progress: any, opts: any = {}) {
  const executionOrder = Array.isArray(progress?.execution_order)
    ? [...progress.execution_order]
    : [];
  return {
    run_mode: opts.module ? "single_module" : "full",
    resume: opts.resume === true,
    requested_module_id: selectTruthyValue(
      () => opts.module,
      () => null,
    ),
    entrypoint: "pipeline_runner",
    execution_order: executionOrder,
    modules: Object.entries(pipelineProgressModules(progress)).map(
      ([moduleId, mod]: any) => ({
        module_id: moduleId,
        title: selectTruthyValue(
          () => mod?.title,
          () => null,
        ),
        dir: selectTruthyValue(
          () => mod?.dir,
          () => null,
        ),
        depends_on: Array.isArray(mod?.depends_on) ? [...mod.depends_on] : [],
        stages: Array.isArray(mod?.stages) ? [...mod.stages] : [],
      }),
    ),
    gates: Object.entries(pipelineProgressGates(progress)).map(
      ([gateId, gate]: any) => ({
        gate_id: gateId,
        gate_type: selectTruthyValue(
          () => gate?.type,
          () => null,
        ),
        title: selectTruthyValue(
          () => gate?.title,
          () => null,
        ),
      }),
    ),
    fallback_model: selectTruthyValue(
      () => config?.fallback_model,
      () => null,
    ),
    models: cloneSerializable(
      selectTruthyValue(
        () => progress?.defaults?.models,
        () => null,
      ),
    ),
    nova_prompt_present: Boolean(opts.novaPrompt),
  };
}

function completedPipelineData(config: any, result: any) {
  const readModels = loadLifecycleReadModels(config);
  const artifacts = getPipelineArtifactBundle(config);
  return {
    terminal_status: selectDefinedValue(
      () => result?.terminal_status,
      () => PIPELINE_RUN_COMPLETED_STATUS,
    ),
    terminal_decision: selectTruthyValue(
      () => result?.terminal_decision,
      () => null,
    ),
    reason_code: selectPresentValue(
      result?.reason,
      PIPELINE_RUN_COMPLETED_REASON,
    ),
    duration_seconds: null,
    modules_passed: selectDefinedValue(
      () => readModels?.progression?.modules_passed,
      () => null,
    ),
    modules_failed: selectDefinedValue(
      () => readModels?.progression?.modules_failed,
      () => null,
    ),
    modules_blocked: selectDefinedValue(
      () => readModels?.progression?.modules_blocked,
      () => null,
    ),
    modules_total: selectDefinedValue(
      () => readModels?.progression?.modules_total,
      () => null,
    ),
    total_cost_usd: null,
    summary_json_path: artifacts.run_summary_path,
    pipeline_summary_path: artifacts.pipeline_summary_path,
    latest_json_path: artifacts.latest_json_path,
  };
}

function haltedPipelineData(result: any, options: any) {
  return {
    halt_reason: selectPresentValue(
      options.haltReason,
      result?.reason,
      PIPELINE_RUN_HALTED_REASON,
    ),
    terminal_status: selectTruthyValue(
      () => result?.terminal_status,
      () => null,
    ),
    terminal_decision: selectTruthyValue(
      () => result?.terminal_decision,
      () => null,
    ),
    step_type: selectTruthyValue(
      () => options.stepType,
      () => null,
    ),
    step_id: selectTruthyValue(
      () => options.stepId,
      () => null,
    ),
    attempt: selectDefinedValue(
      () => result?.attempt,
      () => null,
    ),
    dispatch_id: selectDefinedValue(
      () => result?.dispatch_id,
      () => null,
    ),
    gateway_label: selectDefinedValue(
      () => result?.gateway_label,
      () => null,
    ),
    session_key: selectDefinedValue(
      () => result?.session_key,
      () => null,
    ),
    last_failure: selectTruthyValue(
      () => result?.reason,
      () => null,
    ),
    fail_count: selectDefinedValue(
      () => result?.fail_count,
      () => null,
    ),
  };
}

export function appendPipelineLifecycleEvent(
  config: any,
  type: any,
  {
    progress = null,
    opts = {},
    result = null,
    stepType = null,
    stepId = null,
    haltReason = null,
  }: any = {},
) {
  const refs = buildPipelineRefs(config);
  const builders: Record<string, () => any> = {
    "pipeline_run.started": () =>
      buildPipelineStartData(config, progress, opts),
    "pipeline_run.completed": () => completedPipelineData(config, result),
    "pipeline_run.halted": () =>
      haltedPipelineData(result, { haltReason, stepType, stepId }),
  };
  const build = builders[type];
  if (!build)
    throw new Error(`Unsupported pipeline lifecycle event type: ${type}`);
  const data = build();

  return appendLifecycleEvent(config, { type, refs, data });
}
