import { selectDefinedValue } from "../../optional-absence.ts";
import {
  anyTrue,
  deriveApprovalResolutionFromSignal,
  ensureGateReadModel,
  firstAttempt,
  firstDefined,
  normalizeLifecycleTerminalStatus,
  objectRecord,
  selectPresentValue,
} from "./projection-support.ts";

function defined(primary: any, secondary: any = null): any {
  return primary !== undefined && primary !== null ? primary : secondary;
}

function waitIdentity(event: any, current: any, waitRef: string) {
  const scope = event.refs?.gate_id
    ? "gate"
    : event.refs?.module_id
      ? "module"
      : "pipeline";
  return {
    wait_ref: waitRef,
    scope,
    run_id: selectPresentValue(event.refs?.run_id, current.run_id),
    gate_id: selectPresentValue(event.refs?.gate_id, current.gate_id),
    gate_type: selectPresentValue(event.refs?.gate_type, current.gate_type),
    gate_evaluation_ref: selectPresentValue(
      event.refs?.gate_evaluation_ref,
      current.gate_evaluation_ref,
    ),
    module_id: selectPresentValue(event.refs?.module_id, current.module_id),
    attempt: firstAttempt(event.refs?.attempt, current.attempt),
  };
}

function waitRequest(event: any, current: any) {
  return {
    wait_kind: selectPresentValue(event.data?.wait_kind, current.wait_kind),
    requested_at: selectPresentValue(
      event.data?.requested_at,
      current.requested_at,
      event.occurred_at,
    ),
    deadline: selectPresentValue(event.data?.deadline, current.deadline),
    timeout_minutes: defined(
      event.data?.timeout_minutes,
      current.timeout_minutes,
    ),
    timeout_policy: selectPresentValue(
      event.data?.timeout_policy,
      current.timeout_policy,
    ),
    gate_title: selectPresentValue(event.data?.gate_title, current.gate_title),
    request_message_ref: defined(
      event.data?.request_message_ref,
      current.request_message_ref,
    ),
    request_artifact_path: defined(
      event.data?.request_artifact_path,
      current.request_artifact_path,
    ),
  };
}

function waitResolution(event: any, current: any) {
  const closed = event.type === "wait.closed";
  return {
    state: closed ? "CLOSED" : "OPEN",
    opened_at: selectPresentValue(current.opened_at, event.occurred_at),
    closed_at: closed
      ? selectPresentValue(event.data?.closed_at, event.occurred_at)
      : defined(current.closed_at),
    close_reason: closed
      ? defined(event.data?.close_reason)
      : defined(current.close_reason),
    resolution_kind: closed
      ? defined(event.data?.resolution_kind)
      : defined(current.resolution_kind),
    decision_by: closed
      ? defined(event.data?.decision_by)
      : defined(current.decision_by),
    decision_via: closed
      ? defined(event.data?.decision_via)
      : defined(current.decision_via),
    resume_signal_ref: closed
      ? defined(event.data?.resume_signal_ref)
      : defined(current.resume_signal_ref),
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

function buildWaitEntry(event: any, current: any, waitRef: string) {
  return {
    ...current,
    ...waitIdentity(event, current, waitRef),
    ...waitRequest(event, current),
    ...waitResolution(event, current),
  };
}

function openGate(next: any, gate: any, event: any, waitRef: string): void {
  next.gates[gate.gate_id] = {
    ...gate,
    projection_source: "canonical-events",
    status: "PENDING_APPROVAL",
    wait_status: "OPEN",
    scheduler_consumed: false,
    wait_ref: waitRef,
    wait_kind: selectPresentValue(event.data?.wait_kind, gate.wait_kind),
    gate_title: selectPresentValue(event.data?.gate_title, gate.gate_title),
    requested_at: selectPresentValue(
      event.data?.requested_at,
      event.occurred_at,
    ),
    deadline: defined(event.data?.deadline),
    timeout_minutes: defined(event.data?.timeout_minutes),
    timeout_policy: event.data?.timeout_policy ?? null,
    request_message_ref: defined(event.data?.request_message_ref),
    request_artifact_path: defined(event.data?.request_artifact_path),
    resolved_at: null,
    decision_by: null,
    decision_via: null,
    continued: null,
    reason: null,
    close_reason: null,
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

function closeGate(
  next: any,
  gate: any,
  event: any,
  wait: any,
  waitRef: string,
): void {
  const derived = deriveApprovalResolutionFromSignal(
    gate.last_signal_kind,
    gate.continued,
  );
  next.gates[gate.gate_id] = {
    ...gate,
    projection_source: "canonical-events",
    status: normalizeLifecycleTerminalStatus(
      selectPresentValue(gate.status, derived.status, wait.resolution_kind),
    ),
    wait_status: "CLOSED",
    scheduler_consumed: anyTrue(
      gate.scheduler_consumed,
      derived.scheduler_consumed,
    ),
    wait_ref: waitRef,
    resolved_at: selectPresentValue(wait.closed_at, event.occurred_at),
    decision_by: selectPresentValue(wait.decision_by, gate.decision_by),
    decision_via: selectPresentValue(wait.decision_via, gate.decision_via),
    continued:
      wait.close_reason === "timed_out"
        ? firstDefined(gate.continued, derived.continued)
        : defined(gate.continued),
    reason: defined(gate.reason),
    close_reason: defined(wait.close_reason),
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

export function applyWaitEventToReadModels(next: any, event: any): void {
  const waitRef = event.refs?.wait_ref;
  if (!waitRef) return;
  const gate = ensureGateReadModel(next, event.refs);
  const current = selectDefinedValue(
    () => objectRecord(next.waits?.by_ref?.[waitRef]),
    () => ({}),
  );
  const wait = buildWaitEntry(event, current, waitRef);
  next.waits.by_ref[waitRef] = wait;
  if (!gate) return;
  if (event.type === "wait.opened") openGate(next, gate, event, waitRef);
  else closeGate(next, gate, event, wait, waitRef);
}
