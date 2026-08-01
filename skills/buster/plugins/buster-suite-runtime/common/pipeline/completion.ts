import { selectDefinedValue, selectTruthyValue } from './optional-absence.js';

const COMPLETION_STATUSES = Object.freeze(['PASS', 'FAIL', 'BLOCKED', 'ERROR']);
const COMPLETION_AUTHORITY_KINDS = Object.freeze([
  'artifact',
  'redis',
  'approval',
  'deterministic_check',
  'lifecycle',
  'worker',
]);

function objectRecord(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function textValue(value: any): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function requiredText(value: any, label: string): string {
  const normalized = textValue(value);
  if (!normalized) throw new Error(`${label}: required non-empty string`);
  return normalized;
}

function positiveAttempt(value: any): number {
  const attempt = Number(value);
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error('completion.attempt: required positive integer');
  return attempt;
}

function normalizedStatus(value: any): string {
  const status = requiredText(value, 'completion.status').toUpperCase();
  if (!COMPLETION_STATUSES.includes(status)) {
    throw new Error(`completion.status: unsupported status ${status}`);
  }
  return status;
}

function normalizedAuthority(authority: any) {
  const record = objectRecord(authority);
  if (!record) throw new Error('completion.authority: required object');
  const kind = requiredText(record.kind, 'completion.authority.kind');
  if (!COMPLETION_AUTHORITY_KINDS.includes(kind)) {
    throw new Error(`completion.authority.kind: unsupported kind ${kind}`);
  }
  return {
    ...record,
    kind,
  };
}

function optionalObject(value: any) {
  return selectDefinedValue(() => (objectRecord(value)), () => (null));
}

export function assertCompletion(completion: any) {
  const record = objectRecord(completion);
  if (!record) throw new Error('completion: required object');

  return {
    ...record,
    target_kind: requiredText(record.target_kind, 'completion.target_kind'),
    target_id: requiredText(record.target_id, 'completion.target_id'),
    phase: requiredText(record.phase, 'completion.phase'),
    attempt: positiveAttempt(record.attempt),
    status: normalizedStatus(record.status),
    authority: normalizedAuthority(record.authority),
    reason_code: selectDefinedValue(() => (textValue(record.reason_code)), () => (null)),
    summary: selectDefinedValue(() => (textValue(record.summary)), () => (null)),
    occurred_at: selectDefinedValue(() => (textValue(record.occurred_at)), () => (null)),
    observed: optionalObject(record.observed),
    metadata: optionalObject(record.metadata),
  };
}

export function isTerminalCompletionStatus(status: any): boolean {
  const value = selectTruthyValue(() => (status), () => (''));
  return COMPLETION_STATUSES.includes(String(value).toUpperCase());
}

export const COMPLETION_STATUS_VALUES = COMPLETION_STATUSES;
export const COMPLETION_AUTHORITY_KIND_VALUES = COMPLETION_AUTHORITY_KINDS;
