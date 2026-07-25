import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/completion-adjudicator.ts — canonical completion evidence projection/adjudication

import { STATUS } from '../core/constants.ts';
import {
  STRONG_COMPLETION_IDENTITY_FIELDS,
  buildActiveDispatchConfirmation,
  buildCompletionIdentityDiagnostics,
  normalizeCompletionIdentity,
} from './completion-identity.ts';
export { hasStrongCompletionIdentity, normalizeCompletionIdentity } from './completion-identity.ts';

const TERMINAL_COMPLETION_STATUSES = Object.freeze([STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED]);
const REDIS_COMPLETION_SOURCE = 'redis';
const LIFECYCLE_READ_MODEL_SOURCE = 'lifecycle_read_model';

function normalizeText(value: any) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  return String(value).trim();
}

function normalizeStatusText(status: any) {
  return normalizeText(status).toUpperCase();
}

function firstDefined(...values: any) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function mapCompletionSource(...values: any) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return null;
}


export function mapRedisStatus(redisStatus: any) {
  const map: Record<string, string> = {
    PASS: STATUS.PASS,
    FAIL: STATUS.FAIL,
    ISSUES_FOUND: STATUS.FAIL,
    BLOCKED: STATUS.BLOCKED,
    RATE_LIMITED: STATUS.RATE_LIMITED,
  };
  const mappedStatus = map[normalizeStatusText(redisStatus)];
  return selectDefinedValue(() => (mappedStatus), () => (STATUS.FAIL));
}

export function isRedisTimeoutOutcome(redisEntry: any = {}) {
  return normalizeStatusText(redisEntry?.outcome) === 'TIMEOUT';
}

export function isRedisRateLimitedOutcome(redisEntry: any = {}) {
  return normalizeStatusText(redisEntry?.outcome) === 'RATE_LIMITED';
}

export function isBusterPipelineOwnedSource(source: any = '') {
  return /(?:^|-)(?:orchestrator|buster-pipeline)/i.test(normalizeText(source));
}

export function isTerminalOwnedRateLimitedOutcome(redisEntry: any = {}) {
  if (!isRedisRateLimitedOutcome(redisEntry)) return false;
  return isBusterPipelineOwnedSource(redisEntry?.source);
}

function redisCompletionIsTerminal({ terminalOwnedRateLimited = false, timeout = false, targetReached = false, blocked = false }: any = {}) {
  return Boolean(selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (terminalOwnedRateLimited), () => (timeout))), () => (targetReached))), () => (blocked)));
}

function statusCompletionIsTerminal({ targetReached = false, blocked = false }: any = {}) {
  return Boolean(selectTruthyValue(() => (targetReached), () => (blocked)));
}

