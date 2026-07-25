import { cloneSerializable } from "../serialization.ts";
import { loadLifecycleReadModels } from "../status-store-lifecycle.ts";
import {
  getAuthoritativeModuleState,
  lifecycleProjectionSourceAuthority,
} from "./module-projection-authority.ts";

function defined(primary: any, secondary: any = null): any {
  return primary !== undefined && primary !== null ? primary : secondary;
}
function array(value: any): any[] {
  return Array.isArray(value) ? value : [];
}
function resolvedModuleId(authoritative: any, moduleId: any, config: any): any {
  return defined(authoritative.module_id, defined(moduleId, config?.dir));
}
function activeSession(config: any, id: any, authoritative: any): any {
  const stored =
    loadLifecycleReadModels(config)?.active_sessions?.modules?.[id];
  if (!stored) return null;
  return {
    ...stored,
    module_id: id,
    attempt: defined(stored.attempt),
    dispatch_id: defined(stored.dispatch_id),
    session_key: defined(stored.session_key),
    gateway_label: defined(stored.gateway_label),
    model: defined(stored.model, authoritative.model),
  };
}
function coreFields(authoritative: any, config: any, id: any) {
  return {
    module_id: id,
    title: defined(authoritative.title, config?.title),
    status: authoritative.status,
    current_phase: defined(authoritative.current_phase),
    fail_count: Number.isFinite(authoritative.fail_count)
      ? authoritative.fail_count
      : 0,
    fail_summaries: array(authoritative.fail_summaries),
    history: array(authoritative.history),
    validation: defined(authoritative.validation),
    cost: defined(authoritative.cost),
    commit_hash: defined(authoritative.commit_hash),
  };
}
function timeFields(authoritative: any) {
  return {
    started_at: defined(
      authoritative.started_at,
      authoritative.attempt_started_at,
    ),
    attempt_started_at: defined(authoritative.attempt_started_at),
    phase_started_at: defined(authoritative.phase_started_at),
    completed_at: defined(authoritative.completed_at),
    completion_summary: defined(authoritative.completion_summary),
    blockedAt: defined(authoritative.blocked_at),
    blockedReason: defined(authoritative.blocked_reason),
    blockedPhase: defined(authoritative.blocked_phase),
    blockedFailCount: defined(authoritative.blocked_fail_count),
  };
}
function executionFields(authoritative: any, active: any) {
  return {
    model: defined(authoritative.model, active?.model),
    active_agent: active,
    dispatch_id: defined(authoritative.dispatch_id, active?.dispatch_id),
    gateway_label: defined(authoritative.gateway_label, active?.gateway_label),
    session_key: defined(authoritative.session_key, active?.session_key),
    current_attempt: defined(authoritative.current_attempt, active?.attempt),
  };
}
function lifecycleFields(authoritative: any) {
  return {
    updated_at: defined(authoritative.latest_event_at),
    status_authority_source: "lifecycle_read_model",
    lifecycle_module_state_authority: true,
    lifecycle_projection_source:
      lifecycleProjectionSourceAuthority(authoritative),
    lifecycle_latest_event_type: defined(authoritative.latest_event_type),
    lifecycle_latest_event_at: defined(authoritative.latest_event_at),
  };
}
export function projectModuleRuntimeState(
  config: any,
  moduleId: any,
  moduleConfig: any = null,
): any {
  const authoritative = getAuthoritativeModuleState(config, moduleId, {
    dir: defined(moduleConfig?.dir, moduleId),
  });
  if (!authoritative) return null;
  const id = resolvedModuleId(authoritative, moduleId, moduleConfig);
  const active = activeSession(config, id, authoritative);
  return cloneSerializable({
    ...coreFields(authoritative, moduleConfig, id),
    ...timeFields(authoritative),
    ...executionFields(authoritative, active),
    ...lifecycleFields(authoritative),
  });
}
