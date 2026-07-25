type AnyRecord = Record<string, any>;

const NO_PHASE_STATUSES = new Set(['PENDING', 'READY_FOR_TESTING', 'PASS', 'FAIL', 'BLOCKED']);
const CLEAR_COMPLETION_SUMMARY_STATUSES = new Set(['IN_PROGRESS', 'READY_FOR_TESTING', 'TESTING']);

export function applyPhaseTransition(status: AnyRecord, newStatus: string, phase: unknown): void {
  if (phase !== undefined) {
    status.current_phase = phase;
    return;
  }
  const derivedPhase = newStatus === 'IN_PROGRESS'
    ? 'forge'
    : newStatus === 'TESTING' ? 'buster' : null;
  if (derivedPhase) {
    status.current_phase = derivedPhase;
  } else if (newStatus !== 'RATE_LIMITED' && NO_PHASE_STATUSES.has(newStatus)) {
    status.current_phase = derivedPhase;
  }
}

export function applyCompletionFields(status: AnyRecord, newStatus: string, options: AnyRecord): void {
  if (options.clearActiveAgent) status.active_agent = null;
  if ([options.clearCompletionSummary, CLEAR_COMPLETION_SUMMARY_STATUSES.has(newStatus)].includes(true)) {
    status.completion_summary = null;
  }
  if (options.completionSummary !== undefined) status.completion_summary = options.completionSummary;
  if (options.attemptStartedAt !== undefined) status.attempt_started_at = options.attemptStartedAt;
}

export function applyLifecycleTimestamps(status: AnyRecord, newStatus: string, options: AnyRecord): void {
  if (['IN_PROGRESS', 'TESTING'].includes(newStatus)) {
    status.phase_started_at = options.phaseStartedAt ?? options.now;
    status.completed_at = null;
    return;
  }
  status.phase_started_at = null;
  status.completed_at = newStatus === 'PASS'
    ? options.completedAt ?? options.now
    : null;
}
