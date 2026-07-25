import { assertCompletion } from "../../completion.ts";
import {
  appendJsonLine,
  lifecycleEventsPath,
  withLifecycleAppendLock,
} from "./storage.ts";
import { buildLifecycleIdempotencyKey } from "./idempotency.ts";
import { getPipelineArtifactBundle } from "../artifact-bundle.ts";
import {
  buildCooldownRefs,
  buildGateEvaluationRefs,
  buildModuleAttemptRefs,
  buildPipelineRefs,
  buildResumeSignalRefs,
  buildWaitRefs,
  getActiveProgress,
  resolveModuleAttempt,
  resolveModuleCommit,
  resolveModuleConfig,
} from "./refs.ts";
import {
  createDefaultLifecycleReadModels,
  loadLifecycleReadModels,
  readLifecycleEvents,
  rebuildLifecycleReadModels,
  saveLifecycleReadModels,
} from "./read-models.ts";
import { ensureLifecycleEventLegal } from "./legality.ts";
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from "../correlation.ts";
import { normalizeFailureClass } from "../failure-semantics.ts";
import { cloneSerializable } from "../serialization.ts";
import {
  selectDefinedValue,
  selectTruthyValue,
} from "../../optional-absence.ts";
import {
  firstDefinedValue as firstDefined,
  objectRecord,
  selectPresent,
} from "../../value-boundary.ts";
import {
  appendLifecycleEvent,
  selectPresentValue,
  eventOccurredAt,
  requiredText,
  pipelineProgressModules,
  pipelineProgressGates,
  PIPELINE_RUN_COMPLETED_STATUS,
  PIPELINE_RUN_COMPLETED_REASON,
  PIPELINE_RUN_HALTED_REASON,
  STALE_RECOVERY_ATTEMPT,
  STALE_RECOVERY_TARGET_STATUS,
  STALE_RECOVERY_REASON,
  MODULE_READY_FOR_TESTING_STATUS,
  MODULE_ATTEMPT_FAILED_REASON,
  MODULE_LIFECYCLE_PHASE_BUSTER,
  MODULE_BLOCKED_REASON,
  MODULE_COMPLETION_PASS_STATUS,
  MODULE_COMPLETION_FAIL_STATUS,
  MODULE_COMPLETION_BLOCKED_STATUS,
  MODULE_COMPLETION_ERROR_STATUS,
  GATE_COMPLETION_PASS_STATUS,
  GATE_COMPLETION_BLOCKED_STATUS,
  GATE_COMPLETION_FAIL_STATUS,
  GATE_COMPLETION_ERROR_STATUS,
  LIFECYCLE_READ_MODELS_VERSION,
} from "./appenders-base.ts";
function modulePhase(status: any, mutation: any) {
  return selectPresentValue(
    mutation.phase,
    mutation.previousPhase,
    status?.current_phase,
    status?.blockedPhase,
  );
}
function completionData(mutation: any) {
  const completion = objectRecord(mutation.completion);
  return completion ? { completion: cloneSerializable(completion) } : {};
}
function startedData(
  moduleConfig: any,
  status: any,
  mutation: any,
  attempt: number,
) {
  return {
    title: selectPresentValue(status?.title, moduleConfig?.title),
    module_dir: selectPresentValue(mutation.dir, moduleConfig?.dir),
    ...completionData(mutation),
    stages: Array.isArray(moduleConfig?.stages) ? [...moduleConfig.stages] : [],
    resume_from_status: mutation.oldStatus,
    blueprint_action: "skipped",
    fail_count_before: Math.max(0, attempt - 1),
    validation_attempt: firstDefined(status?.validation?.attempt, attempt),
  };
}
function readyData(status: any, mutation: any) {
  return {
    ...completionData(mutation),
    from_phase: firstDefined(
      mutation.previousPhase,
      mutation.oldStatus === "IN_PROGRESS" ? "forge" : "pipeline_forced",
    ),
    forced_by_pipeline: mutation.previousPhase !== "forge",
    commit_hash: resolveModuleCommit(status),
    delivery_lint_required: !status?.validation?.delivery_lint_passed,
    pre_check_required: !status?.validation?.pre_check_passed,
    reason: selectTruthyValue(
      () => mutation.note,
      () => null,
    ),
  };
}
function testingData(status: any, mutation: any) {
  return {
    ...completionData(mutation),
    from_status: selectPresentValue(
      mutation.oldStatus,
      MODULE_READY_FOR_TESTING_STATUS,
    ),
    git_sync_completed: true,
    delivery_lint_passed: Boolean(status?.validation?.delivery_lint_passed),
    pre_check_passed: Boolean(status?.validation?.pre_check_passed),
    commit_hash: resolveModuleCommit(status),
  };
}
function failedData(status: any, mutation: any, phase: any) {
  const reason = selectPresentValue(
    status?.completion_summary,
    mutation.completionSummary,
    mutation.note,
    status?.fail_summaries?.at?.(-1)?.summary,
  );
  return {
    ...completionData(mutation),
    phase: selectPresentValue(phase, "missing_phase"),
    failure_class: normalizeFailureClass(phase, reason),
    reason: selectPresentValue(reason, MODULE_ATTEMPT_FAILED_REASON),
    old_status: selectTruthyValue(
      () => mutation.oldStatus,
      () => null,
    ),
    summary: selectPresentValue(mutation.note, reason),
    dispatch_id: resolveStatusDispatchId(status),
    gateway_label: resolveStatusGatewayLabel(status),
    session_key: resolveStatusSessionKey(status),
    commit_hash: resolveModuleCommit(status),
    validator_name: null,
    suite_names: [],
  };
}
function passedData(status: any, mutation: any, phase: any) {
  return {
    ...completionData(mutation),
    phase: selectPresentValue(
      phase,
      mutation.previousPhase,
      MODULE_LIFECYCLE_PHASE_BUSTER,
    ),
    old_status: selectTruthyValue(
      () => mutation.oldStatus,
      () => null,
    ),
    duration_seconds: null,
    cost_estimate_usd: null,
    commit_hash: resolveModuleCommit(status),
    summary: selectPresentValue(
      status?.completion_summary,
      mutation.completionSummary,
      mutation.note,
    ),
  };
}
function blockedData(status: any, mutation: any, phase: any) {
  return {
    ...completionData(mutation),
    blocked_phase: selectPresentValue(status?.blockedPhase, phase),
    reason: selectPresentValue(
      status?.blockedReason,
      mutation.blockedReason,
      mutation.note,
      MODULE_BLOCKED_REASON,
    ),
    old_status: selectTruthyValue(
      () => mutation.oldStatus,
      () => null,
    ),
    blocked_fail_count: selectDefinedValue(
      () => status?.blockedFailCount,
      () => null,
    ),
    dispatch_id: resolveStatusDispatchId(status),
    gateway_label: resolveStatusGatewayLabel(status),
    session_key: resolveStatusSessionKey(status),
  };
}
function buildModuleLifecycleData(
  config: any,
  dir: any,
  status: any,
  mutation: any = {},
) {
  const moduleConfig = resolveModuleConfig(
    getActiveProgress(config),
    status?.module_id,
    dir,
  );
  mutation.dir = dir;
  const phase = modulePhase(status, mutation),
    attempt = resolveModuleAttempt(status, mutation);
  const builders: Record<string, () => any> = {
    "module_attempt.started": () =>
      startedData(moduleConfig, status, mutation, attempt),
    "module_attempt.ready_for_testing": () => readyData(status, mutation),
    "module_attempt.testing_started": () => testingData(status, mutation),
    "module_attempt.failed": () => failedData(status, mutation, phase),
    "module_attempt.passed": () => passedData(status, mutation, phase),
    "module_attempt.blocked": () => blockedData(status, mutation, phase),
  };
  const build = builders[mutation.eventType];
  if (!build)
    throw new Error(
      `Unsupported module lifecycle event type: ${mutation.eventType}`,
    );
  return build();
}

export function appendModuleLifecycleEvent(
  config: any,
  dir: any,
  status: any,
  mutation: any = {},
) {
  if (!mutation?.eventType) return null;
  const currentModuleState = selectTruthyValue(
    () =>
      loadLifecycleReadModels(config)?.modules?.[
        selectTruthyValue(
          () => status?.module_id,
          () => dir,
        )
      ],
    () => null,
  );
  const refs = buildModuleAttemptRefs(
    config,
    status,
    dir,
    mutation,
    currentModuleState,
  );
  const data = buildModuleLifecycleData(config, dir, status, mutation);
  return appendLifecycleEvent(config, {
    type: mutation.eventType,
    refs,
    data,
    occurredAt: eventOccurredAt(mutation.now),
  });
}
