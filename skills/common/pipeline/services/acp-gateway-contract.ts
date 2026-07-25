import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type UnknownRecord = Record<string, any>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringOrNull(value: unknown): boolean {
  return selectTruthyValue(() => (value === null), () => (typeof value === 'string'));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonNegativeIntegerOrNull(value: unknown): boolean {
  return selectTruthyValue(() => (value === null), () => (isNonNegativeInteger(value)));
}

function pushExactKeysErrors(errors: string[], value: UnknownRecord, allowedKeys: string[], label: string): void {
  const prefix = label ? `${label}.` : '';
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) errors.push(`${prefix}${key} is not allowed`);
  }
}

function pushTypeError(errors: string[], value: unknown, path: string, expected: (value: unknown) => boolean): void {
  if (expected(value)) return;
  errors.push(`${path} is invalid`);
}

function assertNoErrors(errors: string[], label: string): void {
  if (errors.length > 0) {
    throw new TypeError(`${label} failed ACP/gateway contract validation: ${errors.join('; ')}`);
  }
}

function normalizeGatewayRawValue(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function validateAcpTranscriptState(state: unknown = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(state)) return ['transcript state must be an object'];

  pushExactKeysErrors(errors, state, [
    'offset',
    'byteOffset',
    'eventCount',
    'lastEventTs',
    'lastActivityPoll',
    'hardError',
    'rateLimited',
    'terminal',
    'lastDetail',
    'partialLine',
    'newLines',
  ], 'transcript');

  for (const field of ['offset', 'byteOffset', 'eventCount', 'lastActivityPoll']) {
    pushTypeError(errors, state[field], field, isNonNegativeInteger);
  }
  for (const field of ['hardError', 'rateLimited', 'terminal']) {
    pushTypeError(errors, state[field], field, (value: unknown) => typeof value === 'boolean');
  }
  pushTypeError(errors, state.lastEventTs, 'lastEventTs', isStringOrNull);
  pushTypeError(errors, state.lastDetail, 'lastDetail', (value: unknown) => typeof value === 'string');
  pushTypeError(errors, state.partialLine, 'partialLine', (value: unknown) => typeof value === 'string');
  if (!Array.isArray(state.newLines) || !state.newLines.every((line: unknown) => typeof line === 'string')) {
    errors.push('newLines must be an array of strings');
  }

  return errors;
}

export function assertValidAcpTranscriptState(state: unknown, label = 'ACP transcript state'): unknown {
  assertNoErrors(validateAcpTranscriptState(state), label);
  return state;
}

export function validateAcpMonitorState(state: unknown = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(state)) return ['monitor state must be an object'];

  pushExactKeysErrors(errors, state, [
    'sessionKey',
    'sessionState',
    'sessionActive',
    'transcript',
    'unknownPolls',
    'transcriptStalePolls',
    'gatewayUnreachable',
    'gatewayDetail',
    'terminal',
    'rateLimited',
    'reason',
    'detail',
    'lastDetail',
    'lastSummary',
    'failed',
    'sessionTerminal',
    'stopped',
  ], 'monitor');

  pushTypeError(errors, state.sessionKey, 'sessionKey', isStringOrNull);
  pushTypeError(errors, state.sessionState, 'sessionState', isNonEmptyString);
  pushTypeError(errors, state.sessionActive, 'sessionActive', (value: unknown) => typeof value === 'boolean');
  pushTypeError(errors, state.unknownPolls, 'unknownPolls', isNonNegativeInteger);
  pushTypeError(errors, state.transcriptStalePolls, 'transcriptStalePolls', isNonNegativeInteger);
  pushTypeError(errors, state.gatewayUnreachable, 'gatewayUnreachable', (value: unknown) => typeof value === 'boolean');
  pushTypeError(errors, state.gatewayDetail, 'gatewayDetail', isStringOrNull);
  pushTypeError(errors, state.terminal, 'terminal', (value: unknown) => typeof value === 'boolean');
  pushTypeError(errors, state.rateLimited, 'rateLimited', (value: unknown) => typeof value === 'boolean');
  pushTypeError(errors, state.reason, 'reason', isStringOrNull);
  pushTypeError(errors, state.detail, 'detail', (value: unknown) => typeof value === 'string');
  pushTypeError(errors, state.lastDetail, 'lastDetail', (value: unknown) => typeof value === 'string');
  pushTypeError(errors, state.lastSummary, 'lastSummary', (value: unknown) => typeof value === 'string');
  pushTypeError(errors, state.failed, 'failed', (value: unknown) => typeof value === 'boolean');
  pushTypeError(errors, state.sessionTerminal, 'sessionTerminal', (value: unknown) => typeof value === 'boolean');
  pushTypeError(errors, state.stopped, 'stopped', (value: unknown) => typeof value === 'boolean');

  errors.push(...validateAcpTranscriptState(state.transcript).map((error) => `transcript.${error}`));
  return errors;
}

