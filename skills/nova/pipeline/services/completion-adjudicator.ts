import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/completion-adjudicator.ts — canonical completion evidence projection/adjudication

import { STATUS } from '../core/constants.ts';

export const COMPLETION_IDENTITY_FIELDS = Object.freeze(['run_id', 'attempt', 'dispatch_id', 'session_key']);
export const STRONG_COMPLETION_IDENTITY_FIELDS = Object.freeze(['run_id', 'attempt', 'dispatch_id']);
export const TERMINAL_COMPLETION_STATUSES = Object.freeze([STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED]);
const REDIS_COMPLETION_SOURCE = 'redis';
const LIFECYCLE_READ_MODEL_SOURCE = 'lifecycle_read_model';

function normalizeIdentityValue(value) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return null;
  return String(value);
}

function normalizeText(value) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  return String(value).trim();
}

function normalizeStatusText(status) {
  return normalizeText(status).toUpperCase();
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function mapCompletionSource(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return null;
}

export function normalizeCompletionIdentity(identity = {}) {
  const normalized = {
    run_id: normalizeIdentityValue(firstDefined(identity.run_id, identity.runId)),
    attempt: normalizeIdentityValue(identity.attempt),
    dispatch_id: normalizeIdentityValue(firstDefined(identity.dispatch_id, identity.dispatchId)),
    session_key: normalizeIdentityValue(firstDefined(identity.session_key, identity.sessionKey)),
  };
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== null));
}

export function getMissingCompletionIdentityFields(identity = {}, requiredFields = STRONG_COMPLETION_IDENTITY_FIELDS) {
  const normalized = normalizeCompletionIdentity(identity);
  return requiredFields.filter((field) => !normalized[field]);
}

export function hasStrongCompletionIdentity(identity = {}) {
  return getMissingCompletionIdentityFields(identity).length === 0;
}

export function buildCompletionIdentityDiagnostics(identity = {}) {
  const normalized = normalizeCompletionIdentity(identity);
  const missing = getMissingCompletionIdentityFields(normalized);
  return {
    identity: normalized,
    strong: missing.length === 0,
    missing_fields: missing,
  };
}

export function buildActiveDispatchConfirmation(expectedIdentity = {}, completionIdentity = {}) {
  const expected = normalizeCompletionIdentity(expectedIdentity);
  const observed = normalizeCompletionIdentity(completionIdentity);
  const missingExpected = getMissingCompletionIdentityFields(expected);
  const missingObserved = STRONG_COMPLETION_IDENTITY_FIELDS.filter((field) => !observed[field]);
  const mismatched = STRONG_COMPLETION_IDENTITY_FIELDS.filter((field) => (
    expected[field]
      && observed[field]
      && expected[field] !== observed[field]
  ));
  const optionalMismatched = COMPLETION_IDENTITY_FIELDS.filter((field) => (
    !STRONG_COMPLETION_IDENTITY_FIELDS.includes(field)
      && expected[field]
      && observed[field]
      && expected[field] !== observed[field]
  ));

  return {
    confirmed: missingExpected.length === 0 && missingObserved.length === 0 && mismatched.length === 0 && optionalMismatched.length === 0,
    expected,
    observed,
    required_fields: STRONG_COMPLETION_IDENTITY_FIELDS,
    missing_expected_fields: missingExpected,
    missing_observed_fields: missingObserved,
    mismatched_fields: mismatched,
    optional_mismatched_fields: optionalMismatched,
  };
}

export function mapRedisStatus(redisStatus) {
  const map = {
    PASS: STATUS.PASS,
    FAIL: STATUS.FAIL,
    ISSUES_FOUND: STATUS.FAIL,
    BLOCKED: STATUS.BLOCKED,
    RATE_LIMITED: STATUS.RATE_LIMITED,
  };
  const mappedStatus = map[normalizeStatusText(redisStatus)];
  return selectDefinedValue(() => (mappedStatus), () => (STATUS.FAIL));
}