export function projectCompletionState({
  targetKind = 'module',
  targetId = null,
  expectedStatuses = [],
  redisEntry = null,
  status = null,
  source = null,
}: any = {}) {
  const context = { targetKind, targetId, expectedStatuses, source };
  if (redisEntry?.status) return projectRedisCompletion(context, redisEntry);
  if (status?.status) return projectStatusCompletion(context, status);

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

function projectRedisCompletion(context: any, redisEntry: any) {
  const status = mapRedisStatus(redisEntry.status);
  const rateLimited = selectTruthyValue(
    () => isRedisRateLimitedOutcome(redisEntry),
    () => status === STATUS.RATE_LIMITED,
  );
  const terminalOwnedRateLimited = isTerminalOwnedRateLimitedOutcome(redisEntry);
  const timeout = isRedisTimeoutOutcome(redisEntry);
  const targetReached = context.expectedStatuses.includes(status) && !rateLimited && !timeout;
  const blocked = status === STATUS.BLOCKED && !rateLimited && !timeout;
  return {
    targetKind: context.targetKind, targetId: context.targetId,
    source: selectTruthyValue(() => mapCompletionSource(context.source), () => REDIS_COMPLETION_SOURCE),
    rawStatus: redisEntry.status, status, redisEntry,
    terminal: redisCompletionIsTerminal({ terminalOwnedRateLimited, timeout, targetReached, blocked }),
    targetReached, blocked, rateLimited, terminalOwnedRateLimited, timeout,
    outcome: redisCompletionOutcome({ terminalOwnedRateLimited, timeout, rateLimited, blocked, targetReached }),
  };
}

function redisCompletionOutcome(flags: any) {
  if (flags.terminalOwnedRateLimited) return 'terminal_owned_rate_limited';
  if (flags.timeout) return 'timeout';
  if (flags.rateLimited) return 'rate_limited';
  if (flags.blocked) return 'blocked';
  if (flags.targetReached) return 'target_reached';
  return 'ignored';
}

function projectStatusCompletion(context: any, statusEntry: any) {
  const rawStatus = statusEntry.status;
  const status = normalizeStatusText(rawStatus);
  const targetReached = context.expectedStatuses.includes(status);
  const blocked = status === STATUS.BLOCKED;
  const rateLimited = status === STATUS.RATE_LIMITED;
  return {
    targetKind: context.targetKind, targetId: context.targetId,
    source: selectTruthyValue(
      () => mapCompletionSource(context.source, statusEntry._source),
      () => LIFECYCLE_READ_MODEL_SOURCE,
    ),
    rawStatus, status, statusEntry,
    terminal: statusCompletionIsTerminal({ targetReached, blocked }),
    targetReached, blocked, rateLimited, terminalOwnedRateLimited: false, timeout: false,
    outcome: statusCompletionOutcome({ rateLimited, blocked, targetReached }),
  };
}

function statusCompletionOutcome(flags: any) {
  if (flags.rateLimited) return 'rate_limited';
  if (flags.blocked) return 'blocked';
  if (flags.targetReached) return 'target_reached';
  return 'pending';
}

function isTerminalCompletionStatus(status: any) {
  return TERMINAL_COMPLETION_STATUSES.includes(normalizeStatusText(status));
}

function completionAuthorityCandidate({ statusCompletion = null, redisCompletion = null, pendingCompletion = null }: any = {}) {
  if (statusCompletion) return statusCompletion;
  if (redisCompletion && !redisCompletion.terminal) return redisCompletion;
  return pendingCompletion;
}

function buildCompletionAuthorityPolicy({ redisCompletion = null, statusCompletion = null, expectedIdentity = {} }: any = {}) {
  const redisStatus = normalizeStatusText(redisCompletion?.status);
  const statusStatus = normalizeStatusText(statusCompletion?.status);
  const redisOutcome = normalizeStatusText(selectDefinedValue(() => (redisCompletion?.redisEntry?.outcome), () => (redisCompletion?.outcome)));
  const redisTerminal = Boolean(redisCompletion?.terminal && isTerminalCompletionStatus(redisStatus));
  const localTerminal = isTerminalCompletionStatus(statusStatus);
  const activeDispatch = buildActiveDispatchConfirmation(expectedIdentity, selectDefinedValue(() => (redisCompletion?.redisEntry), () => ({})));

  const context = { redisCompletion, redisOutcome, redisStatus, statusStatus, redisTerminal, localTerminal, activeDispatch };
  return completionAuthorityDecision(context);
}

function completionAuthorityDecision(context: any) {
  const base = {
    active_dispatch: context.activeDispatch,
    active_dispatch_confirmed: context.activeDispatch.confirmed,
    redis_status: selectTruthyValue(() => context.redisStatus, () => null),
    local_status: selectTruthyValue(() => context.statusStatus, () => null),
  };
  if (['COMPLETION_INVALID', 'COMPLETION_CONFLICT'].includes(context.redisOutcome)) {
    return { ...base, code: context.redisOutcome === 'COMPLETION_INVALID' ? 'redis_completion_entry_invalid' : 'same_identity_completion_conflict', allow_redis_authority: false, conflict: true, requires_active_dispatch: true };
  }
  if (context.redisTerminal && context.localTerminal) {
    const matches = context.redisStatus === context.statusStatus;
    return { ...base, code: matches ? 'redis_terminal_matches_local_truth' : 'redis_terminal_conflicts_with_terminal_status', allow_redis_authority: false, conflict: !matches, requires_active_dispatch: false };
  }
  if (context.redisTerminal) {
    const confirmed = context.activeDispatch.confirmed === true;
    return { ...base, code: confirmed ? 'redis_terminal_confirmed_by_active_dispatch' : 'redis_terminal_requires_active_dispatch', allow_redis_authority: confirmed, conflict: false, requires_active_dispatch: true, active_dispatch_confirmed: confirmed };
  }
  return { ...base, code: context.redisCompletion ? 'redis_nonterminal_or_ignored' : 'no_redis_completion', allow_redis_authority: Boolean(context.redisCompletion), conflict: false, requires_active_dispatch: false };
}

function buildCompletionDrift({ redisCompletion = null, statusCompletion = null, expectedIdentity = {} }: any = {}) {
  const drift: any[] = [];
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

export function adjudicateCompletionEvidence(options: any = {}) {
  const values = { targetKind: 'module', targetId: null, expectedStatuses: [], expectedIdentity: {}, redisEntry: null, status: null, statusSource: 'lifecycle_read_model', preferRedis: false, ...options };
  const { targetKind, targetId, expectedStatuses, expectedIdentity, redisEntry, status, statusSource, preferRedis } = values;
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
}: any = {}) {
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
  const shouldApply = canApplyRedisCompletion(adjudicated, redisStatus, localStatus, terminalStatuses);
  return {
    shouldApply,
    status: redisStatus,
    conflict: adjudicated.completion_conflict === true,
    conflict_reason: adjudicated.completion_conflict ? adjudicated.authority_policy?.code : null,
    adjudication: adjudicated,
  };
}

function canApplyRedisCompletion(adjudicated: any, redisStatus: any, localStatus: any, terminalStatuses: Set<string>) {
  if (selectTruthyValue(() => !adjudicated.redis_completion?.terminal, () => !terminalStatuses.has(redisStatus))) return false;
  if (selectTruthyValue(() => adjudicated.completion_conflict, () => terminalStatuses.has(localStatus))) return false;
  return adjudicated.authority_policy?.active_dispatch_confirmed === true
    && adjudicated.authority_policy?.allow_redis_authority === true;
}
