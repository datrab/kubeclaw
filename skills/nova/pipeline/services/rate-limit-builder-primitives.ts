import { selectDefinedValue } from "../optional-absence.ts";
import {
  nullableObjectRecord as objectRecord,
  selectPresent,
} from "../value-boundary.ts";

export const STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  READY_FOR_TESTING: "READY_FOR_TESTING",
  TESTING: "TESTING",
  PASS: "PASS",
  FAIL: "FAIL",
  BLOCKED: "BLOCKED",
  RATE_LIMITED: "RATE_LIMITED",
};

export function selectPresentValue(...values: any) {
  return selectPresent(...values);
}

export function resolveRateLimitOption(value: any, _ctx: any) {
  if (typeof value === "function") {
    throw new TypeError(
      "rate-limit options must be resolved typed values, not callbacks",
    );
  }
  return value;
}

export function statusRecord(value: any): any {
  return objectRecord(value) ?? {};
}

export function callRateLimitResolver(resolver: any, status: any): any {
  if (typeof resolver !== "function") return {};
  return objectRecord(resolver(status)) ?? {};
}

export function resolvedOptionRecord(value: any, ctx: any): any {
  return objectRecord(resolveRateLimitOption(value, ctx)) ?? {};
}

export function resolveRateLimitIdentity(identity: any = {}, ctx: any = {}) {
  const resolved = resolvedOptionRecord(identity, ctx);
  return {
    agent_type: resolveRateLimitOption(resolved.agent_type, ctx) ?? null,
    run_id: resolveRateLimitOption(resolved.run_id, ctx) ?? null,
    attempt: resolveRateLimitOption(resolved.attempt, ctx) ?? null,
    dispatch_id: resolveRateLimitOption(resolved.dispatch_id, ctx) ?? null,
    gateway_label: resolveRateLimitOption(resolved.gateway_label, ctx) ?? null,
    session_key: resolveRateLimitOption(resolved.session_key, ctx) ?? null,
  };
}

export function resolvedRateLimitStatusBase(
  status: any,
  resolvedIdentity: any,
) {
  const agentType = status?.agent_type ?? null;
  const runId =
    status?.run_id != null ? status.run_id : (resolvedIdentity.run_id ?? null);
  const attempt =
    status?.attempt != null
      ? status.attempt
      : (resolvedIdentity.attempt ?? null);
  return {
    ...statusRecord(status),
    status: STATUS.RATE_LIMITED,
    ...(agentType == null ? {} : { agent_type: agentType }),
    run_id: runId,
    attempt,
    dispatch_id: resolvedIdentity.dispatch_id,
    gateway_label: resolvedIdentity.gateway_label,
    session_key: resolvedIdentity.session_key,
  };
}
