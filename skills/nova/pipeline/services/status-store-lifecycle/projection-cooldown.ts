import {
  firstDefined,
  objectRecord,
  selectPresentValue,
} from "./projection-support.ts";

function defined(primary: any, secondary: any = null): any {
  return primary !== undefined && primary !== null ? primary : secondary;
}

function cooldownIdentity(
  event: any,
  existing: any,
  isModule: boolean,
  preferExisting = false,
) {
  const primary = preferExisting ? existing : event.refs;
  const secondary = preferExisting ? event.refs : existing;
  return {
    scope: selectPresentValue(
      primary.scope,
      secondary.scope,
      isModule ? "module" : "gate",
    ),
    target_ref: selectPresentValue(
      primary.target_ref,
      primary.primary_ref?.id,
      secondary.target_ref,
      secondary.primary_ref?.id,
    ),
    run_id: selectPresentValue(primary.run_id, secondary.run_id),
    module_id: selectPresentValue(primary.module_id, secondary.module_id),
    gate_id: selectPresentValue(primary.gate_id, secondary.gate_id),
    gate_type: selectPresentValue(primary.gate_type, secondary.gate_type),
    attempt: defined(primary.attempt, secondary.attempt),
  };
}

function cooldownPolicy(event: any, existing: any) {
  return {
    pause_count: defined(event.data?.pause_count, existing.pause_count),
    max_pauses: defined(event.data?.max_pauses, existing.max_pauses),
    cooldown_hours: defined(
      event.data?.cooldown_hours,
      existing.cooldown_hours,
    ),
    cooldown_ms: defined(event.data?.cooldown_ms, existing.cooldown_ms),
    cooldown_source: selectPresentValue(
      event.data?.cooldown_source,
      existing.cooldown_source,
    ),
    cooldown_source_detail: selectPresentValue(
      event.data?.cooldown_source_detail,
      existing.cooldown_source_detail,
    ),
    cooldown_buffer_ms: defined(
      event.data?.cooldown_buffer_ms,
      existing.cooldown_buffer_ms,
    ),
    retry_after_seconds: defined(
      event.data?.retry_after_seconds,
      existing.retry_after_seconds,
    ),
    resume_at: selectPresentValue(event.data?.resume_at, existing.resume_at),
    detail: selectPresentValue(event.data?.detail, existing.detail),
    agent_type: selectPresentValue(event.data?.agent_type, existing.agent_type),
  };
}

function cooldownExecution(event: any, existing: any, preferExisting = false) {
  const choose = (field: string) =>
    preferExisting
      ? defined(existing[field], event.refs?.[field])
      : defined(
          event.data?.[field],
          defined(event.refs?.[field], existing[field]),
        );
  return {
    dispatch_id: choose("dispatch_id"),
    gateway_label: choose("gateway_label"),
    session_key: choose("session_key"),
    commit_hash: preferExisting
      ? defined(existing.commit_hash)
      : defined(event.data?.commit_hash, existing.commit_hash),
  };
}

function startCooldown(event: any, existing: any, isModule: boolean) {
  return {
    ...existing,
    ...cooldownIdentity(event, existing, isModule),
    ...cooldownPolicy(event, existing),
    ...cooldownExecution(event, existing),
    projection_source: "canonical-events",
    open: true,
    opened_at: event.occurred_at,
    completed_at: null,
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

function completeCooldown(event: any, existing: any, isModule: boolean) {
  return {
    ...existing,
    ...cooldownIdentity(event, existing, isModule, true),
    pause_count: defined(event.data?.pause_count, existing.pause_count),
    max_pauses: defined(event.data?.max_pauses, existing.max_pauses),
    cooldown_hours: defined(existing.cooldown_hours),
    cooldown_ms: defined(existing.cooldown_ms),
    cooldown_source: defined(existing.cooldown_source),
    cooldown_source_detail: defined(existing.cooldown_source_detail),
    cooldown_buffer_ms: defined(existing.cooldown_buffer_ms),
    retry_after_seconds: defined(existing.retry_after_seconds),
    resume_at: defined(existing.resume_at),
    detail: selectPresentValue(event.data?.detail, existing.detail),
    agent_type: defined(existing.agent_type),
    ...cooldownExecution(event, existing, true),
    projection_source: "canonical-events",
    open: false,
    completed_at: firstDefined(event.data?.resumed_at, event.occurred_at),
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

export function applyCooldownEventToReadModels(next: any, event: any): void {
  const isModule = Boolean(event.refs?.module_id);
  const collection = isModule ? next.cooldowns.modules : next.cooldowns.gates;
  const key = isModule ? event.refs.module_id : event.refs.gate_id;
  if (!key) return;
  const existing = objectRecord(collection[key]) ?? {};
  collection[key] =
    event.type === "rate_limit.cooldown_started"
      ? startCooldown(event, existing, isModule)
      : completeCooldown(event, existing, isModule);
}
