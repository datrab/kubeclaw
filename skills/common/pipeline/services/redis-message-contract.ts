import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import {
  isNonEmptyText as isNonEmptyString,
  isValueRecord as isPlainObject,
  normalizeOptionalString as normalizeValue,
} from '../value-boundary.ts';
export const REDIS_PIPELINE_MESSAGE_SCHEMA_VERSION = 'v1';

export const REDIS_PIPELINE_TARGET_KINDS: readonly string[] = Object.freeze(['module', 'gate', 'pipeline']);
export const REDIS_PIPELINE_STREAM_ROLES: readonly string[] = Object.freeze(['task', 'completion']);
export const REDIS_TASK_TYPES: readonly string[] = Object.freeze(['module_test', 'gate_test']);
export const REDIS_COMPLETION_STATUSES: readonly string[] = Object.freeze(['PASS', 'FAIL', 'BLOCKED', 'RATE_LIMITED', 'ISSUES_FOUND']);
export const REDIS_COMPLETION_OUTCOMES: readonly string[] = Object.freeze([
  'PASS',
  'FAIL',
  'BLOCKED',
  'ISSUES_FOUND',
  'TIMEOUT',
  'RATE_LIMITED',
  'COMPLETION_CONFLICT',
  'COMPLETION_INVALID',
]);
export const REDIS_COMPLETION_SOURCES: readonly string[] = Object.freeze([
  'buster-pipeline',
  'buster-pipeline-task-queue',
  'completion-conflict',
  'completion-invalid',
  'agent',
]);

const STRONG_REDIS_IDENTITY_FIELDS: readonly string[] = Object.freeze(['run_id', 'attempt', 'dispatch_id']);
const REDIS_STREAM_ID_PATTERN = /^\d+-\d+$/;
const REDIS_COMPLETION_STREAM_ROLE = 'completion';
const REDIS_TASK_STREAM_ROLE = 'task';

type UnknownRecord = Record<string, any>;

function normalizeUpper(value: unknown): string | null {
  const normalized = normalizeValue(value);
  return normalized === null ? null : normalized.toUpperCase();
}

function hasValue(entry: UnknownRecord = {}, field: string): boolean {
  return normalizeValue(entry?.[field]) !== null;
}

function parseJsonObject(value: unknown, fieldName: string, errors: string[]): UnknownRecord | null {
  if (isPlainObject(value)) return value;
  if (!isNonEmptyString(value)) {
    errors.push(`${fieldName} must be a JSON object`);
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (isPlainObject(parsed)) return parsed;
    errors.push(`${fieldName} must be a JSON object`);
    return null;
  } catch (_error) {
    errors.push(`${fieldName} must be valid JSON`);
    return null;
  }
}

export function inferRedisPipelineTargetKind(entry: UnknownRecord = {}): string | null {
  const explicit = normalizeValue(entry.target_kind);
  if (explicit) return explicit;
  const targetId = normalizeValue(selectDefinedValue(() => (selectDefinedValue(() => (entry.target_id), () => (entry.module_id))), () => (entry.gate_id)));
  if (!targetId) return null;
  if (selectTruthyValue(() => (entry.gate_id != null), () => (String(targetId).startsWith('gate:')))) return 'gate';
  return 'module';
}

export function inferRedisTaskTarget(payload: UnknownRecord = {}, taskType: unknown = payload?.task_type): UnknownRecord {
  const normalizedType = normalizeValue(taskType);
  const gateId = normalizeValue(payload?.gate_id);
  const moduleId = normalizeValue(payload?.module_id);
  if (normalizedType === 'gate_test') {
    const targetId = selectDefinedValue(() => (gateId), () => (moduleId));
    return { target_kind: 'gate', target_id: targetId, module: moduleId, gate_id: targetId };
  }
  const targetId = selectDefinedValue(() => (moduleId), () => (gateId));
  return { target_kind: 'module', target_id: targetId, module: targetId, gate_id: gateId };
}