export function isRedisTimeoutOutcome(redisEntry = {}) {
  return normalizeStatusText(redisEntry?.outcome) === 'TIMEOUT';
}

export function isRedisRateLimitedOutcome(redisEntry = {}) {
  return normalizeStatusText(redisEntry?.outcome) === 'RATE_LIMITED';
}

export function isBusterPipelineOwnedSource(source = '') {
  return /(?:^|-)(?:orchestrator|buster-pipeline)/i.test(normalizeText(source));
}

export function isTerminalOwnedRateLimitedOutcome(redisEntry = {}) {
  if (!isRedisRateLimitedOutcome(redisEntry)) return false;
  return isBusterPipelineOwnedSource(redisEntry?.source);
}

function redisCompletionIsTerminal({ terminalOwnedRateLimited = false, timeout = false, targetReached = false, blocked = false } = {}) {
  return Boolean(selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (terminalOwnedRateLimited), () => (timeout))), () => (targetReached))), () => (blocked)));
}

function statusCompletionIsTerminal({ targetReached = false, blocked = false } = {}) {
  return Boolean(selectTruthyValue(() => (targetReached), () => (blocked)));
}

export function projectCompletionState({
  targetKind = 'module',
  targetId = null,
  expectedStatuses = [],
  redisEntry = null,
  status = null,
  source = null,
} = {}) {
  if (redisEntry?.status) {
    const mappedStatus = mapRedisStatus(redisEntry.status);
    const rateLimited = selectTruthyValue(() => (isRedisRateLimitedOutcome(redisEntry)), () => (mappedStatus === STATUS.RATE_LIMITED));
    const terminalOwnedRateLimited = isTerminalOwnedRateLimitedOutcome(redisEntry);
    const timeout = isRedisTimeoutOutcome(redisEntry);
    const targetReached = expectedStatuses.includes(mappedStatus) && !rateLimited && !timeout;
    const blocked = mappedStatus === STATUS.BLOCKED && !rateLimited && !timeout;
    return {
      targetKind,
      targetId,
      source: selectDefinedValue(() => (mapCompletionSource(source)), () => (REDIS_COMPLETION_SOURCE)),
      rawStatus: redisEntry.status,
      status: mappedStatus,
      redisEntry,
      terminal: redisCompletionIsTerminal({ terminalOwnedRateLimited, timeout, targetReached, blocked }),
      targetReached,
      blocked,
      rateLimited,
      terminalOwnedRateLimited,
      timeout,
      outcome: terminalOwnedRateLimited
        ? 'terminal_owned_rate_limited'
        : timeout
          ? 'timeout'
          : rateLimited
            ? 'rate_limited'
            : blocked
              ? 'blocked'
              : targetReached
                ? 'target_reached'
                : 'ignored',
    };
  }

  if (status?.status) {
    const rawStatus = status.status;
    const normalizedStatus = normalizeStatusText(rawStatus);
    const targetReached = expectedStatuses.includes(normalizedStatus);
    const blocked = normalizedStatus === STATUS.BLOCKED;
    const rateLimited = normalizedStatus === STATUS.RATE_LIMITED;
    return {
      targetKind,
      targetId,
      source: selectDefinedValue(() => (mapCompletionSource(source, status._source)), () => (LIFECYCLE_READ_MODEL_SOURCE)),
      rawStatus,
      status: normalizedStatus,
      statusEntry: status,
      terminal: statusCompletionIsTerminal({ targetReached, blocked }),
      targetReached,
      blocked,
      rateLimited,
      terminalOwnedRateLimited: false,
      timeout: false,
      outcome: rateLimited
        ? 'rate_limited'
        : blocked
          ? 'blocked'
          : targetReached
            ? 'target_reached'
            : 'pending',
    };
  }

  return {
    targetKind,
    targetId,
    source: mapCompletionSource(source),
    status: null,
    terminal: false,
    targetReached: false,
    blocked: false,
    rateLimited: false,
    terminalOwnedRateLimited: false,
    timeout: false,
    outcome: 'pending',
  };
}