export function assertValidAcpMonitorState(state: unknown, label = 'ACP monitor state'): unknown {
  assertNoErrors(validateAcpMonitorState(state), label);
  return state;
}

export function validateAcpSessionStateEventPayload(payload: unknown = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(payload)) return ['session state payload must be an object'];

  pushExactKeysErrors(errors, payload, [
    'session_key',
    'session_state',
    'session_active',
    'gateway_unreachable',
    'gateway_detail',
    'terminal',
    'rate_limited',
    'reason',
    'detail',
    'monitor_state',
  ], '');

  pushTypeError(errors, payload.session_key, 'session_key', isStringOrNull);
  pushTypeError(errors, payload.session_state, 'session_state', isNonEmptyString);
  pushTypeError(errors, payload.session_active, 'session_active', (value: unknown) => typeof value === 'boolean');
  pushTypeError(errors, payload.gateway_unreachable, 'gateway_unreachable', (value: unknown) => typeof value === 'boolean');
  pushTypeError(errors, payload.gateway_detail, 'gateway_detail', isStringOrNull);
  pushTypeError(errors, payload.terminal, 'terminal', (value: unknown) => typeof value === 'boolean');
  pushTypeError(errors, payload.rate_limited, 'rate_limited', (value: unknown) => typeof value === 'boolean');
  pushTypeError(errors, payload.reason, 'reason', isStringOrNull);
  pushTypeError(errors, payload.detail, 'detail', (value: unknown) => typeof value === 'string');
  errors.push(...validateAcpMonitorState(payload.monitor_state).map((error) => `monitor_state.${error}`));

  return errors;
}

export function assertValidAcpSessionStateEventPayload(payload: unknown, label = 'ACP session state event payload'): unknown {
  assertNoErrors(validateAcpSessionStateEventPayload(payload), label);
  return payload;
}

function arraysEqual(left: unknown, right: unknown): boolean {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

export function validateAcpTranscriptDeltaEventPayload(payload: unknown = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(payload)) return ['transcript delta payload must be an object'];

  pushExactKeysErrors(errors, payload, [
    'session_key',
    'new_lines',
    'line_count',
    'transcript_offset',
    'byte_offset',
    'transcript',
    'monitor_state',
  ], '');

  pushTypeError(errors, payload.session_key, 'session_key', isStringOrNull);
  if (!Array.isArray(payload.new_lines) || !payload.new_lines.every((line: unknown) => typeof line === 'string')) {
    errors.push('new_lines must be an array of strings');
  }
  pushTypeError(errors, payload.line_count, 'line_count', isNonNegativeInteger);
  pushTypeError(errors, payload.transcript_offset, 'transcript_offset', isNonNegativeIntegerOrNull);
  pushTypeError(errors, payload.byte_offset, 'byte_offset', isNonNegativeIntegerOrNull);
  errors.push(...validateAcpTranscriptState(payload.transcript).map((error) => `transcript.${error}`));
  errors.push(...validateAcpMonitorState(payload.monitor_state).map((error) => `monitor_state.${error}`));

  if (Array.isArray(payload.new_lines) && Number.isSafeInteger(payload.line_count) && payload.line_count !== payload.new_lines.length) {
    errors.push('line_count must equal new_lines.length');
  }
  if (isPlainObject(payload.transcript)) {
    if (!arraysEqual(payload.new_lines, payload.transcript.newLines)) {
      errors.push('new_lines must equal transcript.newLines');
    }
    if (payload.transcript_offset !== null && payload.transcript?.offset !== payload.transcript_offset) {
      errors.push('transcript_offset must equal transcript.offset when present');
    }
    if (payload.byte_offset !== null && payload.transcript?.byteOffset !== payload.byte_offset) {
      errors.push('byte_offset must equal transcript.byteOffset when present');
    }
  }

  return errors;
}

export function assertValidAcpTranscriptDeltaEventPayload(payload: unknown, label = 'ACP transcript delta event payload'): unknown {
  assertNoErrors(validateAcpTranscriptDeltaEventPayload(payload), label);
  return payload;
}

export function validateSessionLifecycleRecord(record: unknown = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(record)) return ['session lifecycle record must be an object'];

  pushTypeError(errors, record.childSessionKey, 'childSessionKey', isNonEmptyString);
  pushTypeError(errors, record.runId, 'runId', isStringOrNull);
  pushTypeError(errors, record.label, 'label', isNonEmptyString);
  pushTypeError(errors, record.agentId, 'agentId', isNonEmptyString);
  pushTypeError(errors, record.model, 'model', isStringOrNull);
  pushTypeError(errors, record.streamLogPath, 'streamLogPath', isStringOrNull);
  pushTypeError(errors, record.runtime, 'runtime', isNonEmptyString);
  pushTypeError(errors, record.gatewayLabel, 'gatewayLabel', isStringOrNull);
  pushTypeError(errors, record.cwd, 'cwd', isNonEmptyString);
  pushTypeError(errors, record.activeStatePath, 'activeStatePath', isStringOrNull);

  return errors;
}

