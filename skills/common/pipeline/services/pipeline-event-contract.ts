// Shared in-process pipeline event contract.
// Edge adapters emit normalized events; orchestration waits on this contract
// instead of owning transport-specific polling loops.

type UnknownRecord = Record<string, any>;

class LocalEventEmitter {
  #listeners = new Map<string, Set<(value: unknown) => void>>();

  setMaxListeners(_maxListeners: number): void {}

  on(channel: string, listener: (value: unknown) => void): void {
    const listeners = this.#listeners.get(channel) || new Set();
    listeners.add(listener);
    this.#listeners.set(channel, listeners);
  }

  off(channel: string, listener: (value: unknown) => void): void {
    this.#listeners.get(channel)?.delete(listener);
  }

  emit(channel: string, value: unknown): void {
    for (const listener of [...(this.#listeners.get(channel) || [])]) listener(value);
  }

  listenerCount(channel: string): number {
    return this.#listeners.get(channel)?.size || 0;
  }
}

import { BudgetExhaustedError } from '../timing.ts';
import {
  validateAcpSessionStateEventPayload,
  validateAcpTranscriptDeltaEventPayload,
} from './acp-gateway-contract.ts';

export const PIPELINE_EVENT_SCHEMA_VERSION = 'v1';

export const PIPELINE_EVENT_TYPES = Object.freeze([
  'completion.evidence',
  'local.evidence.updated',
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

export class PipelineEventContractError extends Error {
  code: string;
  diagnostics: UnknownRecord;

  constructor(message: string, diagnostics: UnknownRecord = {}) {
    super(message);
    this.name = 'PipelineEventContractError';
    this.code = 'PIPELINE_EVENT_CONTRACT_INVALID';
    this.diagnostics = diagnostics;
  }
}

export class PipelineEventWaitTimeoutError extends Error {
  code: string;
  diagnostics: UnknownRecord;

  constructor(message: string, diagnostics: UnknownRecord = {}) {
    super(message);
    this.name = 'PipelineEventWaitTimeoutError';
    this.code = 'PIPELINE_EVENT_WAIT_TIMEOUT';
    this.diagnostics = diagnostics;
  }
}

export class PipelineEventWaitAbortedError extends Error {
  code: string;
  diagnostics: UnknownRecord;

  constructor(message: string, diagnostics: UnknownRecord = {}) {
    super(message);
    this.name = 'PipelineEventWaitAbortedError';
    this.code = 'PIPELINE_EVENT_WAIT_ABORTED';
    this.diagnostics = diagnostics;
  }
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNullableString(value: unknown): boolean {
  return value === null || isNonEmptyString(value);
}

const APPROVAL_SIGNAL_STATUSES = Object.freeze([
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'TIMED_OUT',
  'CANCELLED',
]);

const APPROVAL_SIGNAL_KINDS = Object.freeze([
  'pending_update',
  'approve',
  'reject',
  'cancel',
  'timeout_continue',
  'timeout_block',
]);

const APPROVAL_SIGNAL_TIMEOUT_POLICIES = Object.freeze(['BLOCK', 'CONTINUE']);

const APPROVAL_SIGNAL_PAYLOAD_FIELDS = Object.freeze([
  'gate_id',
  'gate_type',
  'run_id',
  'project',
  'wait_ref',
  'status',
  'signal_kind',
  'requested_at',
  'deadline',
  'timeout_minutes',
  'timeout_policy',
  'resolved_at',
  'decision_by',
  'decision_via',
  'continued',
  'reason',
  'state_path',
  'updated_at',
]);

function validateNullableTimestamp(value: unknown, field: string, errors: string[]): void {
  if (value === null) return;
  if (!isNonEmptyString(value)) {
    errors.push(`${field} must be null or a non-empty string`);
  }
}

export function validateApprovalSignalEventPayload(payload: unknown = {}): string[] {
  const errors = [];
  if (!isPlainObject(payload)) return ['payload must be an object'];

  for (const field of Object.keys(payload)) {
    if (!APPROVAL_SIGNAL_PAYLOAD_FIELDS.includes(field)) errors.push(`${field} is not allowed`);
  }

  if (!isNonEmptyString(payload.gate_id)) errors.push('gate_id must be a non-empty string');
  if (payload.gate_type !== 'approval') errors.push("gate_type must be 'approval'");
  if (!isNullableString(payload.run_id)) errors.push('run_id must be null or a non-empty string');
  if (!isNullableString(payload.project)) errors.push('project must be null or a non-empty string');
  if (!isNullableString(payload.wait_ref)) errors.push('wait_ref must be null or a non-empty string');
  if (!APPROVAL_SIGNAL_STATUSES.includes(payload.status)) {
    errors.push(`status must be one of: ${APPROVAL_SIGNAL_STATUSES.join(', ')}`);
  }
  if (!APPROVAL_SIGNAL_KINDS.includes(payload.signal_kind)) {
    errors.push(`signal_kind must be one of: ${APPROVAL_SIGNAL_KINDS.join(', ')}`);
  }
  validateNullableTimestamp(payload.requested_at, 'requested_at', errors);
  validateNullableTimestamp(payload.deadline, 'deadline', errors);
  if (payload.timeout_minutes !== null && (!Number.isFinite(payload.timeout_minutes) || payload.timeout_minutes < 0)) {
    errors.push('timeout_minutes must be null or a non-negative number');
  }
  if (!APPROVAL_SIGNAL_TIMEOUT_POLICIES.includes(payload.timeout_policy)) {
    errors.push(`timeout_policy must be one of: ${APPROVAL_SIGNAL_TIMEOUT_POLICIES.join(', ')}`);
  }
  validateNullableTimestamp(payload.resolved_at, 'resolved_at', errors);
  if (!isNullableString(payload.decision_by)) errors.push('decision_by must be null or a non-empty string');
  if (!isNullableString(payload.decision_via)) errors.push('decision_via must be null or a non-empty string');
  if (payload.continued !== null && typeof payload.continued !== 'boolean') {
    errors.push('continued must be null or a boolean');
  }
  if (!isNullableString(payload.reason)) errors.push('reason must be null or a non-empty string');
  if (!isNonEmptyString(payload.state_path)) errors.push('state_path must be a non-empty string');
  validateNullableTimestamp(payload.updated_at, 'updated_at', errors);

  return errors;
}

function normalizeValue(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizeIdentityAliases(identity: UnknownRecord = {}): UnknownRecord {
  return {
    module_id: identity.module_id ?? identity.moduleId ?? identity.module,
    gate_id: identity.gate_id ?? identity.gateId,
    run_id: identity.run_id ?? identity.runId,
    attempt: identity.attempt,
    dispatch_id: identity.dispatch_id ?? identity.dispatchId,
    session_key: identity.session_key ?? identity.sessionKey,
    gateway_label: identity.gateway_label ?? identity.gatewayLabel,
  };
}

export function normalizePipelineEventIdentity(identity: UnknownRecord = {}): UnknownRecord {
  const aliases = normalizeIdentityAliases(identity || {});
  return Object.fromEntries(
    PIPELINE_EVENT_IDENTITY_FIELDS
      .map((field) => [field, normalizeValue(aliases[field])])
      .filter(([, value]) => value !== null),
  );
}

export function normalizePipelineEvent(event: UnknownRecord = {}): UnknownRecord {
  const identity = normalizePipelineEventIdentity(event.identity || event);
  return {
    schema_version: normalizeValue(event.schema_version ?? event.schemaVersion) || PIPELINE_EVENT_SCHEMA_VERSION,
    type: normalizeValue(event.type),
    source: normalizeValue(event.source),
    identity,
    payload: isPlainObject(event.payload) ? event.payload : {},
    ts: normalizeValue(event.ts ?? event.timestamp) || new Date().toISOString(),
  };
}

export function validatePipelineEvent(event: unknown = {}, opts: UnknownRecord = {}): string[] {
  const errors = [];
  if (!isPlainObject(event)) return ['event must be an object'];

  const normalized = normalizePipelineEvent(event);
  if (normalized.schema_version !== PIPELINE_EVENT_SCHEMA_VERSION) {
    errors.push(`schema_version must be '${PIPELINE_EVENT_SCHEMA_VERSION}'`);
  }
  if (!PIPELINE_EVENT_TYPES.includes(normalized.type)) {
    errors.push(`type must be one of: ${PIPELINE_EVENT_TYPES.join(', ')}`);
  }
  if (!PIPELINE_EVENT_SOURCES.includes(normalized.source)) {
    errors.push(`source must be one of: ${PIPELINE_EVENT_SOURCES.join(', ')}`);
  }
  if (!isPlainObject(event.identity)) errors.push('identity must be an object');
  if (!isPlainObject(event.payload)) errors.push('payload must be an object');
  if (!isNonEmptyString(normalized.ts)) errors.push('ts must be a non-empty string');

  if (isPlainObject(event.payload)) {
    if (normalized.type === 'acp.session.state') {
      errors.push(...validateAcpSessionStateEventPayload(event.payload).map((error) => `payload.${error}`));
    } else if (normalized.type === 'acp.transcript.delta') {
      errors.push(...validateAcpTranscriptDeltaEventPayload(event.payload).map((error) => `payload.${error}`));
    } else if (normalized.type === 'approval.signal') {
      errors.push(...validateApprovalSignalEventPayload(event.payload).map((error) => `payload.${error}`));
    }
  }

  const requiredIdentityFields = Array.isArray(opts.requiredIdentityFields)
    ? opts.requiredIdentityFields
    : [];
  for (const field of requiredIdentityFields) {
    if (!PIPELINE_EVENT_IDENTITY_FIELDS.includes(field)) {
      errors.push(`requiredIdentityFields contains unknown field '${field}'`);
    } else if (!isNonEmptyString(normalized.identity[field])) {
      errors.push(`identity.${field} must be a non-empty string`);
    }
  }

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
  if (!signal || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') {
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
  if (!emitter || typeof emitter.on !== 'function' || typeof emitter.off !== 'function') {
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
    remainingMs: budget?.remainingMs?.() ?? 0,
    reason: 'pipeline_event_wait_budget_exhausted',
  });
}

export function waitForAny(eventBus: any, types: unknown, identity: UnknownRecord = {}, opts: UnknownRecord = {}): Promise<UnknownRecord> {
  const waitTypes = normalizeWaitTypes(types);
  const budget = opts.budget || null;
  const signal = opts.signal || budget?.signal;
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
      if (!identityMatches(event?.identity || {}, expectedIdentity)) return;
      settle(resolve, event);
    };

    signal.addEventListener('abort', onAbort, { once: true });
    emitter.on(PIPELINE_EVENT_CHANNEL, onEvent);

    const budgetRemainingMs = budget?.remainingMs ? budget.remainingMs() : null;
    if (timeoutMs !== undefined && timeoutMs !== null || budgetRemainingMs !== null) {
      const callerTimeoutMs = timeoutMs === undefined || timeoutMs === null ? Infinity : Number(timeoutMs);
      if (!Number.isFinite(callerTimeoutMs) && callerTimeoutMs !== Infinity || callerTimeoutMs < 0) {
        settle(reject, new PipelineEventContractError('timeoutMs must be a non-negative number', { timeoutMs }));
        return;
      }
      const normalizedTimeoutMs = Math.min(callerTimeoutMs, budgetRemainingMs ?? Infinity);
      if (!Number.isFinite(normalizedTimeoutMs) || normalizedTimeoutMs < 0) {
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
