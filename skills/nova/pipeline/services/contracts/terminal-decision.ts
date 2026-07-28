import { cloneSerializable as cloneSerializableValue } from '../serialization.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
type UnknownRecord = Record<string, any>;

const PIPELINE_TERMINAL_DECISION_SCHEMA_VERSION = 'v1';
const PIPELINE_TERMINAL_DECISION_KIND = 'pipeline_terminal_decision';

const PIPELINE_TERMINAL_STATUSES = Object.freeze({
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  PAUSED: 'paused',
  BLOCKED: 'blocked',
  ACTION_REQUIRED: 'action_required',
  TIMED_OUT: 'timed_out',
  RATE_LIMITED: 'rate_limited',
  CANCELLED: 'cancelled',
});

export const PIPELINE_TERMINAL_ACTIONS = Object.freeze({
  NONE: 'none',
  STOP: 'stop',
  PAUSE: 'pause',
  NOTIFY_OPERATOR: 'notify_operator',
  REQUEST_HANDOFF: 'request_handoff',
  RETRY_LATER: 'retry_later',
});

export const PIPELINE_TERMINAL_SCOPES = Object.freeze({
  PIPELINE: 'pipeline',
  MODULE: 'module',
  GATE: 'gate',
  VALIDATOR: 'validator',
  SUMMARY: 'summary',
});

const TERMINAL_STATUS_BY_STEP_OUTCOME: Record<string, string> = Object.freeze({
  passed: PIPELINE_TERMINAL_STATUSES.SUCCEEDED,
  error: PIPELINE_TERMINAL_STATUSES.FAILED,
  needs_nova: PIPELINE_TERMINAL_STATUSES.ACTION_REQUIRED,
  blocked: PIPELINE_TERMINAL_STATUSES.BLOCKED,
  timeout: PIPELINE_TERMINAL_STATUSES.TIMED_OUT,
  rate_limited: PIPELINE_TERMINAL_STATUSES.RATE_LIMITED,
});

const NUMERIC_EXIT_FIELD_NAMES = Object.freeze(['exit', 'exitCode', 'exit_code']);

export function cloneSerializable(value: unknown): any {
  return cloneSerializableValue(value);
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeToken(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return selectTruthyValue(() => (normalized), () => (null));
}

function normalizeText(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return selectTruthyValue(() => (normalized), () => (null));
}

function normalizePositiveInteger(value: unknown): number | null {
  if (value == null) return null;
  const numberValue = Number(value);
  if (selectTruthyValue(() => (!Number.isInteger(numberValue)), () => (numberValue < 1))) return null;
  return numberValue;
}

function optionalTextFields(input: UnknownRecord = {}, fields: string[] = []): UnknownRecord {
  const result: UnknownRecord = {};
  for (const field of fields) {
    const normalized = normalizeText(input[field]);
    if (normalized) result[field] = normalized;
  }
  return result;
}

function isPipelineTerminalStatus(status: unknown): boolean {
  return (Object.values(PIPELINE_TERMINAL_STATUSES) as readonly string[]).includes(status as string);
}

function isPipelineTerminalAction(action: unknown): boolean {
  return (Object.values(PIPELINE_TERMINAL_ACTIONS) as readonly string[]).includes(action as string);
}

function isPipelineTerminalScope(scope: unknown): boolean {
  return (Object.values(PIPELINE_TERMINAL_SCOPES) as readonly string[]).includes(scope as string);
}

export function pipelineTerminalStatusForStepOutcome(outcome: unknown): string | null {
  const normalizedOutcome = normalizeToken(outcome);
  if (!normalizedOutcome) return null;
  return TERMINAL_STATUS_BY_STEP_OUTCOME[normalizedOutcome] ?? null;
}

function buildPipelineTerminalDecision({
  status,
  action,
  reasonCode = null,
  humanReason = null,
  scope,
  runId = null,
  moduleId = null,
  gateId = null,
  validatorId = null,
  attempt = null,
  dispatchId = null,
  sessionKey = null,
  source = null,
  metadata = {},
}: UnknownRecord = {}): UnknownRecord {
  const normalizedStatus = normalizeToken(status);
  const normalizedAction = normalizeToken(action);
  const normalizedScope = normalizeToken(scope);
  const correlation: UnknownRecord = optionalTextFields({
    run_id: runId,
    module_id: moduleId,
    gate_id: gateId,
    validator_id: validatorId,
    dispatch_id: dispatchId,
    session_key: sessionKey,
  }, ['run_id', 'module_id', 'gate_id', 'validator_id', 'dispatch_id', 'session_key']);
  const normalizedAttempt = normalizePositiveInteger(attempt);
  if (normalizedAttempt != null) correlation.attempt = normalizedAttempt;

  const decision = {
    schemaVersion: PIPELINE_TERMINAL_DECISION_SCHEMA_VERSION,
    kind: PIPELINE_TERMINAL_DECISION_KIND,
    status: normalizedStatus,
    action: normalizedAction,
    reasonCode: normalizeToken(reasonCode),
    humanReason: normalizeText(humanReason),
    scope: normalizedScope,
    correlation,
    source: normalizeText(source),
    metadata: cloneSerializable(selectDefinedValue(() => (metadata), () => ({}))),
  };

  const errors = validatePipelineTerminalDecision(decision);
  if (errors.length > 0) {
    throw new Error(`Invalid pipeline terminal decision: ${errors.join('; ')}`);
  }
  return decision;
}

export function buildPipelineTerminalDecisionFromStepOutcome({
  outcome,
  action,
  scope,
  reasonCode = null,
  humanReason = null,
  stepId = null,
  runId = null,
  attempt = null,
  dispatchId = null,
  sessionKey = null,
  source = null,
  metadata = {},
}: UnknownRecord = {}): UnknownRecord | null {
  const status = pipelineTerminalStatusForStepOutcome(outcome);
  if (!status) return null;
  const normalizedScope = normalizeToken(scope);
  if (!isPipelineTerminalScope(normalizedScope)) {
    throw new Error(`Invalid pipeline terminal decision: scope must be one of: ${Object.values(PIPELINE_TERMINAL_SCOPES).join(', ')}`);
  }
  const scopedIdentity = terminalScopeIdentity(normalizedScope as string, stepId);

  return buildPipelineTerminalDecision({
    status,
    action,
    reasonCode: terminalReasonCodeAuthority(reasonCode, outcome),
    humanReason,
    scope: normalizedScope,
    runId,
    attempt,
    dispatchId,
    sessionKey,
    source,
    metadata,
    ...scopedIdentity,
  });
}

function terminalScopeIdentity(scope: string, stepId: unknown): UnknownRecord {
  const fieldByScope: Record<string, string> = {
    [PIPELINE_TERMINAL_SCOPES.MODULE]: 'moduleId',
    [PIPELINE_TERMINAL_SCOPES.GATE]: 'gateId',
    [PIPELINE_TERMINAL_SCOPES.VALIDATOR]: 'validatorId',
  };
  const field = fieldByScope[scope];
  return field ? { [field]: stepId } : {};
}

function terminalReasonCodeAuthority(reasonCode: string | null, outcome: string): string {
  if (reasonCode) return reasonCode;
  return outcome;
}

function isPipelineTerminalDecision(decision: unknown): decision is UnknownRecord {
  return isPlainObject(decision)
    && decision.schemaVersion === PIPELINE_TERMINAL_DECISION_SCHEMA_VERSION
    && decision.kind === PIPELINE_TERMINAL_DECISION_KIND
    && typeof decision.status === 'string'
    && typeof decision.action === 'string';
}

export function validatePipelineTerminalDecision(decision: unknown = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(decision)) {
    return ['decision must be an object'];
  }

  errors.push(...terminalShapeErrors(decision));
  errors.push(...terminalCorrelationErrors(decision.correlation));

  return errors;
}