export function assertValidSessionLifecycleRecord(record: unknown, label = 'session lifecycle record'): unknown {
  assertNoErrors(validateSessionLifecycleRecord(record), label);
  return record;
}

export function validateKillSessionResult(result: unknown = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(result)) return ['kill session result must be an object'];

  pushTypeError(errors, result.requested, 'requested', (value: unknown) => typeof value === 'boolean');
  pushTypeError(errors, result.confirmed, 'confirmed', (value: unknown) => typeof value === 'boolean');
  pushTypeError(errors, result.state, 'state', isNonEmptyString);
  pushTypeError(errors, result.cleanupAttempted, 'cleanupAttempted', (value: unknown) => typeof value === 'boolean');

  return errors;
}

export function assertValidKillSessionResult(result: unknown, label = 'kill session result'): unknown {
  assertNoErrors(validateKillSessionResult(result), label);
  return result;
}

export function validateSessionTerminationResult(result: unknown = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(result)) return ['session termination result must be an object'];

  pushExactKeysErrors(errors, result, [
    'sessionKey',
    'requested',
    'confirmed',
    'unconfirmed',
    'terminal',
    'state',
    'cleanupAttempted',
    'cleanupConfirmed',
    'cleanupError',
    'graceMs',
  ], 'termination');
  pushTypeError(errors, result.sessionKey, 'sessionKey', isStringOrNull);
  for (const field of ['requested', 'confirmed', 'unconfirmed', 'terminal', 'cleanupAttempted', 'cleanupConfirmed']) {
    pushTypeError(errors, result[field], field, (value: unknown) => typeof value === 'boolean');
  }
  pushTypeError(errors, result.state, 'state', isNonEmptyString);
  pushTypeError(errors, result.cleanupError, 'cleanupError', isStringOrNull);
  pushTypeError(errors, result.graceMs, 'graceMs', isNonNegativeInteger);
  if (result.unconfirmed !== !result.confirmed) errors.push('unconfirmed must be the inverse of confirmed');
  if (result.terminal !== result.confirmed) errors.push('terminal must equal confirmed');
  if (result.cleanupConfirmed && !result.cleanupAttempted) errors.push('cleanupConfirmed requires cleanupAttempted');

  return errors;
}

export interface SessionTerminationResult {
  sessionKey: string | null;
  requested: boolean;
  confirmed: boolean;
  unconfirmed: boolean;
  terminal: boolean;
  state: string;
  cleanupAttempted: boolean;
  cleanupConfirmed: boolean;
  cleanupError: string | null;
  graceMs: number;
}

export function assertValidSessionTerminationResult(result: unknown, label = 'session termination result'): SessionTerminationResult {
  assertNoErrors(validateSessionTerminationResult(result), label);
  return result as SessionTerminationResult;
}

export function normalizeGatewayInvokeResult(value: unknown): UnknownRecord {
  if (isPlainObject(value)) return value;
  return { raw: normalizeGatewayRawValue(value) };
}

export function validateGatewayInvokeResult(result: unknown = {}): string[] {
  if (!isPlainObject(result)) return ['gateway invoke result must be an object'];
  if (result.raw !== undefined && typeof result.raw !== 'string' && result.raw !== null) {
    return ['raw must be a string or null when present'];
  }
  return [];
}

export function assertValidGatewayInvokeResult(result: unknown, label = 'gateway invoke result'): unknown {
  assertNoErrors(validateGatewayInvokeResult(result), label);
  return result;
}

export function buildGatewayInvokeHttpError(tool: string, status: number, statusText: string, bodyText: unknown): Error & { httpStatus: number; httpBody: string | null } {
  const err = new Error(`Gateway ${tool} failed: ${status} ${statusText}`) as Error & { httpStatus: number; httpBody: string | null };
  err.httpStatus = status;
  err.httpBody = typeof bodyText === 'string' ? bodyText : normalizeGatewayRawValue(bodyText);
  return err;
}

export function validateGatewayInvokeError(error: any = {}): string[] {
  const errors: string[] = [];
  if (selectTruthyValue(() => (!error), () => (typeof error !== 'object'))) return ['gateway invoke error must be an object'];
  if (!isNonEmptyString(error.message)) errors.push('message must be a non-empty string');
  if (error.httpStatus !== undefined && !isFiniteNumber(error.httpStatus)) errors.push('httpStatus must be a number when present');
  if (error.httpBody !== undefined && typeof error.httpBody !== 'string' && error.httpBody !== null) {
    errors.push('httpBody must be a string or null when present');
  }
  return errors;
}
