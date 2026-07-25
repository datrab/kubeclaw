import { assertCompletion } from "../../completion.ts";
import {
  selectDefinedValue,
  selectTruthyValue,
} from "../../optional-absence.ts";
import {
  selectPresentValue,
  MODULE_BLOCKED_REASON,
  MODULE_COMPLETION_PASS_STATUS,
  MODULE_COMPLETION_FAIL_STATUS,
  MODULE_COMPLETION_BLOCKED_STATUS,
  MODULE_COMPLETION_ERROR_STATUS,
} from "./appenders-base.ts";
import { appendModuleLifecycleEvent } from "./appenders-modules.ts";
function moduleStatusForCompletion(completion: any) {
  if (completion.status === MODULE_COMPLETION_BLOCKED_STATUS) return "BLOCKED";
  if (completion.status === MODULE_COMPLETION_FAIL_STATUS) return "FAIL";
  if (completion.status === MODULE_COMPLETION_ERROR_STATUS) return "FAIL";
  if (completion.status === MODULE_COMPLETION_PASS_STATUS) {
    return completion.metadata?.terminal_module === true
      ? "PASS"
      : completion.phase === "forge"
        ? "READY_FOR_TESTING"
        : "PASS";
  }
  throw new Error(`Unsupported module completion status: ${completion.status}`);
}

function moduleCompletionEventType(moduleStatus: any) {
  switch (moduleStatus) {
    case "READY_FOR_TESTING":
      return "module_attempt.ready_for_testing";
    case "PASS":
      return "module_attempt.passed";
    case "FAIL":
      return "module_attempt.failed";
    case "BLOCKED":
      return "module_attempt.blocked";
    default:
      throw new Error(
        `Unsupported module completion lifecycle status: ${moduleStatus}`,
      );
  }
}

function appendCompletionHistory(
  status: any,
  nextStatus: any,
  completion: any,
  now: any,
) {
  if (!Array.isArray(status.history)) status.history = [];
  status.history.push({
    timestamp: now,
    from: selectTruthyValue(
      () => status.status,
      () => null,
    ),
    to: nextStatus,
    agent: "completion",
    note: selectPresentValue(
      completion.summary,
      completion.reason_code,
      `${completion.phase} ${completion.status}`,
    ),
  });
}

function validateModuleCompletion(status: any, completionInput: any) {
  const completion = assertCompletion({
    ...completionInput,
    target_kind: selectPresentValue(completionInput.target_kind, "module"),
    target_id: selectPresentValue(completionInput.target_id, status?.module_id),
  });
  if (completion.target_kind !== "module")
    throw new Error("applyModuleCompletion requires module completion");
  if (!status)
    throw new Error("module completion status is required");
  if (typeof status !== "object")
    throw new Error("applyModuleCompletion requires mutable module status");
  if (status.module_id && status.module_id !== completion.target_id) {
    throw new Error(
      `applyModuleCompletion module mismatch: ${completion.target_id} != ${status.module_id}`,
    );
  }
  return completion;
}

function updateStatusFromCompletion(
  status: any,
  completion: any,
  nextStatus: string,
  now: string,
) {
  status.module_id = completion.target_id;
  status.status = nextStatus;
  status.current_phase = null;
  status.phase_started_at = null;
  status.active_agent = null;
  status.completion_summary = selectDefinedValue(
    () => completion.summary,
    () => status.completion_summary,
  );
  status.completed_at = nextStatus === "PASS" ? now : null;
  if (nextStatus !== "BLOCKED") return;
  status.blockedAt = now;
  status.blockedReason = selectPresentValue(
    completion.summary,
    completion.reason_code,
    MODULE_BLOCKED_REASON,
  );
  status.blockedPhase = completion.phase;
  status.blockedFailCount = selectDefinedValue(
    () => completion.metadata?.fail_count,
    () => completion.attempt,
  );
}

function completionMutation(
  completion: any,
  nextStatus: string,
  oldStatus: any,
  previousPhase: any,
  now: string,
) {
  return {
    eventType: moduleCompletionEventType(nextStatus),
    oldStatus,
    newStatus: nextStatus,
    previousPhase,
    phase: completion.phase,
    now,
    note: selectPresentValue(
      completion.summary,
      completion.reason_code,
      `${completion.phase} ${completion.status}`,
    ),
    completionSummary: selectDefinedValue(
      () => completion.summary,
      () => null,
    ),
    completedAt: nextStatus === "PASS" ? now : null,
    clearActiveAgent: true,
    attempt: completion.attempt,
    completion,
  };
}

export function applyModuleCompletion(
  config: any,
  dir: any,
  status: any,
  completionInput: any = {},
) {
  const completion = validateModuleCompletion(status, completionInput);
  const now = selectPresentValue(
    completion.occurred_at,
    new Date().toISOString(),
  );
  const oldStatus = selectTruthyValue(
    () => status.status,
    () => null,
  );
  const previousPhase = selectTruthyValue(
    () => status.current_phase,
    () => completion.phase,
  );
  const nextStatus = moduleStatusForCompletion(completion);
  updateStatusFromCompletion(status, completion, nextStatus, now);
  appendCompletionHistory(status, nextStatus, completion, now);
  const lifecycleMutation = completionMutation(
    completion,
    nextStatus,
    oldStatus,
    previousPhase,
    now,
  );
  appendModuleLifecycleEvent(config, dir, status, lifecycleMutation);
  return { status, lifecycleMutation };
}
