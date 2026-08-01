import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
import { LocalEventEmitter } from './local-event-emitter.js';
import {
  isNonEmptyText as isNonEmptyString,
  isValueRecord as isPlainObject,
  normalizeOptionalString as normalizeValue,
} from '../value-boundary.js';
// Shared in-process pipeline event contract.
// Edge adapters emit normalized events; orchestration waits on this contract
// instead of owning transport-specific polling loops.

type UnknownRecord = Record<string, any>;

const NO_REMAINING_BUDGET_MS = 0;

import { BudgetExhaustedError } from '../timing.js';
import {
  validateAcpSessionStateEventPayload,
  validateAcpTranscriptDeltaEventPayload,
} from './acp-gateway-contract.js';
import { validateApprovalSignalEventPayload } from './approval-signal-event-contract.js';
export { validateApprovalSignalEventPayload } from './approval-signal-event-contract.js';
import {
  PipelineEventContractError,
  PipelineEventWaitAbortedError,
  PipelineEventWaitTimeoutError,
} from './pipeline-event-errors.js';
export {
  PipelineEventContractError,
  PipelineEventWaitAbortedError,
  PipelineEventWaitTimeoutError,
} from './pipeline-event-errors.js';

export const PIPELINE_EVENT_SCHEMA_VERSION = 'v1';

export const PIPELINE_EVENT_TYPES = Object.freeze([
  'completion.evidence',
  'local.evidence.updated',
  'local.evidence.warning',
  'approval.signal',
  'acp.session.state',
  'acp.transcript.delta',
  'fatal.error',
]);

export const PIPELINE_EVENT_SOURCES = Object.freeze([
  'redis',
  'local_fs',
  'acp_gateway',
  'system',
]);

export const PIPELINE_EVENT_IDENTITY_FIELDS = Object.freeze([
  'module_id',
  'gate_id',
  'run_id',
  'attempt',
  'dispatch_id',
  'session_key',
  'gateway_label',
]);

const PIPELINE_EVENT_CHANNEL = 'pipeline:event';

function pipelineEventIdentitySource(event: UnknownRecord = {}): UnknownRecord {
  return isPlainObject(event.identity) ? event.identity : event;
}

function eventTimestampAuthority(event: UnknownRecord = {}): string {
  return normalizeValue(event.ts ?? event.timestamp) ?? new Date().toISOString();
}

function waitTimeoutBudgetAuthority(callerTimeoutMs: number, budgetRemainingMs: number | null): number {
  return Math.min(callerTimeoutMs, budgetRemainingMs ?? Infinity);
}

export function normalizePipelineEventIdentity(identity: UnknownRecord = {}): UnknownRecord {
  return Object.fromEntries(
    PIPELINE_EVENT_IDENTITY_FIELDS
      .map((field) => [field, normalizeValue(identity[field])])
      .filter(([, value]) => value !== null),
  );
}

export function normalizePipelineEvent(event: UnknownRecord = {}): UnknownRecord {
  const identity = normalizePipelineEventIdentity(pipelineEventIdentitySource(event));
  return {
    schema_version: selectTruthyValue(() => (normalizeValue(event.schema_version)), () => (PIPELINE_EVENT_SCHEMA_VERSION)),
    type: normalizeValue(event.type),
    source: normalizeValue(event.source),
    identity,
    payload: isPlainObject(event.payload) ? event.payload : {},
    ts: eventTimestampAuthority(event),
  };
}

function validateEventEnvelope(event: UnknownRecord, normalized: UnknownRecord, errors: string[]): void {
  if (normalized.schema_version !== PIPELINE_EVENT_SCHEMA_VERSION) {
    errors.push(`schema_version must be '${PIPELINE_EVENT_SCHEMA_VERSION}'`);
  }
  if (!PIPELINE_EVENT_TYPES.includes(normalized.type)) errors.push(`type must be one of: ${PIPELINE_EVENT_TYPES.join(', ')}`);
  if (!PIPELINE_EVENT_SOURCES.includes(normalized.source)) errors.push(`source must be one of: ${PIPELINE_EVENT_SOURCES.join(', ')}`);
  if (!isPlainObject(event.identity)) errors.push('identity must be an object');
  if (!isPlainObject(event.payload)) errors.push('payload must be an object');
  if (!isNonEmptyString(normalized.ts)) errors.push('ts must be a non-empty string');
}

function validateEventPayload(type: unknown, payload: UnknownRecord, errors: string[]): void {
  const validators: Record<string, (value: unknown) => string[]> = {
    'acp.session.state': validateAcpSessionStateEventPayload,
    'acp.transcript.delta': validateAcpTranscriptDeltaEventPayload,
    'approval.signal': validateApprovalSignalEventPayload,
  };
  const validator = validators[String(type)];
  if (validator) errors.push(...validator(payload).map((error) => `payload.${error}`));
}

