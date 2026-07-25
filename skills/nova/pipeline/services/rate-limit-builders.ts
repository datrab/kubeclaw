import { selectDefinedValue, selectTruthyValue } from "../optional-absence.ts";
// services/rate-limit-builders.js — Rate-limit status builders, notifier factories, and exhaustion option scaffolding

import { log } from "../core/logger.ts";
import { getRunId } from "../core/runtime.ts";
import {
  loadStatus,
  saveStatus,
  appendCooldownLifecycleEvent,
  getLifecycleCooldown,
} from "./status-store.ts";
import { discord } from "../integrations/discord.ts";
import { formatRateLimitEmbed } from "./failures/presentation.ts";
import {
  emitRateLimitDetected,
  onGateFail,
  onModuleStatusChanged,
  onRetryExhausted,
  onSummaryCompleted,
} from "./telemetry.ts";
import { transitionModuleStatus } from "../lifecycle-state.ts";
import { buildSessionRateLimitDiscordFields as buildSharedSessionRateLimitDiscordFields } from "./discord-fields.ts";
import { buildRateLimitDetectedPayload } from "./rate-limit-contract.ts";
import {
  resolveResultAttempt,
  resolveResultDispatchId,
  resolveResultSessionKey,
  resolveResultGatewayLabel,
  resolveStatusDispatchId,
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
} from "./correlation.ts";

import { sleep } from "../timing.ts";
import { createSessionRateLimitDiscordNotifier } from "./rate-limit-discord-notifier.ts";
import {
  arrayValue,
  nullableObjectRecord as objectRecord,
  selectPresent,
} from "../value-boundary.ts";
import { selectPresentValue } from "./rate-limit-builder-primitives.ts";
export * from "./rate-limit-builder-primitives.ts";
export * from "./rate-limit-gate-builders.ts";
export { createSessionRateLimitDiscordNotifier } from "./rate-limit-discord-notifier.ts";

const SESSION_RATE_LIMIT_DETAIL = "rate limit detected";

export function currentAttemptNumber(status: any) {
  return selectDefinedValue(
    () => status?.attempt,
    () => null,
  );
}

export function resolveCommitHash(status: any) {
  return selectDefinedValue(
    () => status?.commit_hash,
    () => null,
  );
}

export function moduleIdentityFields(status: any, moduleId: any) {
  if (status?.module_id != null) return { module_id: status.module_id };
  if (moduleId != null) return { module_id: moduleId };
  return {};
}

function overrideValue(overrides: any, key: string, fallback: any) {
  return overrides[key] !== undefined ? overrides[key] : fallback;
}

function telemetryModel(status: any, overrides: any) {
  if (overrides.model != null) return overrides.model;
  return status?.active_agent?.model != null
    ? status.active_agent.model
    : (status?.model ?? null);
}

export function buildModuleStatusTelemetry(status: any, overrides: any = {}) {
  return {
    title: status?.title || null,
    old_status: overrideValue(overrides, "old_status", status?.status ?? null),
    new_status: overrides.new_status ?? null,
    attempt: overrideValue(overrides, "attempt", currentAttemptNumber(status)),
    dispatch_id: overrideValue(
      overrides,
      "dispatch_id",
      resolveStatusDispatchId(status),
    ),
    gateway_label: overrideValue(
      overrides,
      "gateway_label",
      resolveStatusGatewayLabel(status),
    ),
    session_key: overrideValue(
      overrides,
      "session_key",
      resolveStatusSessionKey(status),
    ),
    phase: overrideValue(overrides, "phase", status?.current_phase ?? null),
    model: telemetryModel(status, overrides),
    duration_seconds: overrides.duration_seconds ?? null,
    cost_estimate_usd: overrides.cost_estimate_usd ?? null,
    commit_hash: overrideValue(
      overrides,
      "commit_hash",
      resolveCommitHash(status),
    ),
    reason: overrides.reason ?? null,
  };
}

export function buildSessionRateLimitDiscordFields(
  identity: any = {},
  extra: any = [],
) {
  return buildSharedSessionRateLimitDiscordFields(identity, extra);
}

export function emitGateRetryExhausted(
  telemetryCtx: any,
  gateId: any,
  {
    gateType = null,
    phase = null,
    attempt = null,
    maxAttempts = null,
    reason = null,
    sessionKey = null,
    dispatchId = null,
    gatewayLabel = null,
  }: any = {},
) {
  return onRetryExhausted(telemetryCtx, gateId, {
    gate_id: gateId,
    gate_type: selectTruthyValue(
      () => gateType,
      () => null,
    ),
    attempt: selectDefinedValue(
      () => attempt,
      () => null,
    ),
    phase,
    dispatch_id: selectTruthyValue(
      () => dispatchId,
      () => null,
    ),
    gateway_label: selectTruthyValue(
      () => gatewayLabel,
      () => null,
    ),
    session_key: selectTruthyValue(
      () => sessionKey,
      () => null,
    ),
    reason: selectTruthyValue(
      () => reason,
      () => null,
    ),
    max_attempts: selectDefinedValue(
      () => maxAttempts,
      () => null,
    ),
    max_fails: selectDefinedValue(
      () => maxAttempts,
      () => null,
    ),
  });
}

export function defaultSessionRateLimitDetail(status: any = {}) {
  return selectPresentValue(
    status?.detail,
    status?.reason,
    status?.summary,
    SESSION_RATE_LIMIT_DETAIL,
  );
}

export function buildSessionRateLimitExhaustedResult(
  status: any = {},
  pauseCount: any = 0,
  maxPauses: any = 0,
  extras: any = {},
) {
  return {
    ok: false,
    reason: "rate_limit_exhausted",
    status,
    rate_limit_exhausted: true,
    rate_limit_status: status,
    rate_limit_pauses: pauseCount,
    max_rate_limit_pauses: maxPauses,
    ...extras,
  };
}

export function resolveSessionRateLimitExhaustedStatus(result: any = {}) {
  return selectTruthyValue(
    () => result?.rate_limit_status,
    () => null,
  );
}

export function resolveSessionRateLimitMaxPauses(
  result: any = {},
  maxPauses: any = null,
) {
  if (result?.max_rate_limit_pauses !== undefined)
    return result.max_rate_limit_pauses;
  if (result?.rate_limit_status?.max_rate_limit_pauses !== undefined)
    return result.rate_limit_status.max_rate_limit_pauses;
  return selectDefinedValue(
    () => maxPauses,
    () => null,
  );
}

export function resolveSessionRateLimitRunId(
  result: any = {},
  runId: any = null,
) {
  if (result?.run_id !== undefined) return result.run_id;
  if (result?.rate_limit_status?.run_id !== undefined)
    return result.rate_limit_status.run_id;
  return selectDefinedValue(
    () => runId,
    () => null,
  );
}

export * from "./rate-limit-recovery-builders.ts";
