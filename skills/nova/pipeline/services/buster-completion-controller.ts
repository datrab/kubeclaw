import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/buster-completion-controller.ts — OI-42 event-driven Buster completion controller.
// Phase 4 active path: waits on completion/local/fatal events and projects decisions
// for the Buster module/gate runner cutover.

import { STATUS } from '../core/constants.ts';
import { adjudicateCompletionEvidence } from './completion-adjudicator.ts';
import { validateRedisCompletionEntry } from './redis-message-contract.ts';
import { waitForAny, PipelineEventContractError } from './pipeline-event-contract.ts';

export const BUSTER_COMPLETION_EVENT_TYPES = Object.freeze([
  'completion.evidence',
  'local.evidence.updated',
  'local.evidence.warning',
  'fatal.error',
]);
const REDIS_COMPLETION_SOURCE_AGENT = 'agent';
const REDIS_COMPLETION_INITIAL_ID = '0-1';
const REDIS_COMPLETION_SCHEMA_VERSION = 'v1';
const REDIS_COMPLETION_STREAM_ROLE = 'completion';
const SYSTEM_SOURCE = 'system';
const LOCAL_FS_SOURCE = 'local_fs';
const LOCAL_EVIDENCE_WARNING_REASON = 'local_evidence_warning';

function normalizeValue(value) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return null;
  return String(value);
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function completionTargetModuleId(rawEntry, targetKind, targetId) {
  return normalizeValue(firstDefined(rawEntry.module_id, targetKind === 'module' ? targetId : null));
}

function completionTargetGateId(rawEntry, targetKind, targetId) {
  return normalizeValue(firstDefined(rawEntry.gate_id, targetKind === 'gate' ? targetId : null));
}

function completionTimestamp(rawEntry) {
  const timestamp = normalizeValue(firstDefined(rawEntry.timestamp, rawEntry.ts));
  if (!timestamp) throw new PipelineEventContractError('Redis completion entry requires timestamp', { field: 'timestamp' });
  return timestamp;
}

function completionBudgetTimeout(timeoutRemainingMs, budgetRemainingMs) {
  if (timeoutRemainingMs == null) return budgetRemainingMs;
  if (budgetRemainingMs == null) return timeoutRemainingMs;
  return Math.min(timeoutRemainingMs, budgetRemainingMs);
}

function safeRedisCompletionSource(source) {
  const normalizedSource = normalizeValue(source);
  return ['buster-pipeline', 'buster-pipeline-task-queue', 'completion-conflict', 'completion-invalid', 'agent'].includes(normalizedSource)
    ? normalizedSource
    : REDIS_COMPLETION_SOURCE_AGENT;
}

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function buildCompletionEventEntry(rawEntry = {}, {
  config = {},
  targetKind = 'module',
  targetId = null,
} = {}) {
  const moduleId = completionTargetModuleId(rawEntry, targetKind, targetId);
  const gateId = completionTargetGateId(rawEntry, targetKind, targetId);
  return {
    _id: selectDefinedValue(() => (normalizeValue(rawEntry._id)), () => (REDIS_COMPLETION_INITIAL_ID)),
    schema_version: selectDefinedValue(() => (normalizeValue(rawEntry.schema_version)), () => (REDIS_COMPLETION_SCHEMA_VERSION)),
    type: 'completion',
    stream_role: selectDefinedValue(() => (normalizeValue(rawEntry.stream_role)), () => (REDIS_COMPLETION_STREAM_ROLE)),
    project: selectDefinedValue(() => (selectDefinedValue(() => (normalizeValue(rawEntry.project)), () => (normalizeValue(config.project)))), () => ('missing_project')),
    target_kind: targetKind,
    target_id: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (normalizeValue(selectDefinedValue(() => (rawEntry.target_id), () => (rawEntry.targetId)))), () => (gateId))), () => (moduleId))), () => (normalizeValue(targetId))),
    module: selectDefinedValue(() => (moduleId), () => (normalizeValue(rawEntry.module))),
    gate_id: selectTruthyValue(() => (gateId), () => (undefined)),
    gate_type: normalizeValue(firstDefined(rawEntry.gate_type, rawEntry.gateType)),
    run_id: normalizeValue(firstDefined(rawEntry.run_id, rawEntry.runId)),
    attempt: selectDefinedValue(() => (rawEntry.attempt), () => (null)),
    dispatch_id: normalizeValue(firstDefined(rawEntry.dispatch_id, rawEntry.dispatchId)),
    session_key: normalizeValue(firstDefined(rawEntry.session_key, rawEntry.sessionKey)),
    source: safeRedisCompletionSource(rawEntry.source),
    timestamp: completionTimestamp(rawEntry),
    ...rawEntry,
    source: safeRedisCompletionSource(rawEntry.source),
  };
}

