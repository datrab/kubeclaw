import { selectDefinedValue } from "../../optional-absence.ts";
import {
  objectRecord,
  selectPresentValue,
  ensureGateReadModel,
  normalizeLifecycleTerminalStatus,
} from "./projection-support.ts";
const STATUS_BY_EVENT: Record<string, string> = {
  "gate_evaluation.passed": "PASS",
  "gate_evaluation.failed": "FAIL",
  "gate_evaluation.blocked": "BLOCKED",
};
function defined(primary: any, secondary: any): any {
  return primary !== undefined && primary !== null ? primary : secondary;
}
function gateExecution(event: any, gate: any) {
  return {
    dispatch_id: defined(
      event.data?.dispatch_id,
      defined(event.refs?.dispatch_id, gate.dispatch_id),
    ),
    gateway_label: defined(
      event.data?.gateway_label,
      defined(event.refs?.gateway_label, gate.gateway_label),
    ),
    session_key: defined(
      event.data?.session_key,
      defined(event.refs?.session_key, gate.session_key),
    ),
  };
}
export function applyGateCompletionEventToReadModels(
  next: any,
  event: any,
): void {
  const gateEntry = ensureGateReadModel(next, event.refs);
  if (!gateEntry) return;
  const completed = [
    "gate_evaluation.passed",
    "gate_evaluation.failed",
    "gate_evaluation.blocked",
  ].includes(event.type);
  const status = selectPresentValue(
    event.data?.status,
    STATUS_BY_EVENT[event.type],
    gateEntry.status,
    "PENDING",
  );
  next.gates[gateEntry.gate_id] = {
    ...gateEntry,
    gate_type: selectPresentValue(
      event.data?.gate_type,
      event.refs?.gate_type,
      gateEntry.gate_type,
    ),
    gate_title: selectPresentValue(
      event.data?.gate_title,
      gateEntry.gate_title,
    ),
    title: selectPresentValue(event.data?.gate_title, gateEntry.title),
    status,
    completed,
    scheduler_consumed: completed,
    completed_at: completed ? event.occurred_at : null,
    reason: selectPresentValue(event.data?.reason, gateEntry.reason),
    completion_summary: selectPresentValue(
      event.data?.summary,
      event.data?.reason,
      gateEntry.completion_summary,
    ),
    completion: selectDefinedValue(
      () => event.data?.completion,
      () => gateEntry.completion,
    ),
    completion_source: "lifecycle_completion",
    projection_source: "canonical-events",
    ...gateExecution(event, gateEntry),
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}
