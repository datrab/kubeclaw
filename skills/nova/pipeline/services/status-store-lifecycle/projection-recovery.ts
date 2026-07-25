import {
  ensureGateReadModel,
  firstDefined,
  objectRecord,
  recoveredActiveSession,
  selectPresentValue,
} from "./projection-support.ts";

function defined(primary: any, secondary: any = null): any {
  return primary !== undefined && primary !== null ? primary : secondary;
}

function resetModule(next: any, event: any): void {
  const moduleId = event.refs?.module_id;
  if (!moduleId) return;
  const existing = objectRecord(next.modules[moduleId]) ?? {
    module_id: moduleId,
  };
  next.modules[moduleId] = {
    ...existing,
    module_id: moduleId,
    module_attempt_ref: selectPresentValue(
      event.refs?.module_attempt_ref,
      existing.module_attempt_ref,
    ),
    current_attempt: defined(event.refs?.attempt, existing.current_attempt),
    status: selectPresentValue(
      event.data?.recovery_target_status,
      existing.status,
      "PENDING",
    ),
    current_phase: defined(event.data?.recovery_target_phase),
    dispatch_id: defined(event.refs?.dispatch_id, existing.dispatch_id),
    gateway_label: defined(event.refs?.gateway_label, existing.gateway_label),
    session_key: defined(event.refs?.session_key, existing.session_key),
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
    last_recovery_action: event.data?.recovery_action ?? null,
    last_recovery_reason: event.data?.reason ?? null,
    projection_source: "canonical-events",
  };
  delete next.active_sessions.modules[moduleId];
}

function resetGate(next: any, event: any): void {
  const gateId = event.refs?.gate_id;
  if (!gateId) return;
  const gate = firstDefined(ensureGateReadModel(next, event.refs), {
    gate_id: gateId,
  });
  next.gates[gateId] = {
    ...gate,
    status: selectPresentValue(
      event.data?.recovery_target_status,
      gate.status,
      "PENDING",
    ),
    scheduler_consumed: false,
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
    last_recovery_action: event.data?.recovery_action ?? null,
    last_recovery_reason: event.data?.reason ?? null,
    projection_source: "canonical-events",
  };
  delete next.active_sessions.gates[gateId];
}

function restoreBlockedSession(
  next: any,
  event: any,
  kind: "module" | "gate",
): void {
  const id = event.data?.[`${kind}_id`];
  if (!id) return;
  if (!event.data?.session_key) return;
  next.active_sessions[`${kind}s`][id] = recoveredActiveSession(
    event,
    kind,
    id,
  );
}

export function applyRecoveryEvent(next: any, event: any): void {
  if (event.type === "recovery.stale_reset") {
    resetModule(next, event);
    resetGate(next, event);
  } else if (event.type === "recovery.stale_blocked") {
    restoreBlockedSession(next, event, "module");
    restoreBlockedSession(next, event, "gate");
  }
}
