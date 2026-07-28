import {
  buildCooldownRefs,
  buildResumeSignalRefs,
  buildWaitRefs,
} from "./refs.ts";
import {
  selectDefinedValue,
  selectTruthyValue,
} from "../../optional-absence.ts";
import { firstDefinedValue as firstDefined } from "../../value-boundary.ts";
import {
  appendLifecycleEvent,
  selectPresentValue,
  eventOccurredAt,
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
