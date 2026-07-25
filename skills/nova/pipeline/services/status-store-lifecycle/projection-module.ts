import {
  arrayValue,
  numberValue,
  objectRecord,
  selectPresentValue,
} from "./projection-support.ts";
import { projectModuleValidation } from "./projection-module-validation.ts";

const STATUS: Record<string, string> = {
  "module_attempt.started": "IN_PROGRESS",
  "module_attempt.ready_for_testing": "READY_FOR_TESTING",
  "module_attempt.testing_started": "TESTING",
  "module_attempt.failed": "FAIL",
  "module_attempt.passed": "PASS",
  "module_attempt.blocked": "BLOCKED",
};
const PHASE: Record<string, string | null> = {
  "module_attempt.started": "forge",
  "module_attempt.ready_for_testing": null,
  "module_attempt.testing_started": "buster",
  "module_attempt.failed": null,
  "module_attempt.passed": null,
  "module_attempt.blocked": null,
};
const TERMINAL = new Set([
  "module_attempt.ready_for_testing",
  "module_attempt.passed",
  "module_attempt.failed",
  "module_attempt.blocked",
]);
const FAILED = new Set(["module_attempt.failed", "module_attempt.blocked"]);

function defined(primary: any, secondary: any = null): any {
  return primary !== undefined && primary !== null ? primary : secondary;
}

function moduleHistory(existing: any, event: any, status: any) {
  if (!status) return arrayValue(existing.history);
  return [
    ...arrayValue(existing.history),
    {
      timestamp: event.occurred_at,
      from: selectPresentValue(existing.status, "PENDING"),
      to: status,
      agent: selectPresentValue(event.refs?.agent, "pipeline"),
      note: selectPresentValue(
        event.data?.summary,
        event.data?.reason,
        event.type,
      ),
    },
  ];
}

function failureSummary(existing: any, event: any): any {
  if (!FAILED.has(event.type)) return null;
  return {
    at: event.occurred_at,
    phase: selectPresentValue(event.data?.phase, event.data?.blocked_phase),
    summary: selectPresentValue(
      event.data?.summary,
      event.data?.reason,
      "Module attempt failed",
    ),
    attempt: defined(event.refs?.attempt, existing.current_attempt),
    failure_class: defined(event.data?.failure_class),
  };
}

function moduleTiming(existing: any, event: any, opensAttempt: boolean) {
  const startsPhase = [
    "module_attempt.started",
    "module_attempt.testing_started",
  ].includes(event.type);
  const clearsPhase = TERMINAL.has(event.type);
  return {
    attempt_started_at: opensAttempt
      ? event.occurred_at
      : defined(existing.attempt_started_at),
    phase_started_at: startsPhase
      ? event.occurred_at
      : clearsPhase
        ? null
        : defined(existing.phase_started_at),
    completed_at:
      event.type === "module_attempt.passed"
        ? event.occurred_at
        : FAILED.has(event.type)
          ? null
          : defined(existing.completed_at),
  };
}

function moduleCompletion(existing: any, event: any) {
  const setsSummary = [
    "module_attempt.passed",
    "module_attempt.failed",
  ].includes(event.type);
  const clearsSummary = [
    "module_attempt.started",
    "module_attempt.ready_for_testing",
    "module_attempt.testing_started",
  ].includes(event.type);
  return {
    completion_summary: setsSummary
      ? selectPresentValue(event.data.summary, event.data.reason)
      : clearsSummary
        ? null
        : defined(existing.completion_summary),
    last_failure:
      event.type === "module_attempt.failed"
        ? selectPresentValue(event.data.summary, event.data.reason)
        : defined(existing.last_failure),
  };
}

function moduleFailure(existing: any, event: any, summary: any) {
  const blocked = event.type === "module_attempt.blocked";
  const failCount = FAILED.has(event.type)
    ? Math.max(
        numberValue(existing.fail_count, 0),
        numberValue(
          defined(event.refs.attempt, event.data.blocked_fail_count),
          0,
        ),
      )
    : numberValue(existing.fail_count, 0);
  return {
    fail_count: failCount,
    fail_summaries: summary
      ? [...arrayValue(existing.fail_summaries), summary]
      : arrayValue(existing.fail_summaries),
    blocked_at: blocked ? event.occurred_at : defined(existing.blocked_at),
    blocked_reason: blocked
      ? event.data.reason
      : defined(existing.blocked_reason),
    blocked_phase: blocked
      ? defined(event.data.blocked_phase)
      : defined(existing.blocked_phase),
    blocked_fail_count: blocked
      ? defined(event.data.blocked_fail_count)
      : defined(existing.blocked_fail_count),
  };
}

function moduleIdentity(existing: any, event: any) {
  return {
    dispatch_id: defined(event.refs.dispatch_id, existing.dispatch_id),
    gateway_label: defined(event.refs.gateway_label, existing.gateway_label),
    session_key: defined(event.refs.session_key, existing.session_key),
    model: defined(event.refs.model, existing.model),
    commit_hash: defined(event.data?.commit_hash, existing.commit_hash),
  };
}

function buildModuleProjection(existing: any, event: any) {
  const status = selectPresentValue(STATUS[event.type], existing.status);
  const opensAttempt =
    existing.current_attempt == null ||
    (event.refs.attempt != null &&
      Number(event.refs.attempt) !== Number(existing.current_attempt));
  const summary = failureSummary(existing, event);
  return {
    ...existing,
    module_id: event.refs.module_id,
    title: selectPresentValue(event.data.title, existing.title),
    module_dir: selectPresentValue(event.data.module_dir, existing.module_dir),
    current_attempt: defined(event.refs.attempt, existing.current_attempt),
    module_attempt_ref: selectPresentValue(
      event.refs.module_attempt_ref,
      existing.module_attempt_ref,
    ),
    status,
    history: moduleHistory(existing, event, status),
    current_phase:
      PHASE[event.type] !== undefined
        ? PHASE[event.type]
        : existing.current_phase,
    ...moduleTiming(existing, event, opensAttempt),
    ...moduleCompletion(existing, event),
    ...moduleFailure(existing, event, summary),
    ...moduleIdentity(existing, event),
    validation: projectModuleValidation(existing, event),
    projection_source: "canonical-events",
    latest_event_type: event.type,
    latest_event_at: event.occurred_at,
  };
}

function updateActiveModuleSession(next: any, event: any): void {
  const refs = event.refs;
  const moduleId = refs.module_id;
  const starts = [
    "module_attempt.started",
    "module_attempt.testing_started",
  ].includes(event.type);
  if (starts && refs.session_key) {
    next.active_sessions.modules[moduleId] = {
      module_id: moduleId,
      run_id: defined(refs.run_id),
      attempt: defined(refs.attempt),
      dispatch_id: defined(refs.dispatch_id),
      session_key: defined(refs.session_key),
      gateway_label: defined(refs.gateway_label),
      label: defined(refs.dispatch_id),
      phase: PHASE[event.type] !== undefined ? PHASE[event.type] : null,
      model: defined(refs.model),
      tracked_at: event.occurred_at,
      projection_source: "canonical-events",
    };
  } else if (starts || TERMINAL.has(event.type))
    delete next.active_sessions.modules[moduleId];
}

export function applyModuleEvent(next: any, event: any): void {
  const moduleId = event.refs?.module_id;
  if (!moduleId) return;
  const existing = objectRecord(next.modules[moduleId]) ?? {
    module_id: moduleId,
  };
  next.modules[moduleId] = buildModuleProjection(existing, event);
  updateActiveModuleSession(next, event);
}