function validateRequiredIdentityFields(normalized: UnknownRecord, opts: UnknownRecord, errors: string[]): void {
  const requiredFields = Array.isArray(opts.requiredIdentityFields) ? opts.requiredIdentityFields : [];
  for (const field of requiredFields) {
    if (!PIPELINE_EVENT_IDENTITY_FIELDS.includes(field)) {
      errors.push(`requiredIdentityFields contains unsupported field '${field}'`);
    } else if (!isNonEmptyString(normalized.identity[field])) {
      errors.push(`identity.${field} must be a non-empty string`);
    }
  }
}

export function validatePipelineEvent(event: unknown = {}, opts: UnknownRecord = {}): string[] {
  if (!isPlainObject(event)) return ['event must be an object'];
  const normalized = normalizePipelineEvent(event);
  const errors: string[] = [];
  validateEventEnvelope(event, normalized, errors);
  if (isPlainObject(event.payload)) validateEventPayload(normalized.type, event.payload, errors);
  validateRequiredIdentityFields(normalized, opts, errors);
  return errors;
}

export function isValidPipelineEvent(event: unknown = {}, opts: UnknownRecord = {}): boolean {
  return validatePipelineEvent(event, opts).length === 0;
}

export function assertPipelineEvent(event: unknown = {}, opts: UnknownRecord = {}): UnknownRecord {
  const validationErrors = validatePipelineEvent(event, opts);
  if (validationErrors.length > 0) {
    throw new PipelineEventContractError('Pipeline event contract invalid', {
      validationErrors,
      event,
    });
  }
  return normalizePipelineEvent(event as UnknownRecord);
}

export function identityMatches(eventIdentity: UnknownRecord = {}, expectedIdentity: UnknownRecord = {}): boolean {
  const actual = normalizePipelineEventIdentity(eventIdentity);
  const expected = normalizePipelineEventIdentity(expectedIdentity);
  return Object.entries(expected).every(([field, expectedValue]) => actual[field] === expectedValue);
}

function assertAbortSignal(signal: any): void {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!signal), () => (typeof signal.addEventListener !== 'function'))), () => (typeof signal.removeEventListener !== 'function'))) {
    throw new PipelineEventContractError('Pipeline event waits require an AbortSignal', { option: 'signal' });
  }
}

function assertEventType(type: unknown): void {
  if (!PIPELINE_EVENT_TYPES.includes(type as string)) {
    throw new PipelineEventContractError(`Unknown pipeline event type '${type}'`, { type });
  }
}

function normalizeWaitTypes(types: unknown): any[] {
  const normalized = Array.isArray(types) ? types : [types];
  if (normalized.length === 0) {
    throw new PipelineEventContractError('waitForAny requires at least one event type');
  }
  for (const type of normalized) assertEventType(type);
  return normalized;
}

function getEmitter(eventBus: any): any {
  const emitter = eventBus?._emitter;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!emitter), () => (typeof emitter.on !== 'function'))), () => (typeof emitter.off !== 'function'))) {
    throw new PipelineEventContractError('PipelineEventBus adapter is invalid', { adapter: eventBus });
  }
  return emitter;
}

function buildWaitTimeout(types: any[], identity: UnknownRecord, timeoutMs: unknown): PipelineEventWaitTimeoutError {
  return new PipelineEventWaitTimeoutError(`Timed out waiting for pipeline event: ${types.join(', ')}`, {
    types,
    identity: normalizePipelineEventIdentity(identity),
    timeoutMs,
  });
}

function buildWaitAborted(types: any[], identity: UnknownRecord): PipelineEventWaitAbortedError {
  return new PipelineEventWaitAbortedError(`Aborted waiting for pipeline event: ${types.join(', ')}`, {
    types,
    identity: normalizePipelineEventIdentity(identity),
  });
}

function buildWaitBudgetExhausted(types: any[], identity: UnknownRecord, budget: any): BudgetExhaustedError {
  return new BudgetExhaustedError(`Budget exhausted waiting for pipeline event: ${types.join(', ')}`, {
    deadlineMs: budget?.deadlineMs,
    remainingMs: selectDefinedValue(() => (budget?.remainingMs?.()), () => (NO_REMAINING_BUDGET_MS)),
    reason: 'pipeline_event_wait_budget_exhausted',
  });
}

function callerTimeoutCandidateMs(timeoutMs: unknown): number {
  return selectTruthyValue(() => (timeoutMs === undefined), () => (timeoutMs === null)) ? Infinity : Number(timeoutMs);
}