function isTerminalCompletionStatus(status) {
  return TERMINAL_COMPLETION_STATUSES.includes(normalizeStatusText(status));
}

function completionAuthorityCandidate({ statusCompletion = null, redisCompletion = null, pendingCompletion = null } = {}) {
  if (statusCompletion) return statusCompletion;
  if (redisCompletion && !redisCompletion.terminal) return redisCompletion;
  return pendingCompletion;
}

function buildCompletionAuthorityPolicy({ redisCompletion = null, statusCompletion = null, expectedIdentity = {} } = {}) {
  const redisStatus = normalizeStatusText(redisCompletion?.status);
  const statusStatus = normalizeStatusText(statusCompletion?.status);
  const redisOutcome = normalizeStatusText(selectDefinedValue(() => (redisCompletion?.redisEntry?.outcome), () => (redisCompletion?.outcome)));
  const redisTerminal = Boolean(redisCompletion?.terminal && isTerminalCompletionStatus(redisStatus));
  const localTerminal = isTerminalCompletionStatus(statusStatus);
  const activeDispatch = buildActiveDispatchConfirmation(expectedIdentity, selectDefinedValue(() => (redisCompletion?.redisEntry), () => ({})));

  if (selectTruthyValue(() => (redisOutcome === 'COMPLETION_INVALID'), () => (redisOutcome === 'COMPLETION_CONFLICT'))) {
    return {
      code: redisOutcome === 'COMPLETION_INVALID' ? 'redis_completion_entry_invalid' : 'same_identity_completion_conflict',
      allow_redis_authority: false,
      conflict: true,
      requires_active_dispatch: true,
      active_dispatch_confirmed: activeDispatch.confirmed,
      active_dispatch: activeDispatch,
      redis_status: selectTruthyValue(() => (redisStatus), () => (null)),
      local_status: selectTruthyValue(() => (statusStatus), () => (null)),
    };
  }

  if (redisTerminal && localTerminal && redisStatus !== statusStatus) {
    return {
      code: 'redis_terminal_conflicts_with_terminal_status',
      allow_redis_authority: false,
      conflict: true,
      requires_active_dispatch: false,
      active_dispatch_confirmed: activeDispatch.confirmed,
      active_dispatch: activeDispatch,
      redis_status: redisStatus,
      local_status: statusStatus,
    };
  }

  if (redisTerminal && localTerminal && redisStatus === statusStatus) {
    return {
      code: 'redis_terminal_matches_local_truth',
      allow_redis_authority: false,
      conflict: false,
      requires_active_dispatch: false,
      active_dispatch_confirmed: activeDispatch.confirmed,
      active_dispatch: activeDispatch,
      redis_status: redisStatus,
      local_status: statusStatus,
    };
  }

  if (redisTerminal && !localTerminal) {
    const confirmed = activeDispatch.confirmed === true;
    return {
      code: confirmed ? 'redis_terminal_confirmed_by_active_dispatch' : 'redis_terminal_requires_active_dispatch',
      allow_redis_authority: confirmed,
      conflict: false,
      requires_active_dispatch: true,
      active_dispatch_confirmed: confirmed,
      active_dispatch: activeDispatch,
      redis_status: redisStatus,
      local_status: selectTruthyValue(() => (statusStatus), () => (null)),
    };
  }

  return {
    code: redisCompletion ? 'redis_nonterminal_or_ignored' : 'no_redis_completion',
    allow_redis_authority: Boolean(redisCompletion),
    conflict: false,
    requires_active_dispatch: false,
    active_dispatch_confirmed: activeDispatch.confirmed,
    active_dispatch: activeDispatch,
    redis_status: selectTruthyValue(() => (redisStatus), () => (null)),
    local_status: selectTruthyValue(() => (statusStatus), () => (null)),
  };
}

