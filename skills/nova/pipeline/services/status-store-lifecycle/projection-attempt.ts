import {
  attemptSessionId,
  attemptStatus,
  attemptWorkIdentity,
} from "./projection-support.ts";

export function applyAttemptEvent(next: any, event: any): void {
  const attempt = event.refs?.attempt;
  const work = attemptWorkIdentity(event);
  if (attempt == null || !work) return;
  const attemptId = `${work.workId}/${attempt}`;
  next.attempts ??= {};
  next.attempts[attemptId] = {
    attempt_id: attemptId,
    work_id: work.workId,
    work_type: work.workType,
    attempt: Number(attempt),
    status: attemptStatus(event),
    reason_code: event.data?.reason_code ?? null,
    dispatch_id: event.refs?.dispatch_id ?? null,
    session_id: attemptSessionId(event),
    last_event_id: event.event_id,
    last_effective_at: event.occurred_at,
  };
}
