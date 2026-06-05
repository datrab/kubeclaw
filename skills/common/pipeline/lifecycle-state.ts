type AnyRecord = Record<string, any>;

type LifecycleMutation = AnyRecord | null;

type LifecycleTransitionResult = {
  status: AnyRecord;
  lifecycleMutation: LifecycleMutation;
};

const NO_PHASE_STATUSES = new Set([
  'PENDING',
  'READY_FOR_TESTING',
  'PASS',
  'FAIL',
  'BLOCKED',
]);

const PHASE_TO_STATUS: AnyRecord = {
  forge: 'IN_PROGRESS',
  buster: 'TESTING',
};

const CLEAR_COMPLETION_SUMMARY_STATUSES = new Set([
  'IN_PROGRESS',
  'READY_FOR_TESTING',
  'TESTING',
]);

const CLEAR_COMPLETED_AT_STATUSES = new Set([
  'PENDING',
  'READY_FOR_TESTING',
  'IN_PROGRESS',
  'TESTING',
  'FAIL',
  'BLOCKED',
]);

function lifecycleResult(status: AnyRecord, lifecycleMutation: LifecycleMutation): LifecycleTransitionResult {
  return { status, lifecycleMutation };
}

function normalizeLifecycleMutation(candidate: any): LifecycleMutation {
  if (!candidate) return null;
  if (candidate.lifecycleMutation) return cloneSerializable(candidate.lifecycleMutation);
  if (candidate.eventType || candidate.lifecycleIntent) return cloneSerializable(candidate);
  return null;
}

function ensureHistory(status: AnyRecord) {
  if (!status || typeof status !== 'object') throw new Error('status object is required');
  if (!Array.isArray(status.history)) status.history = [];
}

function appendHistory(status: AnyRecord, newStatus: any, agent: any, note: any, now: any) {
  ensureHistory(status);
  status.history.push({
    timestamp: now,
    from: status.status || null,
    to: newStatus,
    agent,
    note: note || '',
  });
}

function cloneSerializable(value: any) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deriveLifecycleEventType(newStatus: any) {
  switch (newStatus) {
    case 'IN_PROGRESS':
      return 'module_attempt.started';
    case 'READY_FOR_TESTING':
      return 'module_attempt.ready_for_testing';
    case 'TESTING':
      return 'module_attempt.testing_started';
    case 'FAIL':
      return 'module_attempt.failed';
    case 'PASS':
      return 'module_attempt.passed';
    case 'BLOCKED':
      return 'module_attempt.blocked';
    default:
      return null;
  }
}

function mergeLifecycleMutation(current: any, patch: AnyRecord = {}) {
  const normalized = normalizeLifecycleMutation(current);
  if (!normalized) return null;
  return {
    ...normalized,
    ...cloneSerializable(patch),
  };
}

export function transitionModuleStatus(status: AnyRecord, newStatus: any, {
  agent = 'pipeline',
  note = '',
  phase,
  now = new Date().toISOString(),
  clearActiveAgent = false,
  clearCompletionSummary = false,
  completionSummary,
  phaseStartedAt,
  completedAt,
  attemptStartedAt,
}: AnyRecord = {}) {
  const oldStatus = status?.status || null;
  const previousPhase = status?.current_phase || null;

  appendHistory(status, newStatus, agent, note, now);
  status.status = newStatus;

  if (phase !== undefined) {
    status.current_phase = phase;
  } else if (newStatus === 'IN_PROGRESS') {
    status.current_phase = 'forge';
  } else if (newStatus === 'TESTING') {
    status.current_phase = 'buster';
  } else if (newStatus !== 'RATE_LIMITED' && NO_PHASE_STATUSES.has(newStatus)) {
    status.current_phase = null;
  }

  if (clearActiveAgent) status.active_agent = null;
  if (clearCompletionSummary || CLEAR_COMPLETION_SUMMARY_STATUSES.has(newStatus)) {
    status.completion_summary = null;
  }
  if (completionSummary !== undefined) {
    status.completion_summary = completionSummary;
  }

  if (attemptStartedAt !== undefined) {
    status.attempt_started_at = attemptStartedAt;
  }

  if (newStatus === 'IN_PROGRESS' || newStatus === 'TESTING') {
    status.phase_started_at = phaseStartedAt ?? now;
    status.completed_at = null;
  } else if (newStatus === 'PASS') {
    status.phase_started_at = null;
    status.completed_at = completedAt ?? now;
  } else if (newStatus !== 'RATE_LIMITED') {
    status.phase_started_at = null;
    status.completed_at = null;
  }

  const eventType = deriveLifecycleEventType(newStatus);
  if (eventType) {
    return lifecycleResult(status, {
      eventType,
      oldStatus,
      newStatus,
      previousPhase,
      phase: phase ?? status.current_phase ?? null,
      now,
      note,
      completionSummary: completionSummary !== undefined ? completionSummary : status.completion_summary,
      activeAgent: cloneSerializable(status.active_agent || null),
      attemptStartedAt: status.attempt_started_at || null,
      phaseStartedAt: status.phase_started_at || null,
      completedAt: status.completed_at || null,
      clearActiveAgent,
    });
  }

  if (newStatus === 'RATE_LIMITED') {
    return lifecycleResult(status, {
      lifecycleIntent: 'rate_limit_pause',
      oldStatus,
      newStatus,
      previousPhase,
      phase: phase ?? status.current_phase ?? null,
      now,
      note,
    });
  }

  return lifecycleResult(status, null);
}

