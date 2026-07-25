import { getTrackedAgent } from "../agents/lifecycle.ts";
import { getRunId } from "../core/runtime.ts";
import { transitionModuleStatus } from "../lifecycle-state.ts";
import {
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveStatusSessionKey,
} from "./correlation.ts";
import { buildModuleSessionRateLimitStatus } from "./rate-limit.ts";
import { resolveStatusPollIdentity } from "./polling-identity.ts";
import {
  objectRecord,
  pollRateLimitIdentity,
  requireTextValue,
  textValue,
} from "./polling-core.ts";

export function storedRateLimitResult(state: any, status: any) {
  const identity = resolveStatusPollIdentity(
    state.moduleDir,
    status,
    state.sessionLabel ? getTrackedAgent(state.sessionLabel) : null,
    state.sessionLabel,
  );
  const moduleId = requireTextValue(status.module_id, "status.module_id");
  const phase = requireTextValue(
    identity.agent_type ?? status.current_phase,
    "rate_limit.phase",
  );
  return {
    rate_limited: true,
    status: buildModuleSessionRateLimitStatus(status, {
      moduleId,
      phase,
      identity: {
        agent_type: phase,
        run_id: getRunId(state.config) ?? null,
        attempt: identity.attempt ?? null,
        dispatch_id: identity.dispatch_id ?? null,
        gateway_label: identity.gateway_label ?? null,
        session_key: identity.session_key ?? null,
      },
    }),
  };
}

function optionalIdentityFields(current: any, identity: any) {
  const result: any = {};
  if (identity.gate_id != null) {
    result.gate_id = identity.gate_id;
    result.gate_type = identity.gate_type ?? null;
  }
  if (current.attempt == null && identity.attempt != null)
    result.attempt = identity.attempt;
  if (resolveStatusDispatchId(current) == null && identity.dispatch_id != null)
    result.dispatch_id = identity.dispatch_id;
  if (
    resolveStatusGatewayLabel(current) == null &&
    identity.gateway_label != null
  )
    result.gateway_label = identity.gateway_label;
  if (resolveStatusSessionKey(current) == null && identity.session_key != null)
    result.session_key = identity.session_key;
  return result;
}

function mergedRateLimitStatus(
  state: any,
  status: any,
  identity: any,
  agentType: any,
) {
  const current = objectRecord(status);
  const moduleId = requireTextValue(
    identity.module_id,
    "poll_identity.module_id",
  );
  const runIdentity =
    current.run_id == null && getRunId(state.config) != null
      ? { run_id: getRunId(state.config) }
      : {};
  const merged = {
    ...current,
    ...runIdentity,
    ...optionalIdentityFields(current, identity),
    module_id: textValue(current.module_id) ?? moduleId,
    current_phase: textValue(current.current_phase) ?? agentType,
    agent_type: textValue(current.agent_type) ?? agentType,
    rate_limit_reason: state.acpState.detail,
    detail: textValue(current.detail) ?? state.acpState.detail,
  };
  return buildModuleSessionRateLimitStatus(merged, {
    moduleId,
    phase: agentType,
    identity: pollRateLimitIdentity(state.config, identity, agentType),
  });
}

export function acpRateLimitResult(
  state: any,
  status: any,
  identity: any,
  agentType: any,
) {
  const normalized = mergedRateLimitStatus(state, status, identity, agentType);
  const transition = transitionModuleStatus(normalized, "RATE_LIMITED", {
    note: "ACP session rate limited",
    phase: normalized.current_phase,
  });
  return {
    rate_limited: true,
    status: normalized,
    lifecycleMutation: transition.lifecycleMutation,
  };
}
