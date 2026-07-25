import { selectDefinedValue } from "../../optional-absence.ts";
import {
  objectRecord,
  selectPresentValue,
  anyTrue,
  deriveApprovalResolutionFromSignal,
  ensureGateReadModel,
} from "./projection-support.ts";
function defined(primary: any, secondary: any = null): any {
  return primary !== undefined && primary !== null ? primary : secondary;
}

function buildSignalEntry(currentSignal: any, event: any, signalRef: string) {
  return {
    ...currentSignal,
    resume_signal_ref: signalRef,
    wait_ref: selectPresentValue(event.refs?.wait_ref, currentSignal.wait_ref),
    gate_id: selectPresentValue(event.refs?.gate_id, currentSignal.gate_id),
    gate_type: selectPresentValue(
      event.refs?.gate_type,
      currentSignal.gate_type,
    ),
    gate_evaluation_ref: selectPresentValue(
      event.refs?.gate_evaluation_ref,
      currentSignal.gate_evaluation_ref,
    ),
    signal_kind: selectPresentValue(
      event.data?.signal_kind,
      event.refs?.signal_kind,
      currentSignal.signal_kind,
    ),
    received_via: selectPresentValue(
      event.data?.received_via,
      currentSignal.received_via,
    ),
    decision_by: selectPresentValue(
      event.data?.decision_by,
      currentSignal.decision_by,
    ),
    reason: selectPresentValue(event.data?.reason, currentSignal.reason),
    continued: defined(event.data?.continued, currentSignal.continued),
    source_message_ref: defined(
      event.data?.source_message_ref,
      currentSignal.source_message_ref,
    ),
    received_at: event.occurred_at,
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

function updateWaitSignal(
  next: any,
  signalEntry: any,
  signalRef: string,
  occurredAt: string,
): void {
  if (signalEntry.wait_ref && next.waits?.by_ref?.[signalEntry.wait_ref]) {
    next.waits.by_ref[signalEntry.wait_ref] = {
      ...next.waits.by_ref[signalEntry.wait_ref],
      latest_signal_ref: signalRef,
      latest_signal_kind: signalEntry.signal_kind,
      latest_signal_at: occurredAt,
    };
  }
}

function updateGateSignal(
  next: any,
  event: any,
  signalEntry: any,
  signalRef: string,
): void {
  const gateEntry = ensureGateReadModel(next, event.refs);
  if (!gateEntry) return;
  const derived = deriveApprovalResolutionFromSignal(
    signalEntry.signal_kind,
    signalEntry.continued,
  );
  next.gates[gateEntry.gate_id] = {
    ...gateEntry,
    projection_source: "canonical-events",
    wait_ref: selectPresentValue(event.refs?.wait_ref, gateEntry.wait_ref),
    status: selectPresentValue(derived.status, gateEntry.status),
    scheduler_consumed: anyTrue(
      gateEntry.scheduler_consumed,
      derived.scheduler_consumed,
    ),
    last_signal_kind: signalEntry.signal_kind,
    last_signal_ref: signalRef,
    last_signal_at: event.occurred_at,
    decision_by: selectPresentValue(
      signalEntry.decision_by,
      gateEntry.decision_by,
    ),
    decision_via: selectPresentValue(
      signalEntry.received_via,
      gateEntry.decision_via,
    ),
    continued: defined(
      signalEntry.continued,
      defined(derived.continued, gateEntry.continued),
    ),
    reason: selectPresentValue(signalEntry.reason, gateEntry.reason),
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

export function applyResumeSignalToReadModels(next: any, event: any): void {
  const signalRef = event.refs?.resume_signal_ref;
  if (!signalRef) return;
  const current = selectDefinedValue(
    () => objectRecord(next.signals?.by_ref?.[signalRef]),
    () => ({}),
  );
  const signal = buildSignalEntry(current, event, signalRef);
  next.signals.by_ref[signalRef] = signal;
  updateWaitSignal(next, signal, signalRef, event.occurred_at);
  updateGateSignal(next, event, signal, signalRef);
}