function normalizeTaskBuildInput(input: UnknownRecord): UnknownRecord {
  return {
    type: input.type ?? null,
    sender: input.sender ?? null,
    source: input.source === undefined ? input.sender ?? null : input.source,
    payload: input.payload ?? {},
    iteration: input.iteration ?? 1,
    timestamp: input.timestamp ?? Date.now(),
  };
}

export function buildRedisTaskStreamEntry(input: UnknownRecord = {}): UnknownRecord {
  const { type, sender, source, payload, iteration, timestamp } = normalizeTaskBuildInput(input);
  const normalizedPayload = isPlainObject(payload) ? payload : {};
  const serializedPayload = typeof payload === 'string' ? payload : JSON.stringify(normalizedPayload);
  const normalizedType = normalizeValue(type);
  const target = inferRedisTaskTarget(normalizedPayload, normalizedType);
  return {
    schema_version: REDIS_PIPELINE_MESSAGE_SCHEMA_VERSION,
    type: normalizedType,
    stream_role: REDIS_TASK_STREAM_ROLE,
    project: normalizeValue(normalizedPayload?.project),
    run_id: normalizeValue(normalizedPayload?.run_id),
    target_kind: target.target_kind,
    target_id: target.target_id,
    module: target.module,
    gate_id: target.gate_id,
    gate_type: normalizeValue(normalizedPayload?.gate_type),
    attempt: normalizeValue(normalizedPayload?.attempt),
    dispatch_id: normalizeValue(normalizedPayload?.dispatch_id),
    session_key: normalizeValue(normalizedPayload?.session_key),
    source: normalizeValue(source),
    sender: normalizeValue(sender),
    payload: serializedPayload,
    iteration: normalizeValue(iteration),
    timestamp: normalizeValue(timestamp),
  };
}

function validateEnvelopeHeader(entry: UnknownRecord, envelope: UnknownRecord, opts: UnknownRecord, errors: string[]): void {
  if (opts.requireStreamId && !REDIS_STREAM_ID_PATTERN.test(String(entry._id ?? ''))) errors.push('_id must be a Redis stream id');
  if (opts.requireCanonicalEnvelope && envelope.schema_version !== REDIS_PIPELINE_MESSAGE_SCHEMA_VERSION) {
    errors.push(`schema_version must be '${REDIS_PIPELINE_MESSAGE_SCHEMA_VERSION}'`);
  }
  if (opts.expectedType && envelope.type !== opts.expectedType) errors.push(`type must be '${opts.expectedType}'`);
  else if (!isNonEmptyString(envelope.type)) errors.push('type must be a non-empty string');
}

function validateEnvelopeRouting(envelope: UnknownRecord, opts: UnknownRecord, errors: string[]): void {
  const expectedRole = opts.expectedStreamRole;
  if (expectedRole && envelope.stream_role !== expectedRole) errors.push(`stream_role must be '${expectedRole}'`);
  else if (opts.requireCanonicalEnvelope && !REDIS_PIPELINE_STREAM_ROLES.includes(envelope.stream_role)) {
    errors.push(`stream_role must be one of: ${REDIS_PIPELINE_STREAM_ROLES.join(', ')}`);
  }
  if (opts.requireCanonicalEnvelope && !isNonEmptyString(envelope.project)) errors.push('project must be a non-empty string');
  if (!REDIS_PIPELINE_TARGET_KINDS.includes(envelope.target_kind)) errors.push(`target_kind must be one of: ${REDIS_PIPELINE_TARGET_KINDS.join(', ')}`);
  if (!isNonEmptyString(envelope.target_id)) errors.push('target_id must be a non-empty string');
  if (!isNonEmptyString(envelope.source)) errors.push('source must be a non-empty string');
  if (opts.requireCanonicalEnvelope && !isNonEmptyString(envelope.timestamp)) errors.push('timestamp must be a non-empty string');
}

function validateStrongIdentity(envelope: UnknownRecord, required: boolean, errors: string[]): void {
  if (!required) return;
  for (const field of STRONG_REDIS_IDENTITY_FIELDS) {
    if (!hasValue(envelope, field)) errors.push(`${field} must be a non-empty string`);
  }
}

