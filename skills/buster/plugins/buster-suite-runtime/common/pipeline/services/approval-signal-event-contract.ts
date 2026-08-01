type UnknownRecord = Record<string, unknown>;

const STATUSES = Object.freeze(['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'TIMED_OUT', 'CANCELLED']);
const KINDS = Object.freeze(['pending_update', 'approve', 'reject', 'cancel', 'timeout_continue', 'timeout_block']);
const TIMEOUT_POLICIES = Object.freeze(['BLOCK', 'CONTINUE']);
const FIELDS = new Set([
  'gate_id', 'gate_type', 'run_id', 'project', 'wait_ref', 'status', 'signal_kind',
  'requested_at', 'deadline', 'timeout_minutes', 'timeout_policy', 'resolved_at',
  'decision_by', 'decision_via', 'continued', 'reason', 'state_path', 'updated_at',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nullableString(value: unknown): boolean {
  return value === null || nonEmptyString(value);
}

function validateTimestamp(value: unknown, field: string, errors: string[]): void {
  if (!nullableString(value)) errors.push(`${field} must be null or a non-empty string`);
}

function validateIdentity(payload: UnknownRecord, errors: string[]): void {
  if (!nonEmptyString(payload.gate_id)) errors.push('gate_id must be a non-empty string');
  if (payload.gate_type !== 'approval') errors.push("gate_type must be 'approval'");
  for (const field of ['run_id', 'project', 'wait_ref']) {
    if (!nullableString(payload[field])) errors.push(`${field} must be null or a non-empty string`);
  }
}

function validateDecision(payload: UnknownRecord, errors: string[]): void {
  for (const field of ['decision_by', 'decision_via', 'reason']) {
    if (!nullableString(payload[field])) errors.push(`${field} must be null or a non-empty string`);
  }
  if (payload.continued !== null && typeof payload.continued !== 'boolean') {
    errors.push('continued must be null or a boolean');
  }
}

function validateEnums(payload: UnknownRecord, errors: string[]): void {
  if (!STATUSES.includes(payload.status as string)) errors.push(`status must be one of: ${STATUSES.join(', ')}`);
  if (!KINDS.includes(payload.signal_kind as string)) errors.push(`signal_kind must be one of: ${KINDS.join(', ')}`);
  if (!TIMEOUT_POLICIES.includes(payload.timeout_policy as string)) {
    errors.push(`timeout_policy must be one of: ${TIMEOUT_POLICIES.join(', ')}`);
  }
}

export function validateApprovalSignalEventPayload(payload: unknown = {}): string[] {
  if (!isRecord(payload)) return ['payload must be an object'];
  const errors: string[] = [];
  for (const field of Object.keys(payload)) {
    if (!FIELDS.has(field)) errors.push(`${field} is not allowed`);
  }
  validateIdentity(payload, errors);
  validateEnums(payload, errors);
  validateTimestamp(payload.requested_at, 'requested_at', errors);
  validateTimestamp(payload.deadline, 'deadline', errors);
  validateTimestamp(payload.resolved_at, 'resolved_at', errors);
  validateTimestamp(payload.updated_at, 'updated_at', errors);
  if (payload.timeout_minutes !== null && !Number.isFinite(payload.timeout_minutes)) {
    errors.push('timeout_minutes must be null or a non-negative number');
  } else if (payload.timeout_minutes !== null && Number(payload.timeout_minutes) < 0) {
    errors.push('timeout_minutes must be null or a non-negative number');
  }
  validateDecision(payload, errors);
  if (!nonEmptyString(payload.state_path)) errors.push('state_path must be a non-empty string');
  return errors;
}
