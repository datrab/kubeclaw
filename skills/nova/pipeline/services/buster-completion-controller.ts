import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/buster-completion-controller.ts — OI-42 event-driven Buster completion controller.
// Phase 4 active path: waits on completion/local/fatal events and projects decisions
// for the Buster module/gate runner cutover.

import { STATUS } from '../core/constants.ts';
import { adjudicateCompletionEvidence } from './completion-adjudicator.ts';
import { validateRedisCompletionEntry } from './redis-message-contract.ts';
import { waitForAny, PipelineEventContractError } from './pipeline-event-contract.ts';
import {
  firstDefinedCompletionValue as firstDefined,
  normalizeCompletionIdentityValue as normalizeValue,
} from './completion-identity-values.ts';

const BUSTER_COMPLETION_EVENT_TYPES = Object.freeze([
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

function completionTargetModuleId(rawEntry: any, targetKind: any, targetId: any) {
  return normalizeValue(firstDefined(rawEntry.module_id, targetKind === 'module' ? targetId : null));
}

function completionTargetGateId(rawEntry: any, targetKind: any, targetId: any) {
  return normalizeValue(firstDefined(rawEntry.gate_id, targetKind === 'gate' ? targetId : null));
}

function completionTimestamp(rawEntry: any) {
  const timestamp = normalizeValue(firstDefined(rawEntry.timestamp, rawEntry.ts));
  if (!timestamp) throw new PipelineEventContractError('Redis completion entry requires timestamp', { field: 'timestamp' });
  return timestamp;
}

function completionBudgetTimeout(timeoutRemainingMs: any, budgetRemainingMs: any) {
  if (timeoutRemainingMs == null) return budgetRemainingMs;
  if (budgetRemainingMs == null) return timeoutRemainingMs;
  return Math.min(timeoutRemainingMs, budgetRemainingMs);
}

function safeRedisCompletionSource(source: any) {
  const normalizedSource = normalizeValue(source);
  return ['buster-pipeline', 'buster-pipeline-task-queue', 'completion-conflict', 'completion-invalid', 'agent'].includes(normalizedSource ?? '')
    ? normalizedSource
    : REDIS_COMPLETION_SOURCE_AGENT;
}

function objectRecord(value: any) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function buildCompletionEventEntry(rawEntry: any = {}, {
  config = {},
  targetKind = 'module',
  targetId = null,
}: any = {}) {
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
    timestamp: completionTimestamp(rawEntry),
    ...rawEntry,
    source: safeRedisCompletionSource(rawEntry.source),
  };
}

function defaultExpectedStatuses(targetKind: any) {
  return targetKind === 'gate'
    ? [STATUS.PASS, STATUS.FAIL]
    : [STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];
}

function requireSignal(signal: any) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!signal), () => (typeof signal.addEventListener !== 'function'))), () => (typeof signal.removeEventListener !== 'function'))) {
    throw new PipelineEventContractError('Buster completion controller requires an AbortSignal', { option: 'signal' });
  }
}

function buildInvalidCompletionEntry(entry: any = {}, validationErrors: any = []) {
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

function eventRedisEntry(event: any = {}) {
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
}: any) {
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

  const decision = redisCompletionDecision(completion);

  return {
    ...decision,
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

function redisCompletionDecision(completion: any) {
  if (completion.completion_conflict) return { resolved: true, reason: 'completion_conflict' };
  if (completion.terminalOwnedRateLimited) return { resolved: true, reason: 'terminal_owned_rate_limited' };
  if (completion.rateLimited && !completion.targetReached) return { resolved: true, reason: 'rate_limited' };
  if (completion.timeout) return { resolved: true, reason: 'timeout' };
  if (completion.targetReached) return { resolved: true, reason: 'target_reached' };
  if (completion.blocked) return { resolved: true, reason: 'blocked' };
  return { resolved: false, reason: 'pending' };
}

export async function resolveBusterCompletionEvent(options: any = {}) {
  const initialTargetKind = options.targetKind ?? 'module';
  const values = { targetKind: initialTargetKind, targetId: null, expectedStatuses: defaultExpectedStatuses(initialTargetKind), expectedIdentity: {}, localStatus: null, statusSource: 'local_evidence', resolveLocalEvidence: null, ...options };
  const { event, targetKind, targetId, expectedStatuses, expectedIdentity, localStatus, statusSource, resolveLocalEvidence } = values;
  const context = { event, targetKind, targetId };
  if (event?.type === 'fatal.error') return fatalCompletionEvent(context);
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

  if (event?.type === 'local.evidence.updated') return localEvidenceUpdated(context, resolveLocalEvidence);
  if (event?.type === 'local.evidence.warning') return localEvidenceWarning(context);
  return { resolved: false, reason: 'ignored_event', source: normalizeValue(event?.source), target_kind: targetKind, target_id: targetId, event };
}

function fatalCompletionEvent({ event, targetKind, targetId }: any) {
  return { resolved: true, reason: 'fatal_error', source: normalizeValue(event.source) || SYSTEM_SOURCE, target_kind: targetKind, target_id: targetId, event, error: objectRecord(event.payload) };
}

async function localEvidenceUpdated({ event, targetKind, targetId }: any, resolver: any) {
  if (typeof resolver === 'function') {
    const result = await resolver(event);
    if (result) return result;
  }
  return { resolved: false, reason: 'local_evidence_pending', source: LOCAL_FS_SOURCE, target_kind: targetKind, target_id: targetId, event };
}

function localEvidenceWarning({ event, targetKind, targetId }: any) {
  return { resolved: false, reason: normalizeValue(event?.payload?.reason) || LOCAL_EVIDENCE_WARNING_REASON, source: LOCAL_FS_SOURCE, target_kind: targetKind, target_id: targetId, event };
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
}: any = {}) {
  requireSignal(signal);
  const deadline = timeoutMs == null ? null : Date.now() + Number(timeoutMs);

  while (!signal.aborted) {
    const result = await waitForBusterCompletionIteration({ eventBus, identity, signal, deadline, budget, getLocalStatus, targetKind, targetId, expectedStatuses, expectedIdentity, statusSource, resolveLocalEvidence });
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

async function waitForBusterCompletionIteration(input: any) {
  input.budget?.throwIfExhausted?.();
  const timeoutRemainingMs = input.deadline == null ? undefined : Math.max(0, input.deadline - Date.now());
  const budgetRemainingMs = input.budget?.remainingMs ? input.budget.remainingMs() : undefined;
  const timeoutMs = completionBudgetTimeout(timeoutRemainingMs, budgetRemainingMs);
  const event = await waitForAny(input.eventBus, BUSTER_COMPLETION_EVENT_TYPES, input.identity, {
    signal: input.signal, timeoutMs, ...(input.budget ? { budget: input.budget } : {}),
  });
  const localStatus = typeof input.getLocalStatus === 'function' ? input.getLocalStatus() : null;
  return resolveBusterCompletionEvent({ ...input, event, localStatus });
}

function buildGateLocalEvidenceResolver(projectGateCompletionState: any, {
  config,
  gateId,
  gate,
  activeDispatch = null,
}: any = {}) {
  if (typeof projectGateCompletionState !== 'function') {
    throw new PipelineEventContractError('buildGateLocalEvidenceResolver requires projectGateCompletionState', { function: 'projectGateCompletionState' });
  }
  return function resolveGateLocalEvidence(event: any) {
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