export function normalizeRedisPipelineEnvelope(entry: UnknownRecord = {}): UnknownRecord {
  const targetKind = inferRedisPipelineTargetKind(entry);
  const targetId = normalizeValue(selectDefinedValue(() => (selectDefinedValue(() => (entry.target_id), () => (entry.module_id))), () => (entry.gate_id)));
  const timestamp = normalizeValue(selectDefinedValue(() => (entry.timestamp), () => (entry.ts)));
  return {
    schema_version: selectTruthyValue(() => (normalizeValue(entry.schema_version)), () => (null)),
    type: normalizeValue(entry.type),
    stream_role: selectTruthyValue(() => (normalizeValue(entry.stream_role)), () => (null)),
    project: selectTruthyValue(() => (normalizeValue(entry.project)), () => (null)),
    run_id: normalizeValue(entry.run_id),
    target_kind: targetKind,
    target_id: targetId,
    module: normalizeValue(entry.module),
    gate_id: normalizeValue(entry.gate_id),
    gate_type: normalizeValue(entry.gate_type),
    attempt: normalizeValue(entry.attempt),
    dispatch_id: normalizeValue(entry.dispatch_id),
    session_key: normalizeValue(entry.session_key),
    source: normalizeValue(entry.source),
    timestamp,
  };
}

export function validateRedisPipelineEnvelope(entry: unknown = {}, {
  expectedType = null,
  expectedStreamRole = null,
  requireCanonicalEnvelope = false,
  requireStrongIdentity = true,
  requireStreamId = true,
}: UnknownRecord = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(entry)) return ['entry must be an object'];

  const envelope = normalizeRedisPipelineEnvelope(entry);
  const options = { expectedType, expectedStreamRole, requireCanonicalEnvelope, requireStrongIdentity, requireStreamId };
  validateEnvelopeHeader(entry, envelope, options, errors);
  validateEnvelopeRouting(envelope, options, errors);
  validateStrongIdentity(envelope, requireStrongIdentity, errors);

  return errors;
}

function validateTaskIdentity(entry: UnknownRecord, taskType: string | null, errors: string[]): void {
  if (!REDIS_TASK_TYPES.includes(taskType ?? '')) errors.push(`type must be one of: ${REDIS_TASK_TYPES.join(', ')}`);
  const envelope = normalizeRedisPipelineEnvelope(entry);
  if (taskType === 'module_test' && envelope.target_kind !== 'module') errors.push("target_kind must be 'module' for module_test");
  if (taskType === 'gate_test' && envelope.target_kind !== 'gate') errors.push("target_kind must be 'gate' for gate_test");
  if (!isNonEmptyString(entry.sender)) errors.push('sender must be a non-empty string');
  if (entry.iteration != null && !/^\d+$/.test(String(entry.iteration))) errors.push('iteration must be a numeric string when present');
}

function validateTaskPayload(entry: UnknownRecord, taskType: string | null, errors: string[]): void {
  const payload = parseJsonObject(entry.payload, 'payload', errors);
  if (!payload) return;
  const payloadTaskType = normalizeValue(payload.task_type);
  if (payloadTaskType && taskType && payloadTaskType !== taskType) errors.push('payload.task_type must match entry type');
}

export function validateRedisTaskEntry(entry: unknown = {}, opts: UnknownRecord = {}): string[] {
  const errors = validateRedisPipelineEnvelope(entry, {
    expectedStreamRole: selectDefinedValue(() => (opts.expectedStreamRole), () => (REDIS_TASK_STREAM_ROLE)),
    requireCanonicalEnvelope: opts.requireCanonicalEnvelope !== false,
    requireStrongIdentity: opts.requireStrongIdentity !== false,
    requireStreamId: opts.requireStreamId !== false,
  });
  if (!isPlainObject(entry)) return errors;

  const taskType = normalizeValue(entry.type);
  validateTaskIdentity(entry, taskType, errors);
  validateTaskPayload(entry, taskType, errors);

  return errors;
}

