import {
  appendWaitLifecycleEvent,
  buildResumeSignalRefs,
  cloneSerializable,
  deriveApprovalResolutionFromState,
  loadLifecycleReadModels,
} from "../status-store-lifecycle.ts";
import {
  approvalGateType,
  isoNow,
  normalizedUpperText,
  selectPresentValue,
} from "./gate-evidence-projection.ts";

const APPROVAL_GATE_TYPE = "approval";
const PENDING_APPROVAL_STATUS = "PENDING_APPROVAL";
function defined(primary: any, secondary: any = null): any {
  return primary !== undefined && primary !== null ? primary : secondary;
}

function projectionTiming(gate: any, wait: any) {
  return {
    requested_at: defined(gate.requested_at, wait?.requested_at),
    deadline: defined(gate.deadline, wait?.deadline),
    timeout_minutes: defined(gate.timeout_minutes),
    timeout_policy: defined(gate.timeout_policy, wait?.timeout_policy),
    resolved_at: defined(gate.resolved_at, wait?.closed_at),
  };
}

function projectionDecision(gate: any, wait: any) {
  return {
    decision_by: defined(gate.decision_by, wait?.decision_by),
    decision_via: defined(gate.decision_via, wait?.decision_via),
    continued: defined(gate.continued),
    reason: defined(gate.reason),
    request_message_ref: defined(gate.request_message_ref),
  };
}

export function projectApprovalGateReadModel(
  readModels: any,
  gateId: any,
  gate: any = null,
): any {
  const entry = readModels?.gates?.[gateId];
  if (!entry) return null;
  const wait = entry.wait_ref
    ? (readModels?.waits?.by_ref?.[entry.wait_ref] ?? null)
    : null;
  return {
    gate_id: gateId,
    gate_type: selectPresentValue(
      entry.gate_type,
      gate?.type,
      APPROVAL_GATE_TYPE,
    ),
    status: selectPresentValue(entry.status, PENDING_APPROVAL_STATUS),
    run_id: defined(entry.run_id, readModels?.run_id),
    project: defined(readModels?.project),
    ...projectionTiming(entry, wait),
    ...projectionDecision(entry, wait),
  };
}

function openedWaitOptions(
  gateId: any,
  gate: any,
  state: any,
  occurredAt: string,
) {
  return {
    gateId,
    gateType: approvalGateType(gate, state),
    attempt: 1,
    waitKind: "approval",
    occurredAt,
    data: {
      wait_kind: "approval",
      gate_title: selectPresentValue(gate?.title, state.gate_title, null),
      requested_at: defined(state.requested_at, occurredAt),
      deadline: defined(state.deadline),
      timeout_minutes: defined(state.timeout_minutes),
      timeout_policy: state.timeout_policy,
      request_message_ref: defined(state.request_message_ref),
      request_artifact_path: defined(state.request_artifact_path),
    },
  };
}

function signalOptions(
  gateId: any,
  gate: any,
  state: any,
  resolution: any,
  occurredAt: string,
) {
  return {
    gateId,
    gateType: approvalGateType(gate, state),
    attempt: 1,
    waitKind: "approval",
    signalKind: resolution.signalKind,
    occurredAt,
    data: {
      signal_kind: resolution.signalKind,
      received_via: defined(
        state.decision_via,
        resolution.closeReason === "timed_out" ? "timeout" : "openclaw",
      ),
      decision_by: defined(state.decision_by),
      reason: defined(state.reason),
      continued: defined(state.continued),
      source_message_ref: defined(state.request_message_ref),
    },
  };
}

function closeOptions(
  config: any,
  gateId: any,
  gate: any,
  state: any,
  resolution: any,
  occurredAt: string,
) {
  const gateType = approvalGateType(gate, state);
  const resume = buildResumeSignalRefs(config, {
    gateId,
    gateType,
    attempt: 1,
    waitKind: "approval",
    signalKind: resolution.signalKind,
  });
  return {
    gateId,
    gateType,
    attempt: 1,
    waitKind: "approval",
    occurredAt,
    data: {
      close_reason: resolution.closeReason,
      closed_at: occurredAt,
      resolution_kind: resolution.resolutionKind,
      decision_by: defined(state.decision_by),
      decision_via: defined(state.decision_via),
      resume_signal_ref: resume.resume_signal_ref,
    },
  };
}

function appendResolution(
  config: any,
  gateId: any,
  gate: any,
  state: any,
): void {
  const resolution = deriveApprovalResolutionFromState(state);
  if (!resolution.signalKind) return;
  const occurredAt = selectPresentValue(
    state.resolved_at,
    state.updated_at,
    isoNow(),
  );
  appendWaitLifecycleEvent(
    config,
    "resume_signal.received",
    signalOptions(gateId, gate, state, resolution, occurredAt),
  );
  appendWaitLifecycleEvent(
    config,
    "wait.closed",
    closeOptions(config, gateId, gate, state, resolution, occurredAt),
  );
}

export function syncApprovalWaitState(
  config: any,
  gateId: any,
  gate: any = null,
  state: any = null,
): any {
  const normalized =
    state && typeof state === "object" ? cloneSerializable(state) : null;
  const initial = loadLifecycleReadModels(config);
  const existing = (initial.gates ?? {})[gateId] ?? null;
  if (existing && existing.wait_status === "CLOSED" && existing.status)
    return projectApprovalGateReadModel(initial, gateId, gate);
  if (!normalized)
    return existing
      ? projectApprovalGateReadModel(initial, gateId, gate)
      : null;
  const openedAt = selectPresentValue(
    normalized.requested_at,
    normalized.updated_at,
    normalized.resolved_at,
    isoNow(),
  );
  const waitReferenceMissing = existing ? !existing.wait_ref : true;
  if (waitReferenceMissing)
    appendWaitLifecycleEvent(
      config,
      "wait.opened",
      openedWaitOptions(gateId, gate, normalized, openedAt),
    );
  if (normalizedUpperText(normalized.status) !== PENDING_APPROVAL_STATUS)
    appendResolution(config, gateId, gate, normalized);
  return projectApprovalGateReadModel(
    loadLifecycleReadModels(config),
    gateId,
    gate,
  );
}