export function waitForAny(eventBus: any, types: unknown, identity: UnknownRecord = {}, opts: UnknownRecord = {}): Promise<UnknownRecord> {
  const waitTypes = normalizeWaitTypes(types);
  const budget = selectDefinedValue(() => (opts.budget), () => (null));
  const signal = selectDefinedValue(() => (opts.signal), () => (budget?.signal));
  assertAbortSignal(signal);
  const emitter = getEmitter(eventBus);
  const expectedIdentity = normalizePipelineEventIdentity(identity);
  const timeoutMs = opts.timeoutMs;

  if (signal.aborted) return Promise.reject(buildWaitAborted(waitTypes, expectedIdentity));
  try {
    budget?.throwIfExhausted?.();
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise<UnknownRecord>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      emitter.off(PIPELINE_EVENT_CHANNEL, onEvent);
      signal.removeEventListener('abort', onAbort);
      if (timeout) clearTimeout(timeout);
      timeout = null;
    };

    const settle = (fn: (value: any) => void, value: any): void => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    const onAbort = () => settle(reject, buildWaitAborted(waitTypes, expectedIdentity));

    const onEvent = (event: UnknownRecord): void => {
      if (!waitTypes.includes(event?.type)) return;
      if (!identityMatches(selectDefinedValue(() => (event?.identity), () => ({})), expectedIdentity)) return;
      settle(resolve, event);
    };

    signal.addEventListener('abort', onAbort, { once: true });
    emitter.on(PIPELINE_EVENT_CHANNEL, onEvent);

    const budgetRemainingMs = budget?.remainingMs ? budget.remainingMs() : null;
    if (selectTruthyValue(() => (timeoutMs !== undefined && timeoutMs !== null), () => (budgetRemainingMs !== null))) {
      const callerTimeoutMs = callerTimeoutCandidateMs(timeoutMs);
      if (selectTruthyValue(() => (!Number.isFinite(callerTimeoutMs) && callerTimeoutMs !== Infinity), () => (callerTimeoutMs < 0))) {
        settle(reject, new PipelineEventContractError('timeoutMs must be a non-negative number', { timeoutMs }));
        return;
      }
      const normalizedTimeoutMs = waitTimeoutBudgetAuthority(callerTimeoutMs, budgetRemainingMs);
      if (selectTruthyValue(() => (!Number.isFinite(normalizedTimeoutMs)), () => (normalizedTimeoutMs < 0))) {
        settle(reject, new PipelineEventContractError('timeoutMs must be a non-negative number', { timeoutMs }));
        return;
      }
      timeout = setTimeout(() => {
        if (budget && budget.remainingMs() <= 0) {
          settle(reject, buildWaitBudgetExhausted(waitTypes, expectedIdentity, budget));
          return;
        }
        settle(reject, buildWaitTimeout(waitTypes, expectedIdentity, normalizedTimeoutMs));
      }, normalizedTimeoutMs);
    }
  });
}

export function waitForEvent(eventBus: any, type: string, identity: UnknownRecord = {}, opts: UnknownRecord = {}): Promise<UnknownRecord> {
  assertEventType(type);
  return waitForAny(eventBus, [type], identity, opts);
}

export function emitPipelineEvent(eventBus: any, event: UnknownRecord = {}): UnknownRecord {
  const normalized = assertPipelineEvent(event);
  const emitter = getEmitter(eventBus);
  emitter.emit(PIPELINE_EVENT_CHANNEL, normalized);
  return normalized;
}

export function createPipelineEventBus(opts: UnknownRecord = {}): UnknownRecord {
  const emitter = new LocalEventEmitter();
  if (opts.maxListeners !== undefined) emitter.setMaxListeners(opts.maxListeners);

  const bus = {
    _emitter: emitter,
    emit(event: UnknownRecord) {
      return emitPipelineEvent(bus, event);
    },
    waitForEvent(type: string, identity: UnknownRecord = {}, waitOpts: UnknownRecord = {}) {
      return waitForEvent(bus, type, identity, waitOpts);
    },
    waitForAny(types: unknown, identity: UnknownRecord = {}, waitOpts: UnknownRecord = {}) {
      return waitForAny(bus, types, identity, waitOpts);
    },
    listenerCount() {
      return emitter.listenerCount(PIPELINE_EVENT_CHANNEL);
    },
  };

  return bus;
}

export function assertPipelineEventBusAdapter(adapter: any, label = 'PipelineEventBus adapter'): any {
  for (const method of ['emit', 'waitForEvent', 'waitForAny']) {
    if (typeof adapter?.[method] !== 'function') {
      throw new PipelineEventContractError(`${label} must expose ${method}(...)`, { method });
    }
  }
  return adapter;
}