function defaultExpectedStatuses(targetKind) {
  return targetKind === 'gate'
    ? [STATUS.PASS, STATUS.FAIL]
    : [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];
}

function requireSignal(signal) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!signal), () => (typeof signal.addEventListener !== 'function'))), () => (typeof signal.removeEventListener !== 'function'))) {
    throw new PipelineEventContractError('Buster completion controller requires an AbortSignal', { option: 'signal' });
  }
}

function buildInvalidCompletionEntry(entry = {}, validationErrors = []) {
  return {
    ...entry,
    status: STATUS.FAIL,
    outcome: 'COMPLETION_INVALID',
    source: 'completion-invalid',
    reason: 'invalid_completion_entry_schema',
    summary: `Invalid Redis completion event: ${validationErrors.join('; ')}`,
    invalid_completion_errors: validationErrors.join('; '),
    run_id: normalizeValue(entry.run_id),
    attempt: normalizeValue(entry.attempt),
    dispatch_id: normalizeValue(entry.dispatch_id),
    session_key: normalizeValue(entry.session_key),
  };
}

function eventRedisEntry(event = {}) {
  return selectTruthyValue(() => (event?.payload?.entry), () => (null));
}

function buildRedisCompletionResult({
  targetKind,
  targetId,
  expectedStatuses,
  expectedIdentity,
  redisEntry,
  localStatus = null,
  statusSource = 'local_evidence',
  event = null,
}) {
  const redisRecord = objectRecord(redisEntry);
  const validationErrors = validateRedisCompletionEntry(redisRecord);
  const effectiveRedisEntry = validationErrors.length > 0
    ? buildInvalidCompletionEntry(redisRecord, validationErrors)
    : redisEntry;

  const completion = adjudicateCompletionEvidence({
    targetKind,
    targetId,
    expectedStatuses,
    expectedIdentity,
    redisEntry: effectiveRedisEntry,
    status: localStatus,
    statusSource,
    preferRedis: true,
  });

  let reason = 'pending';
  let resolved = false;

  if (completion.completion_conflict) {
    reason = 'completion_conflict';
    resolved = true;
  } else if (completion.terminalOwnedRateLimited) {
    reason = 'terminal_owned_rate_limited';
    resolved = true;
  } else if (completion.rateLimited && !completion.targetReached) {
    reason = 'rate_limited';
    resolved = true;
  } else if (completion.timeout) {
    reason = 'timeout';
    resolved = true;
  } else if (completion.targetReached) {
    reason = 'target_reached';
    resolved = true;
  } else if (completion.blocked) {
    reason = 'blocked';
    resolved = true;
  }

  return {
    resolved,
    reason,
    source: 'redis',
    target_kind: targetKind,
    target_id: targetId,
    event,
    redis_entry: effectiveRedisEntry,
    invalid_redis_entry: validationErrors.length > 0,
    validation_errors: validationErrors,
    completion,
  };
}

