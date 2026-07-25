import {
  selectDefinedValue,
  selectTruthyValue,
} from "../../optional-absence.ts";
export function objectRecord(value: any) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

export function selectPresentValue(...values: any) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

export function firstDefined(...values: any) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

export function anyTrue(...values: any) {
  return values.some((value: any) => value === true);
}

export function arrayValue(value: any) {
  return Array.isArray(value) ? value : [];
}

export function numberValue(value: any, fallback: any = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function firstAttempt(...values: any) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return 1;
}

export function attemptWorkIdentity(event: any) {
  const refs = event.refs ?? {};
  const candidates = [
    { workId: refs.module_id, workType: "module" },
    { workId: refs.gate_id, workType: "gate" },
    { workId: refs.generator_id, workType: "generator" },
    { workId: refs.validator_id, workType: "validator" },
    { workId: refs.step_id, workType: "pipeline_step" },
  ].filter(
    (candidate: any) =>
      candidate.workId !== undefined &&
      candidate.workId !== null &&
      candidate.workId !== "",
  );
  if (candidates.length > 1)
    throw new Error(
      `lifecycle event ${event.event_id} has conflicting work identities`,
    );
  return candidates[0] ?? null;
}

export function attemptStatus(event: any) {
  const status = event.data?.status;
  const terminalStatus = event.data?.terminal_status;
  if (status != null && terminalStatus != null && status !== terminalStatus) {
    throw new Error(
      `lifecycle event ${event.event_id} has conflicting attempt status`,
    );
  }
  if (status != null) return status;
  if (terminalStatus != null) return terminalStatus;
  return event.type;
}

export function attemptSessionId(event: any) {
  const sessionId = event.refs?.session_id;
  const sessionKey = event.refs?.session_key;
  if (sessionId != null && sessionKey != null && sessionId !== sessionKey) {
    throw new Error(
      `lifecycle event ${event.event_id} has conflicting session identity`,
    );
  }
  return sessionId !== undefined && sessionId !== null
    ? sessionId
    : (sessionKey ?? null);
}

export function recoveredActiveSession(
  event: any,
  targetKind: any,
  targetId: any,
) {
  return {
    [`${targetKind}_id`]: targetId,
    ...(targetKind === "gate"
      ? {
          gate_type: selectDefinedValue(
            () => event.data?.gate_type,
            () => null,
          ),
        }
      : {}),
    run_id: selectDefinedValue(
      () => event.refs?.run_id,
      () => null,
    ),
    attempt: selectDefinedValue(
      () => event.data?.attempt,
      () => null,
    ),
    dispatch_id: selectTruthyValue(
      () => event.data?.dispatch_id,
      () => null,
    ),
    session_key: selectTruthyValue(
      () => event.data?.session_key,
      () => null,
    ),
    gateway_label: selectTruthyValue(
      () => event.data?.gateway_label,
      () => null,
    ),
    label: selectTruthyValue(
      () => event.data?.diagnostic_label,
      () => null,
    ),
    phase: selectTruthyValue(
      () => event.data?.previous_phase,
      () => null,
    ),
    projection_source: "canonical-events",
  };
}

export function normalizedUpperText(value: any) {
  if (
    selectTruthyValue(
      () => value === undefined,
      () => value === null,
    )
  )
    return "";
  return String(value).trim().toUpperCase();
}

export function normalizedSignalKind(value: any) {
  if (
    selectTruthyValue(
      () => value === undefined,
      () => value === null,
    )
  )
    return "";
  return String(value).trim().toLowerCase();
}

export function deriveApprovalResolutionFromSignal(
  signalKind: any,
  continued: any = null,
) {
  switch (normalizedSignalKind(signalKind)) {
    case "approve":
      return {
        status: "APPROVED",
        scheduler_consumed: true,
        close_reason: "signaled",
        continued: false,
      };
    case "reject":
      return {
        status: "REJECTED",
        scheduler_consumed: false,
        close_reason: "signaled",
        continued: false,
      };
    case "cancel":
      return {
        status: "CANCELLED",
        scheduler_consumed: false,
        close_reason: "cancelled",
        continued: false,
      };
    case "timeout_continue":
      return {
        status: "TIMED_OUT",
        scheduler_consumed: true,
        close_reason: "timed_out",
        continued: true,
      };
    case "timeout_block":
      return {
        status: "TIMED_OUT",
        scheduler_consumed: false,
        close_reason: "timed_out",
        continued: false,
      };
    default:
      if (signalKind != null && String(signalKind).trim()) {
        throw new Error(`unknown approval resume signal kind: ${signalKind}`);
      }
      return {
        status: null,
        scheduler_consumed: false,
        close_reason: null,
        continued: continued == null ? null : Boolean(continued),
      };
  }
}

export function deriveApprovalResolutionFromState(state: any = {}) {
  const status = normalizedUpperText(state?.status);
  switch (status) {
    case "APPROVED":
      return {
        signalKind: "approve",
        resolutionKind: "approved",
        closeReason: "signaled",
      };
    case "REJECTED":
      return {
        signalKind: "reject",
        resolutionKind: "rejected",
        closeReason: "signaled",
      };
    case "CANCELLED":
      return {
        signalKind: "cancel",
        resolutionKind: "cancelled",
        closeReason: "cancelled",
      };
    case "TIMED_OUT": {
      const timeoutSignal =
        state?.continued === true ? "timeout_continue" : "timeout_block";
      return {
        signalKind: timeoutSignal,
        resolutionKind: "timed_out",
        closeReason: "timed_out",
      };
    }
    default:
      return { signalKind: null, resolutionKind: null, closeReason: null };
  }
}

export function normalizeLifecycleTerminalStatus(value: any) {
  const text = normalizedUpperText(value);
  return selectTruthyValue(
    () => text,
    () => null,
  );
}

export function ensureGateReadModel(next: any, refs: any = {}) {
  const gateId = refs?.gate_id;
  if (!gateId) return null;
  const existing = selectDefinedValue(
    () => objectRecord(next.gates[gateId]),
    () => ({}),
  );
  const nextGate = {
    ...existing,
    gate_id: gateId,
    gate_type: selectDefinedValue(
      () => refs?.gate_type,
      () => null,
    ),
    gate_ref: selectDefinedValue(
      () => refs?.gate_ref,
      () => null,
    ),
    gate_evaluation_ref: selectDefinedValue(
      () => refs?.gate_evaluation_ref,
      () => null,
    ),
    attempt: firstAttempt(refs?.attempt, existing.attempt),
  };
  next.gates[gateId] = nextGate;
  return nextGate;
}