export function normalizeLifecycleStatus(status: AnyRecord = {}) {
  if (!status || typeof status !== 'object') throw new Error('status object is required');

  const normalized = { ...status };
  const currentStatus = normalized.status || 'PENDING';

  if (CLEAR_COMPLETION_SUMMARY_STATUSES.has(currentStatus)) {
    normalized.completion_summary = null;
  }

  if (CLEAR_COMPLETED_AT_STATUSES.has(currentStatus)) {
    normalized.completed_at = null;
  }

  return normalized;
}

export function startModulePhase(status: AnyRecord, phase: any, note: any, opts: AnyRecord = {}) {
  const now = opts.now || new Date().toISOString();
  const nextStatus = PHASE_TO_STATUS[phase];
  if (!nextStatus) throw new Error(`unsupported module phase: ${phase}`);

  if (!status.started_at) status.started_at = now;
  if (phase === 'forge' || !status.attempt_started_at) status.attempt_started_at = now;

  return transitionModuleStatus(status, nextStatus, {
    ...opts,
    phase,
    note,
    now,
    phaseStartedAt: now,
  });
}

export function finalizeTerminalModuleState(status: AnyRecord, {
  completedAt,
  lifecycleMutation = null,
}: AnyRecord = {}) {
  if (!status || typeof status !== 'object') throw new Error('status object is required');

  const oldStatus = status.status || null;
  const previousPhase = status.current_phase || null;

  status.current_phase = null;
  status.phase_started_at = null;

  if (status.status === 'PASS' && completedAt !== undefined) {
    status.completed_at = completedAt;
  }

  const eventType = deriveLifecycleEventType(status.status);
  if (eventType && ['PASS', 'FAIL', 'BLOCKED'].includes(status.status)) {
    const current = mergeLifecycleMutation(lifecycleMutation, {
      completedAt: status.completed_at || null,
      phaseStartedAt: status.phase_started_at || null,
    });
    if (current) return lifecycleResult(status, current);

    return lifecycleResult(status, {
      eventType,
      oldStatus,
      newStatus: status.status,
      previousPhase,
      phase: null,
      now: completedAt || new Date().toISOString(),
      note: 'Terminal module state finalized',
      completionSummary: status.completion_summary || null,
      activeAgent: cloneSerializable(status.active_agent || null),
      attemptStartedAt: status.attempt_started_at || null,
      phaseStartedAt: status.phase_started_at || null,
      completedAt: status.completed_at || null,
      clearActiveAgent: false,
    });
  }

  return lifecycleResult(status, null);
}

export function markModuleBlocked(status: AnyRecord, phase: any, note: any, {
  agent = 'pipeline',
  reason = null,
  failCount = null,
  now = new Date().toISOString(),
  clearActiveAgent = false,
}: AnyRecord = {}) {
  const transition = transitionModuleStatus(status, 'BLOCKED', {
    agent,
    note,
    phase: null,
    now,
    clearActiveAgent,
  });
  status.blockedReason = reason || status.blockedReason || null;
  status.blockedAt = now;
  status.blockedPhase = phase || status.blockedPhase || null;
  if (failCount != null) status.blockedFailCount = failCount;
  return lifecycleResult(status, mergeLifecycleMutation(transition.lifecycleMutation, {
    blockedReason: status.blockedReason,
    blockedAt: status.blockedAt,
    blockedPhase: status.blockedPhase,
    blockedFailCount: status.blockedFailCount ?? null,
  }));
}

export function getRetryStatusForPhase(phase: any) {
  return phase === 'buster' ? 'READY_FOR_TESTING' : 'PENDING';
}

export function setModuleActiveAgent(status: AnyRecord, activeAgent: AnyRecord, { merge = true, lifecycleMutation = null }: AnyRecord = {}) {
  if (!status || typeof status !== 'object') throw new Error('status object is required');
  const previous = merge ? (status.active_agent || {}) : {};
  status.active_agent = {
    ...previous,
    ...activeAgent,
  };
  return lifecycleResult(status, mergeLifecycleMutation(lifecycleMutation, {
    activeAgent: cloneSerializable(status.active_agent),
  }));
}

export function clearModuleActiveAgent(status: AnyRecord, { lifecycleMutation = null }: AnyRecord = {}) {
  if (!status || typeof status !== 'object') throw new Error('status object is required');
  status.active_agent = null;
  return lifecycleResult(status, mergeLifecycleMutation(lifecycleMutation, {
    activeAgent: null,
  }));
}

export function markModuleLifecycleIntent(status: AnyRecord, lifecycleIntent: any, {
  oldStatus = status?.status || null,
  newStatus = status?.status || null,
  previousPhase = status?.current_phase || null,
  phase = status?.current_phase || null,
  now = new Date().toISOString(),
  note = '',
}: AnyRecord = {}) {
  if (!status || typeof status !== 'object') throw new Error('status object is required');
  return lifecycleResult(status, {
    lifecycleIntent,
    oldStatus,
    newStatus,
    previousPhase,
    phase,
    now,
    note,
  });
}