function terminalShapeErrors(decision: UnknownRecord): string[] {
  const errors: string[] = [];
  if (decision.schemaVersion !== PIPELINE_TERMINAL_DECISION_SCHEMA_VERSION) errors.push(`schemaVersion must be '${PIPELINE_TERMINAL_DECISION_SCHEMA_VERSION}'`);
  if (decision.kind !== PIPELINE_TERMINAL_DECISION_KIND) errors.push(`kind must be '${PIPELINE_TERMINAL_DECISION_KIND}'`);
  if (!isPipelineTerminalStatus(decision.status)) errors.push(`status must be one of: ${Object.values(PIPELINE_TERMINAL_STATUSES).join(', ')}`);
  if (!isPipelineTerminalAction(decision.action)) errors.push(`action must be one of: ${Object.values(PIPELINE_TERMINAL_ACTIONS).join(', ')}`);
  if (!isPipelineTerminalScope(decision.scope)) errors.push(`scope must be one of: ${Object.values(PIPELINE_TERMINAL_SCOPES).join(', ')}`);
  for (const field of ['reasonCode', 'humanReason', 'source']) {
    if (decision[field] != null && typeof decision[field] !== 'string') errors.push(`${field} must be a string or null`);
  }
  if (!isPlainObject(decision.correlation)) errors.push('correlation must be an object');
  if (!isPlainObject(decision.metadata)) errors.push('metadata must be an object');
  for (const fieldName of NUMERIC_EXIT_FIELD_NAMES) {
    if (Object.prototype.hasOwnProperty.call(decision, fieldName)) errors.push(`terminal decision must not carry numeric ${fieldName}`);
  }
  return errors;
}

function terminalCorrelationErrors(correlation: unknown): string[] {
  if (!isPlainObject(correlation)) return [];
  const errors: string[] = [];
  for (const [key, value] of Object.entries(correlation)) {
    if (key === 'attempt' && (!Number.isInteger(value) || Number(value) < 1)) {
      errors.push('correlation.attempt must be a positive integer when present');
    } else if (key !== 'attempt' && value != null && typeof value !== 'string') {
      errors.push(`correlation.${key} must be a string when present`);
    }
  }
  return errors;
}

function assertPipelineTerminalDecision(decision: unknown = {}): UnknownRecord {
  const errors = validatePipelineTerminalDecision(decision);
  if (errors.length > 0) throw new Error(`Invalid pipeline terminal decision: ${errors.join('; ')}`);
  return decision as UnknownRecord;
}
