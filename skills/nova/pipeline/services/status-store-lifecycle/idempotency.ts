import { createHash } from "crypto";
import {
  selectDefinedValue,
  selectTruthyValue,
} from "../../optional-absence.ts";
const FULL_RUN_MODE = "full";
const BLOCKED_REASON = "blocked";
const CLOSED_REASON = "closed";
const ZERO_PAUSE_COUNT = 0;

function stableStringify(value: any): string {
  if (
    selectTruthyValue(
      () => value === null,
      () => value === undefined,
    )
  )
    return JSON.stringify(
      selectDefinedValue(
        () => value,
        () => null,
      ),
    );
  if (Array.isArray(value))
    return `[${value.map((entry: any) => stableStringify(entry)).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key: any) => `${JSON.stringify(key)}:${stableStringify(value[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value: any) {
  return createHash("sha256")
    .update(stringInput(value))
    .digest("hex")
    .slice(0, 12);
}

function slugify(value: any, fallback: any = null) {
  const normalized = stringInput(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalized) return normalized;
  if (fallback) return fallback;
  throw new Error(
    "lifecycle idempotency key requires a typed non-empty discriminator",
  );
}

function stringInput(value: any) {
  if (
    selectTruthyValue(
      () => value === undefined,
      () => value === null,
    )
  )
    return "";
  return String(value);
}

function arrayValue(value: any) {
  return Array.isArray(value) ? value : [];
}

function pauseCount(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : ZERO_PAUSE_COUNT;
}

function requireRef(value: any, label: any) {
  if (
    selectTruthyValue(
      () => typeof value !== "string",
      () => !value.trim(),
    )
  ) {
    throw new Error(`lifecycle idempotency key requires ${label}`);
  }
  return value.trim();
}

function phaseIdentitySuffix(refs: any): string {
  const dispatchId =
    typeof refs?.dispatch_id === "string" ? refs.dispatch_id.trim() : "";
  const sessionKey =
    typeof refs?.session_key === "string" ? refs.session_key.trim() : "";
  if (dispatchId || sessionKey) {
    return `|identity:${hashValue(stableStringify({ dispatch_id: dispatchId || null, session_key: sessionKey || null }))}`;
  }
  return "";
}

type KeyBuilder = (refs: any, data: any, type: string) => string;
function defined(primary: any, secondary: any = null): any {
  return primary !== undefined && primary !== null ? primary : secondary;
}
const runRef = (refs: any) => requireRef(refs?.run_ref, "run_ref");
const moduleRef = (refs: any) =>
  requireRef(refs?.module_attempt_ref, "module_attempt_ref");
const gateRef = (refs: any) =>
  requireRef(refs?.gate_evaluation_ref, "gate_evaluation_ref");

function failedModuleKey(refs: any, data: any, type: string): string {
  const fingerprint = hashValue(
    stableStringify({
      reason: data.reason ?? null,
      summary: data.summary ?? null,
      validator_name: data.validator_name ?? null,
      suite_names: arrayValue(data.suite_names),
    }),
  );
  return `${type}|${moduleRef(refs)}|failure:${slugify(data.failure_class)}:${fingerprint}`;
}

function recoveryFingerprint(data: any, refs: any): string {
  return hashValue(
    stableStringify({
      action: data.recovery_action ?? null,
      reason: data.reason ?? null,
      session_key: defined(data.session_key, defined(refs?.session_key)),
      dispatch_id: defined(data.dispatch_id, defined(refs?.dispatch_id)),
    }),
  );
}

function staleResetKey(refs: any, data: any, type: string): string {
  const recoveryRef = refs?.module_id
    ? `module:${requireRef(refs.module_id, "module_id")}`
    : `gate:${requireRef(refs?.gate_id, "gate_id")}`;
  return `${type}|${recoveryRef}|action:${slugify(data.recovery_action)}:${recoveryFingerprint(data, refs)}`;
}

function staleBlockedKey(refs: any, data: any, type: string): string {
  const recoveryRef = data.module_id
    ? `module:${requireRef(data.module_id, "module_id")}`
    : data.gate_id
      ? `gate:${requireRef(data.gate_id, "gate_id")}`
      : `scope:${slugify(data.scope, "missing_scope")}`;
  return `${type}|${runRef(refs)}|${recoveryRef}|action:${slugify(data.recovery_action, BLOCKED_REASON)}:${recoveryFingerprint(data, {})}`;
}

function primaryRef(refs: any): string {
  return requireRef(
    defined(
      refs?.primary_ref?.id,
      defined(refs?.module_attempt_ref, refs?.run_ref),
    ),
    "primary_ref",
  );
}

const KEY_BUILDERS: Record<string, KeyBuilder> = {
  "pipeline_run.started": (refs, data, type) =>
    `${type}|${runRef(refs)}|mode:${slugify(data.run_mode, FULL_RUN_MODE)}`,
  "pipeline_run.completed": (refs, _data, type) =>
    `${type}|${runRef(refs)}|final:completed`,
  "pipeline_run.halted": (refs, data, type) =>
    `${type}|${runRef(refs)}|reason:${slugify(data.halt_reason)}`,
  "pipeline.checkpoint": (refs, data, type) =>
    `${type}|${runRef(refs)}|point:${slugify(data.point)}`,
  "module_attempt.started": (refs, _data, type) =>
    `${type}|${moduleRef(refs)}|phase:start${phaseIdentitySuffix(refs)}`,
  "module_attempt.ready_for_testing": (refs, _data, type) =>
    `${type}|${moduleRef(refs)}|phase:ready_for_testing`,
  "module_attempt.testing_started": (refs, _data, type) =>
    `${type}|${moduleRef(refs)}|phase:testing_started${phaseIdentitySuffix(refs)}`,
  "module_attempt.failed": failedModuleKey,
  "module_attempt.passed": (refs, _data, type) =>
    `${type}|${moduleRef(refs)}|final:passed`,
  "module_attempt.blocked": (refs, data, type) =>
    `${type}|${moduleRef(refs)}|reason:${slugify(data.reason, BLOCKED_REASON)}`,
  "gate_evaluation.passed": (refs, _data, type) =>
    `${type}|${gateRef(refs)}|final:passed`,
  "gate_evaluation.failed": (refs, data, type) =>
    `${type}|${gateRef(refs)}|reason:${slugify(data.reason, BLOCKED_REASON)}`,
  "gate_evaluation.blocked": (refs, data, type) =>
    `${type}|${gateRef(refs)}|reason:${slugify(data.reason, BLOCKED_REASON)}`,
  "wait.opened": (refs, _data, type) =>
    `${type}|${requireRef(refs?.wait_ref, "wait_ref")}|state:open`,
  "wait.closed": (refs, data, type) =>
    `${type}|${requireRef(refs?.wait_ref, "wait_ref")}|reason:${slugify(data.close_reason, CLOSED_REASON)}`,
  "resume_signal.received": (refs, data, type) =>
    `${type}|${requireRef(refs?.resume_signal_ref, "resume_signal_ref")}|signal:${slugify(signalKindAuthority(data, refs))}`,
  "rate_limit.cooldown_started": (refs, data, type) =>
    `${type}|${primaryRef(refs)}|cooldown:${pauseCount(data.pause_count)}`,
  "rate_limit.cooldown_completed": (refs, data, type) =>
    `${type}|${primaryRef(refs)}|cooldown:${pauseCount(data.pause_count)}:completed`,
  "recovery.stale_reset": staleResetKey,
  "recovery.stale_blocked": staleBlockedKey,
};

export function buildLifecycleIdempotencyKey(
  type: string,
  refs: any,
  data: any = {},
): string {
  const builder = KEY_BUILDERS[type];
  if (!builder)
    throw new Error(
      `unsupported lifecycle event type for idempotency: ${type}`,
    );
  return builder(refs, data, type);
}

function signalKindAuthority(data: any, refs: any) {
  if (data.signal_kind) return data.signal_kind;
  return refs?.signal_kind;
}
