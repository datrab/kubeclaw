const NO_PHASE_STATUSES = new Set([
  'PENDING',
  'READY_FOR_TESTING',
  'PASS',
  'FAIL',
  'BLOCKED',
]);

const PHASE_TO_STATUS = {
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

const PENDING_LIFECYCLE_MUTATION = Symbol.for('kubeclaw.pipeline.pendingLifecycleMutation');

function ensureHistory(status) {
  if (!status || typeof status !== 'object') throw new Error('status object is required');
  if (!Array.isArray(status.history)) status.history = [];
}

function appendHistory(status, newStatus, agent, note, now) {
  ensureHistory(status);
  status.history.push({
    timestamp: now,
    from: status.status || null,
    to: newStatus,
    agent,
    note: note || '',
  });
}

function cloneSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deriveLifecycleEventType(newStatus) {
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

function setPendingLifecycleMutation(status, mutation) {
  if (!mutation) {
    delete status[PENDING_LIFECYCLE_MUTATION];
    return null;
  }

  Object.defineProperty(status, PENDING_LIFECYCLE_MUTATION, {
    value: mutation,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return mutation;
}

export function peekPendingLifecycleMutation(status) {
  if (!status || typeof status !== 'object') return null;
  return status[PENDING_LIFECYCLE_MUTATION] || null;
}

export function updatePendingLifecycleMutation(status, patch = {}) {
  if (!status || typeof status !== 'object') throw new Error('status object is required');
  const current = peekPendingLifecycleMutation(status);
  if (!current) return null;
  return setPendingLifecycleMutation(status, {
    ...current,
    ...cloneSerializable(patch),
  });
}

export function consumePendingLifecycleMutation(status) {
  const current = peekPendingLifecycleMutation(status);
  if (!status || typeof status !== 'object') return null;
  delete status[PENDING_LIFECYCLE_MUTATION];
  return current ? cloneSerializable(current) : null;
}

export function transitionModuleStatus(status, newStatus, {
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
} = {}) {
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
    setPendingLifecycleMutation(status, {
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

  return status;
}

export function normalizeLifecycleStatus(status = {}) {
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

export function startModulePhase(status, phase, note, opts = {}) {
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

export function finalizeTerminalModuleState(status, {
  completedAt,
} = {}) {
  if (!status || typeof status !== 'object') throw new Error('status object is required');

  status.current_phase = null;
  status.phase_started_at = null;

  if (status.status === 'PASS' && completedAt !== undefined) {
    status.completed_at = completedAt;
  }

  return status;
}

export function markModuleBlocked(status, phase, note, {
  agent = 'pipeline',
  reason = null,
  failCount = null,
  now = new Date().toISOString(),
  clearActiveAgent = false,
} = {}) {
  transitionModuleStatus(status, 'BLOCKED', {
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
  updatePendingLifecycleMutation(status, {
    blockedReason: status.blockedReason,
    blockedAt: status.blockedAt,
    blockedPhase: status.blockedPhase,
    blockedFailCount: status.blockedFailCount ?? null,
  });
  return status;
}

export function getRetryStatusForPhase(phase) {
  return phase === 'buster' ? 'READY_FOR_TESTING' : 'PENDING';
}

export function setModuleActiveAgent(status, activeAgent, { merge = true } = {}) {
  if (!status || typeof status !== 'object') throw new Error('status object is required');
  const previous = merge ? (status.active_agent || {}) : {};
  status.active_agent = {
    ...previous,
    ...activeAgent,
  };
  updatePendingLifecycleMutation(status, {
    activeAgent: cloneSerializable(status.active_agent),
  });
  return status.active_agent;
}

export function clearModuleActiveAgent(status) {
  if (!status || typeof status !== 'object') throw new Error('status object is required');
  status.active_agent = null;
  updatePendingLifecycleMutation(status, {
    activeAgent: null,
  });
  return status.active_agent;
}
