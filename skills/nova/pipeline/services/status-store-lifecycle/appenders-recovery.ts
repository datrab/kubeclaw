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
export function getLifecycleGateState(config: any, gateId: any) {
  if (!gateId) return null;
  return cloneSerializable(
    selectTruthyValue(
      () => loadLifecycleReadModels(config)?.gates?.[gateId],
      () => null,
    ),
  );
}

export function getLifecycleModuleState(config: any, moduleId: any) {
  if (!moduleId) return null;
  return cloneSerializable(
    selectTruthyValue(
      () => loadLifecycleReadModels(config)?.modules?.[moduleId],
      () => null,
    ),
  );
}

function moduleRecoveryRefs(config: any, options: any) {
  const activeAgent = selectDefinedValue(
    () => options.status?.active_agent,
    () => ({
      session_key: selectPresentValue(options.sessionKey),
      dispatch_id: selectPresentValue(options.dispatchId),
      gateway_label: selectPresentValue(options.gatewayLabel),
      attempt: selectDefinedValue(
        () => options.attempt,
        () => null,
      ),
    }),
  );
  return buildModuleAttemptRefs(
    config,
    {
      ...objectRecord(options.status),
      module_id: options.moduleId,
      active_agent: activeAgent,
    },
    requiredText(options.dir, "module stale recovery dir"),
    {
      attempt: selectDefinedValue(
        () => options.attempt,
        () => null,
      ),
    },
    getLifecycleModuleState(config, options.moduleId),
  );
}

function gateRecoveryRefs(config: any, options: any) {
  const refs: any = buildGateEvaluationRefs(config, {
    gateId: options.gateId,
    gateType: selectTruthyValue(
      () => options.gateType,
      () => null,
    ),
    attempt: Number(
      selectDefinedValue(
        () => options.attempt,
        () => STALE_RECOVERY_ATTEMPT,
      ),
    ),
  });
  refs.dispatch_id = selectDefinedValue(
    () => options.dispatchId,
    () => null,
  );
  refs.gateway_label = selectDefinedValue(
    () => options.gatewayLabel,
    () => null,
  );
  refs.session_key = selectDefinedValue(
    () => options.sessionKey,
    () => null,
  );
  return refs;
}

function staleRecoveryData(options: any) {
  return {
    recovery_target_status: selectPresentValue(
      options.recoveryTargetStatus,
      STALE_RECOVERY_TARGET_STATUS,
    ),
    recovery_target_phase: selectDefinedValue(
      () => options.recoveryTargetPhase,
      () => null,
    ),
    recovery_action: selectTruthyValue(
      () => options.recoveryAction,
      () => null,
    ),
    reason: selectPresentValue(options.reason, STALE_RECOVERY_REASON),
    session_key: selectDefinedValue(
      () => options.sessionKey,
      () => null,
    ),
    dispatch_id: selectDefinedValue(
      () => options.dispatchId,
      () => null,
    ),
    gateway_label: selectDefinedValue(
      () => options.gatewayLabel,
      () => null,
    ),
    stale_evidence: options.staleEvidence
      ? cloneSerializable(options.staleEvidence)
      : null,
  };
}

export function appendStaleRecoveryLifecycleEvent(
  config: any,
  options: any = {},
) {
  const refs = options.moduleId
    ? moduleRecoveryRefs(config, options)
    : gateRecoveryRefs(config, options);

  return appendLifecycleEvent(config, {
    type: "recovery.stale_reset",
    refs,
    data: staleRecoveryData(options),
    ...(options.occurredAt ? { occurredAt: options.occurredAt } : {}),
  });
}

export function getLifecycleCooldown(
  config: any,
  { stepType = null, stepId = null }: any = {},
) {
  const readModels = loadLifecycleReadModels(config);
  if (stepType === "module")
    return cloneSerializable(
      selectTruthyValue(
        () => readModels?.cooldowns?.modules?.[stepId],
        () => null,
      ),
    );
  if (stepType === "gate")
    return cloneSerializable(
      selectTruthyValue(
        () => readModels?.cooldowns?.gates?.[stepId],
        () => null,
      ),
    );
  return null;
}
