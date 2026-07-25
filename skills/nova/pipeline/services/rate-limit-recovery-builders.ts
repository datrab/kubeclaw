import {
  STATUS,
  resolveRateLimitIdentity,
  statusRecord,
} from "./rate-limit-builder-primitives.ts";

function currentPhase(status: any, phase: any) {
  if (status?.current_phase != null) return status.current_phase;
  return status?.phase != null ? status.phase : (phase ?? null);
}

function moduleIdentityFields(status: any, moduleId: any) {
  if (status?.module_id != null) return { module_id: status.module_id };
  return moduleId != null ? { module_id: moduleId } : {};
}

function nullable(value: any) {
  return value ?? null;
}

function preferred(primary: any, fallback: any) {
  return primary != null ? primary : nullable(fallback);
}

function moduleStatusOptionals(resolvedPhase: any, agentType: any) {
  return {
    ...(resolvedPhase == null
      ? {}
      : { current_phase: resolvedPhase, phase: resolvedPhase }),
    ...(agentType == null ? {} : { agent_type: agentType }),
  };
}

export function buildModuleSessionRateLimitStatus(
  status: any = {},
  { moduleId = null, phase = null, identity = {} }: any = {},
) {
  const resolvedPhase = currentPhase(status, phase);
  const resolvedIdentity = resolveRateLimitIdentity(identity, { status });
  const agentType = nullable(status?.agent_type);
  const runId = preferred(status?.run_id, resolvedIdentity.run_id);
  const attempt = preferred(status?.attempt, resolvedIdentity.attempt);
  const model = preferred(status?.model, status?.active_agent?.model);
  return {
    ...statusRecord(status),
    status: STATUS.RATE_LIMITED,
    ...moduleIdentityFields(status, moduleId),
    ...moduleStatusOptionals(resolvedPhase, agentType),
    run_id: runId,
    attempt,
    dispatch_id: resolvedIdentity.dispatch_id,
    gateway_label: resolvedIdentity.gateway_label,
    session_key: resolvedIdentity.session_key,
    model,
  };
}

export * from "./rate-limit-summary-builders.ts";
export * from "./rate-limit-gate-recovery.ts";