export async function resolveBusterCompletionEvent({
  event,
  targetKind = 'module',
  targetId = null,
  expectedStatuses = defaultExpectedStatuses(targetKind),
  expectedIdentity = {},
  localStatus = null,
  statusSource = 'local_evidence',
  resolveLocalEvidence = null,
} = {}) {
  if (event?.type === 'fatal.error') {
    return {
      resolved: true,
      reason: 'fatal_error',
      source: selectDefinedValue(() => (normalizeValue(event.source)), () => (SYSTEM_SOURCE)),
      target_kind: targetKind,
      target_id: targetId,
      event,
      error: objectRecord(event.payload),
    };
  }

  if (event?.type === 'completion.evidence') {
    return buildRedisCompletionResult({
      targetKind,
      targetId,
      expectedStatuses,
      expectedIdentity,
      redisEntry: eventRedisEntry(event),
      localStatus,
      statusSource,
      event,
    });
  }

  if (event?.type === 'local.evidence.updated') {
    if (typeof resolveLocalEvidence === 'function') {
      const localResult = await resolveLocalEvidence(event);
      if (localResult) return localResult;
    }
    return {
      resolved: false,
      reason: 'local_evidence_pending',
      source: 'local_fs',
      target_kind: targetKind,
      target_id: targetId,
      event,
    };
  }

  if (event?.type === 'local.evidence.warning') {
    return {
      resolved: false,
      reason: selectDefinedValue(() => (normalizeValue(event?.payload?.reason)), () => (LOCAL_EVIDENCE_WARNING_REASON)),
      source: LOCAL_FS_SOURCE,
      target_kind: targetKind,
      target_id: targetId,
      event,
    };
  }

  return {
    resolved: false,
    reason: 'ignored_event',
    source: normalizeValue(event?.source),
    target_kind: targetKind,
    target_id: targetId,
    event,
  };
}

export async function waitForBusterCompletion({
  eventBus,
  identity,
  signal,
  timeoutMs,
  targetKind = 'module',
  targetId = null,
  expectedStatuses = defaultExpectedStatuses(targetKind),
  expectedIdentity = {},
  getLocalStatus = null,
  statusSource = 'local_evidence',
  resolveLocalEvidence = null,
  budget = null,
} = {}) {
  requireSignal(signal);
  const deadline = timeoutMs == null ? null : Date.now() + Number(timeoutMs);

  while (!signal.aborted) {
    budget?.throwIfExhausted?.();
    const timeoutRemainingMs = deadline == null ? undefined : Math.max(0, deadline - Date.now());
    const budgetRemainingMs = budget?.remainingMs ? budget.remainingMs() : undefined;
    const remainingTimeoutMs = completionBudgetTimeout(timeoutRemainingMs, budgetRemainingMs);
    const event = await waitForAny(eventBus, BUSTER_COMPLETION_EVENT_TYPES, identity, {
      signal,
      timeoutMs: remainingTimeoutMs,
      ...(budget ? { budget } : {}),
    });
    const localStatus = typeof getLocalStatus === 'function' ? getLocalStatus() : null;
    const result = await resolveBusterCompletionEvent({
      event,
      targetKind,
      targetId,
      expectedStatuses,
      expectedIdentity,
      localStatus,
      statusSource,
      resolveLocalEvidence,
    });
    if (result?.resolved) return result;
  }

  return {
    resolved: true,
    reason: 'aborted',
    source: 'system',
    target_kind: targetKind,
    target_id: targetId,
  };
}

export function buildGateLocalEvidenceResolver(projectGateCompletionState, {
  config,
  gateId,
  gate,
  activeDispatch = null,
} = {}) {
  if (typeof projectGateCompletionState !== 'function') {
    throw new PipelineEventContractError('buildGateLocalEvidenceResolver requires projectGateCompletionState', { function: 'projectGateCompletionState' });
  }
  return function resolveGateLocalEvidence(event) {
    const fileCompletion = projectGateCompletionState(config, gateId, gate, { activeDispatch });
    return {
      resolved: false,
      reason: 'local_evidence_pending',
      source: selectDefinedValue(() => (normalizeValue(fileCompletion.source)), () => (LOCAL_FS_SOURCE)),
      target_kind: 'gate',
      target_id: gateId,
      event,
      local_completion: fileCompletion,
    };
  };
}