export function buildCompletionDrift({ redisCompletion = null, statusCompletion = null, expectedIdentity = {} } = {}) {
  const drift = [];
  const identity = buildCompletionIdentityDiagnostics(expectedIdentity);
  if (!identity.strong) {
    drift.push({
      code: 'completion_identity_weak',
      missing_fields: identity.missing_fields,
      identity: identity.identity,
    });
  }

  const redisStatus = normalizeStatusText(redisCompletion?.status);
  const statusStatus = normalizeStatusText(statusCompletion?.status);
  const authorityPolicy = buildCompletionAuthorityPolicy({ redisCompletion, statusCompletion, expectedIdentity });

  if (authorityPolicy.conflict) {
    drift.push({
      code: authorityPolicy.code,
      redis_status: redisStatus,
      local_status: statusStatus,
      redis_outcome: selectTruthyValue(() => (selectTruthyValue(() => (redisCompletion?.redisEntry?.outcome), () => (redisCompletion?.outcome))), () => (null)),
      status_outcome: selectTruthyValue(() => (statusCompletion?.outcome), () => (null)),
    });
  }

  return drift;
}

export function adjudicateCompletionEvidence({
  targetKind = 'module',
  targetId = null,
  expectedStatuses = [],
  expectedIdentity = {},
  redisEntry = null,
  status = null,
  statusSource = 'lifecycle_read_model',
  preferRedis = false,
} = {}) {
  const redisCompletion = redisEntry?.status
    ? projectCompletionState({ targetKind, targetId, expectedStatuses, redisEntry, source: 'redis' })
    : null;
  const statusCompletion = status?.status
    ? projectCompletionState({ targetKind, targetId, expectedStatuses, status, source: statusSource })
    : null;
  const drift = buildCompletionDrift({ redisCompletion, statusCompletion, expectedIdentity });
  const authority_policy = buildCompletionAuthorityPolicy({ redisCompletion, statusCompletion, expectedIdentity });
  const pendingCompletion = projectCompletionState({ targetKind, targetId, expectedStatuses });
  const candidate_completion = redisCompletion && authority_policy.requires_active_dispatch === true
    ? redisCompletion
    : null;
  const authority = preferRedis && redisCompletion && authority_policy.allow_redis_authority
    ? redisCompletion
    : completionAuthorityCandidate({ statusCompletion, redisCompletion, pendingCompletion });

  return {
    ...authority,
    authority_source: selectTruthyValue(() => (authority?.source), () => (null)),
    candidate_completion,
    redis_completion: redisCompletion,
    status_completion: statusCompletion,
    identity: buildCompletionIdentityDiagnostics(expectedIdentity),
    authority_policy,
    completion_conflict: authority_policy.conflict === true,
    drift,
    drift_detected: drift.length > 0,
  };
}

export function shouldApplyRedisCompletionToStatus({
  moduleId = null,
  expectedStatuses = [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED],
  expectedIdentity = {},
  redisEntry = null,
  status = null,
} = {}) {
  const adjudicated = adjudicateCompletionEvidence({
    targetKind: 'module',
    targetId: moduleId,
    expectedStatuses,
    expectedIdentity,
    redisEntry,
    status,
    preferRedis: true,
  });
  const redisStatus = selectTruthyValue(() => (adjudicated.redis_completion?.status), () => (null));
  const localStatus = normalizeStatusText(status?.status);
  const terminalStatuses = new Set(TERMINAL_COMPLETION_STATUSES);
  const shouldApply = Boolean(
    adjudicated.redis_completion?.terminal
      && terminalStatuses.has(redisStatus)
      && !adjudicated.completion_conflict
      && !terminalStatuses.has(localStatus)
      && adjudicated.authority_policy?.active_dispatch_confirmed === true
      && adjudicated.authority_policy?.allow_redis_authority === true,
  );
  return {
    shouldApply,
    status: redisStatus,
    conflict: adjudicated.completion_conflict === true,
    conflict_reason: adjudicated.completion_conflict ? adjudicated.authority_policy?.code : null,
    adjudication: adjudicated,
  };
}
