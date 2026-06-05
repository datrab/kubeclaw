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
  'fatal.error',
]);

function normalizeValue(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function safeRedisCompletionSource(source) {
  return ['buster-pipeline', 'buster-pipeline-task-queue', 'completion-conflict', 'completion-invalid', 'agent'].includes(String(source || ''))
    ? String(source)
    : 'agent';
}

export function buildCompletionEventEntry(rawEntry = {}, {
  config = {},
  targetKind = 'module',
  targetId = null,
  expectedIdentity = {},
} = {}) {
  const moduleId = normalizeValue(rawEntry.module ?? rawEntry.module_id ?? (targetKind === 'module' ? targetId : null));
  const gateId = normalizeValue(rawEntry.gate_id ?? (targetKind === 'gate' ? targetId : null));
  return {
    _id: normalizeValue(rawEntry._id) || '0-1',
    schema_version: normalizeValue(rawEntry.schema_version) || 'v1',
    type: 'completion',
    stream_role: normalizeValue(rawEntry.stream_role) || 'completion',
    project: normalizeValue(rawEntry.project) || normalizeValue(config.project) || 'unknown',
    target_kind: targetKind,
    target_id: normalizeValue(rawEntry.target_id ?? rawEntry.targetId) || gateId || moduleId || normalizeValue(targetId),
    module: moduleId || normalizeValue(rawEntry.module),
    gate_id: gateId || undefined,
    gate_type: normalizeValue(rawEntry.gate_type ?? rawEntry.gateType),
    run_id: normalizeValue(rawEntry.run_id ?? rawEntry.runId ?? expectedIdentity.run_id ?? expectedIdentity.runId),
    attempt: rawEntry.attempt ?? expectedIdentity.attempt ?? null,
    dispatch_id: normalizeValue(rawEntry.dispatch_id ?? rawEntry.dispatchId ?? expectedIdentity.dispatch_id ?? expectedIdentity.dispatchId),
    session_key: normalizeValue(rawEntry.session_key ?? rawEntry.sessionKey ?? expectedIdentity.session_key ?? expectedIdentity.sessionKey),
    source: safeRedisCompletionSource(rawEntry.source),
    timestamp: normalizeValue(rawEntry.timestamp ?? rawEntry.ts) || new Date().toISOString(),
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
  if (!signal || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') {
    throw new PipelineEventContractError('Buster completion controller requires an AbortSignal', { option: 'signal' });
  }
}

function buildInvalidCompletionEntry(entry = {}, validationErrors = [], expectedIdentity = {}) {
  return {
    ...entry,
    status: STATUS.FAIL,
    outcome: 'COMPLETION_INVALID',
    source: 'completion-invalid',
    reason: 'invalid_completion_entry_schema',
    summary: `Invalid Redis completion event: ${validationErrors.join('; ')}`,
    invalid_completion_errors: validationErrors.join('; '),
    run_id: normalizeValue(entry.run_id ?? expectedIdentity.run_id ?? expectedIdentity.runId),
    attempt: normalizeValue(entry.attempt ?? expectedIdentity.attempt),
    dispatch_id: normalizeValue(entry.dispatch_id ?? expectedIdentity.dispatch_id ?? expectedIdentity.dispatchId),
    session_key: normalizeValue(entry.session_key ?? expectedIdentity.session_key ?? expectedIdentity.sessionKey),
  };
}

function eventRedisEntry(event = {}) {
  return event?.payload?.entry || null;
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
  const validationErrors = validateRedisCompletionEntry(redisEntry || {});
  const effectiveRedisEntry = validationErrors.length > 0
    ? buildInvalidCompletionEntry(redisEntry || {}, validationErrors, expectedIdentity)
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

export function resolveBusterCompletionEvent({
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
      source: event.source || 'system',
      target_kind: targetKind,
      target_id: targetId,
      event,
      error: event.payload || {},
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
      const localResult = resolveLocalEvidence(event);
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

  return {
    resolved: false,
    reason: 'ignored_event',
    source: event?.source || null,
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
    const remainingTimeoutMs = timeoutRemainingMs == null
      ? budgetRemainingMs
      : Math.min(timeoutRemainingMs, budgetRemainingMs ?? timeoutRemainingMs);
    const event = await waitForAny(eventBus, BUSTER_COMPLETION_EVENT_TYPES, identity, {
      signal,
      timeoutMs: remainingTimeoutMs,
      ...(budget ? { budget } : {}),
    });
    const localStatus = typeof getLocalStatus === 'function' ? getLocalStatus() : null;
    const result = resolveBusterCompletionEvent({
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
    if ((fileCompletion.outcome === 'parse_error' || fileCompletion.outcome === 'invalid_contract') && fileCompletion.source === 'output_file') {
      return {
        resolved: true,
        reason: 'invalid_contract',
        source: 'output_file',
        target_kind: 'gate',
        target_id: gateId,
        event,
        local_completion: fileCompletion,
      };
    }
    if (fileCompletion.done) {
      return {
        resolved: true,
        reason: fileCompletion.outcome,
        source: fileCompletion.source || 'local_fs',
        target_kind: 'gate',
        target_id: gateId,
        event,
        local_completion: fileCompletion,
      };
    }
    return {
      resolved: false,
      reason: 'local_evidence_pending',
      source: fileCompletion.source || 'local_fs',
      target_kind: 'gate',
      target_id: gateId,
      event,
      local_completion: fileCompletion,
    };
  };
}
