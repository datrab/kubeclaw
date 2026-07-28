import { assertCompletion } from "../../completion.ts";
import { buildGateEvaluationRefs } from "./refs.ts";
import {
  createDefaultLifecycleReadModels,
  saveLifecycleReadModels,
} from "./read-models.ts";
import { cloneSerializable } from "../serialization.ts";
import {
  selectDefinedValue,
  selectTruthyValue,
} from "../../optional-absence.ts";
import {
  appendLifecycleEvent,
  selectPresentValue,
  GATE_COMPLETION_PASS_STATUS,
  GATE_COMPLETION_BLOCKED_STATUS,
  GATE_COMPLETION_FAIL_STATUS,
  GATE_COMPLETION_ERROR_STATUS,
} from "./appenders-base.ts";
function gateStatusForCompletion(completion: any) {
  if (completion.status === GATE_COMPLETION_PASS_STATUS) return "PASS";
  if (completion.status === GATE_COMPLETION_BLOCKED_STATUS) return "BLOCKED";
  if (completion.status === GATE_COMPLETION_FAIL_STATUS) return "FAIL";
  if (completion.status === GATE_COMPLETION_ERROR_STATUS) return "FAIL";
  throw new Error(`Unsupported gate completion status: ${completion.status}`);
}

function gateCompletionEventType(gateStatus: any) {
  switch (gateStatus) {
    case "PASS":
      return "gate_evaluation.passed";
    case "FAIL":
      return "gate_evaluation.failed";
    case "BLOCKED":
      return "gate_evaluation.blocked";
    default:
      throw new Error(
        `Unsupported gate completion lifecycle status: ${gateStatus}`,
      );
  }
}

function validateGateCompletion(gateId: any, completionInput: any) {
  const completion = assertCompletion({
    ...completionInput,
    target_kind: selectPresentValue(completionInput.target_kind, "gate"),
    target_id: selectPresentValue(completionInput.target_id, gateId),
  });
  if (completion.target_kind !== "gate")
    throw new Error("applyGateCompletion requires gate completion");
  if (gateId && gateId !== completion.target_id) {
    throw new Error(
      `applyGateCompletion gate mismatch: ${completion.target_id} != ${gateId}`,
    );
  }
  return completion;
}

function gateCompletionRefs(config: any, gate: any, completion: any) {
  const refs: any = buildGateEvaluationRefs(config, {
    gateId: completion.target_id,
    gateType: selectTruthyValue(
      () => gate?.type,
      () => completion.metadata?.gate_type,
    ),
    attempt: completion.attempt,
  });
  refs.dispatch_id = selectDefinedValue(
    () => completion.observed?.dispatch_id,
    () => completion.metadata?.dispatch_id,
  );
  refs.gateway_label = selectDefinedValue(
    () => completion.observed?.gateway_label,
    () => completion.metadata?.gateway_label,
  );
  refs.session_key = selectDefinedValue(
    () => completion.observed?.session_key,
    () => completion.metadata?.session_key,
  );
  return refs;
}

function gateCompletionData(
  gate: any,
  completion: any,
  gateStatus: string,
  refs: any,
) {
  return {
    completion: cloneSerializable(completion),
    status: gateStatus,
    summary: selectPresentValue(
      completion.summary,
      completion.reason_code,
      `${completion.phase} ${completion.status}`,
    ),
    reason: selectPresentValue(
      completion.summary,
      completion.reason_code,
      null,
    ),
    gate_title: selectTruthyValue(
      () => gate?.title,
      () => null,
    ),
    gate_type: selectTruthyValue(
      () => gate?.type,
      () => completion.metadata?.gate_type,
    ),
    phase: completion.phase,
    issue_type: selectDefinedValue(
      () => completion.metadata?.issue_type,
      () => null,
    ),
    outcome_class: selectDefinedValue(
      () => completion.metadata?.outcome_class,
      () => null,
    ),
    findings: Array.isArray(completion.metadata?.findings)
      ? cloneSerializable(completion.metadata.findings)
      : [],
    dispatch_id: selectDefinedValue(
      () => refs.dispatch_id,
      () => null,
    ),
    gateway_label: selectDefinedValue(
      () => refs.gateway_label,
      () => null,
    ),
    session_key: selectDefinedValue(
      () => refs.session_key,
      () => null,
    ),
  };
}

export function applyGateCompletion(
  config: any,
  gateId: any,
  gate: any = {},
  completionInput: any = {},
) {
  const completion = validateGateCompletion(gateId, completionInput);
  const now = selectPresentValue(
    completion.occurred_at,
    new Date().toISOString(),
  );
  const gateStatus = gateStatusForCompletion(completion);
  const refs = gateCompletionRefs(config, gate, completion);
  return appendLifecycleEvent(config, {
    type: gateCompletionEventType(gateStatus),
    refs,
    data: gateCompletionData(gate, completion, gateStatus, refs),
    occurredAt: now,
  });
}

export function resetLifecycleStore(config: any) {
  return saveLifecycleReadModels(
    config,
    createDefaultLifecycleReadModels(config),
  );
}