function validateCompletionClassification(entry: UnknownRecord, errors: string[]): void {
  const status = normalizeUpper(entry.status);
  const outcome = normalizeUpper(entry.outcome);
  const source = normalizeValue(entry.source);
  if (!REDIS_COMPLETION_STATUSES.includes(status ?? '')) errors.push(`status must be one of: ${REDIS_COMPLETION_STATUSES.join(', ')}`);
  if (outcome && !REDIS_COMPLETION_OUTCOMES.includes(outcome)) errors.push(`outcome must be one of: ${REDIS_COMPLETION_OUTCOMES.join(', ')}`);
  if (source && !REDIS_COMPLETION_SOURCES.includes(source)) errors.push(`source must be one of: ${REDIS_COMPLETION_SOURCES.join(', ')}`);
}

function validateCompletionDetails(entry: UnknownRecord, errors: string[]): void {
  for (const field of ['summary', 'reason', 'commit_hash', 'session_key', 'gate_type', 'gateway_label']) {
    if (entry[field] != null && typeof entry[field] !== 'string') errors.push(`${field} must be a string when present`);
  }
  if (entry.verdict != null) {
    if (typeof entry.verdict !== 'string') errors.push('verdict must be a JSON string when present');
    else try { JSON.parse(entry.verdict); } catch (_error) { errors.push('verdict must be valid JSON'); }
  }
  if (entry.max_rate_limit_pauses != null && !/^\d+$/.test(String(entry.max_rate_limit_pauses))) {
    errors.push('max_rate_limit_pauses must be a numeric string when present');
  }
}

export function validateRedisCompletionEntry(entry: unknown = {}, opts: UnknownRecord = {}): string[] {
  const errors = validateRedisPipelineEnvelope(entry, {
    expectedType: 'completion',
    expectedStreamRole: selectDefinedValue(() => (opts.expectedStreamRole), () => (REDIS_COMPLETION_STREAM_ROLE)),
    requireCanonicalEnvelope: opts.requireCanonicalEnvelope !== false,
    requireStrongIdentity: opts.requireStrongIdentity !== false,
    requireStreamId: opts.requireStreamId !== false,
  });
  if (!isPlainObject(entry)) return errors;

  validateCompletionClassification(entry, errors);
  validateCompletionDetails(entry, errors);

  return errors;
}

export function isValidRedisTaskEntry(entry: unknown = {}, opts: UnknownRecord = {}): boolean {
  return validateRedisTaskEntry(entry, opts).length === 0;
}

export function isValidRedisCompletionEntry(entry: unknown = {}, opts: UnknownRecord = {}): boolean {
  return validateRedisCompletionEntry(entry, opts).length === 0;
}

export class RedisPipelineMessageInvalidError extends Error {
  code: string;
  diagnostics: UnknownRecord;
  validationErrors: string[];

  constructor(message: string, diagnostics: UnknownRecord = {}) {
    super(message);
    this.name = 'RedisPipelineMessageInvalidError';
    this.code = 'REDIS_PIPELINE_MESSAGE_INVALID';
    this.diagnostics = diagnostics;
    this.validationErrors = Array.isArray(diagnostics.validationErrors) ? diagnostics.validationErrors : [];
  }
}

export function assertRedisTaskEntry(entry: unknown = {}, opts: UnknownRecord = {}): unknown {
  const validationErrors = validateRedisTaskEntry(entry, opts);
  if (validationErrors.length > 0) {
    throw new RedisPipelineMessageInvalidError(`Invalid Redis task entry: ${validationErrors.join('; ')}`, {
      entry,
      validationErrors,
    });
  }
  return entry;
}

export function assertRedisCompletionEntry(entry: unknown = {}, opts: UnknownRecord = {}): unknown {
  const validationErrors = validateRedisCompletionEntry(entry, opts);
  if (validationErrors.length > 0) {
    throw new RedisPipelineMessageInvalidError(`Invalid Redis completion entry: ${validationErrors.join('; ')}`, {
      entry,
      validationErrors,
    });
  }
  return entry;
}
