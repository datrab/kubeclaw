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
export function appendWaitLifecycleEvent(
  config: any,
  type: any,
  {
    gateId,
    gateType = "approval",
    attempt = 1,
    waitKind = "approval",
    signalKind = null,
    data = {},
    occurredAt = null,
  }: any = {},
) {
  const refs =
    type === "resume_signal.received"
      ? buildResumeSignalRefs(config, {
          gateId,
          gateType,
          attempt,
          waitKind,
          signalKind: selectPresentValue(signalKind, data.signal_kind),
        })
      : buildWaitRefs(config, { gateId, gateType, attempt, waitKind });

  return appendLifecycleEvent(config, {
    type,
    refs,
    data,
    ...(occurredAt ? { occurredAt } : {}),
  });
}

function cooldownRefs(config: any, options: any) {
  const refs: any = buildCooldownRefs(config, options);
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

function cooldownStartedData(options: any) {
  return {
    ...cooldownStartedIdentity(options),
    pause_count: selectDefinedValue(
      () => options.pauseCount,
      () => null,
    ),
    max_pauses: selectDefinedValue(
      () => options.maxPauses,
      () => null,
    ),
    cooldown_hours: selectDefinedValue(
      () => options.cooldownHours,
      () => null,
    ),
    cooldown_ms: selectDefinedValue(
      () => options.cooldownMs,
      () => null,
    ),
    cooldown_source: selectTruthyValue(
      () => options.cooldownSource,
      () => null,
    ),
    cooldown_source_detail: selectTruthyValue(
      () => options.cooldownSourceDetail,
      () => null,
    ),
    cooldown_buffer_ms: selectDefinedValue(
      () => options.cooldownBufferMs,
      () => null,
    ),
    retry_after_seconds: selectDefinedValue(
      () => options.retryAfterSeconds,
      () => null,
    ),
    resume_at: selectTruthyValue(
      () => options.resumeAt,
      () => null,
    ),
    detail: selectTruthyValue(
      () => options.detail,
      () => null,
    ),
    agent_type: selectTruthyValue(
      () => options.agentType,
      () => null,
    ),
  };
}

function cooldownStartedIdentity(options: any) {
  return {
    dispatch_id: selectDefinedValue(
      () => options.dispatchId,
      () => null,
    ),
    gateway_label: selectDefinedValue(
      () => options.gatewayLabel,
      () => null,
    ),
    session_key: selectDefinedValue(
      () => options.sessionKey,
      () => null,
    ),
    commit_hash: selectDefinedValue(
      () => options.commitHash,
      () => null,
    ),
  };
}

function cooldownResumedData(options: any) {
  return {
    pause_count: selectDefinedValue(
      () => options.pauseCount,
      () => null,
    ),
    max_pauses: selectDefinedValue(
      () => options.maxPauses,
      () => null,
    ),
    resumed_at: eventOccurredAt(
      firstDefined(options.resumedAt, options.occurredAt),
    ),
    detail: selectTruthyValue(
      () => options.detail,
      () => null,
    ),
  };
}

export function appendCooldownLifecycleEvent(
  config: any,
  type: any,
  options: any = {},
) {
  const refs = cooldownRefs(config, options);
  const data =
    type === "rate_limit.cooldown_started"
      ? cooldownStartedData(options)
      : cooldownResumedData(options);

  return appendLifecycleEvent(config, {
    type,
    refs,
    data,
    ...(options.occurredAt ? { occurredAt: options.occurredAt } : {}),
  });
}
