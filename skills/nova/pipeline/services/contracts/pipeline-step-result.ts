import { cloneSerializable as cloneSerializableValue } from '../serialization.ts';
import {
  buildPipelineTerminalDecisionFromStepOutcome,
  pipelineTerminalStatusForStepOutcome,
  validatePipelineTerminalDecision,
} from './terminal-decision.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
type UnknownRecord = Record<string, any>;

export const PIPELINE_STEP_RESULT_SCHEMA_VERSION = 'v1';
export const PIPELINE_STEP_RESULT_KIND = 'pipeline_step_result';

export const PIPELINE_STEP_TYPES: Record<string, any> = Object.freeze({
  MODULE: 'module',
  GATE: 'gate',
  VALIDATOR: 'validator',
  GENERATOR: 'generator',
  PIPELINE: 'pipeline',
});

export const PIPELINE_STEP_ACTIONS: Record<string, any> = Object.freeze({
  CONTINUE: 'continue',
  REQUEST_FIX: 'request_fix',
  WAIT: 'wait',
  RETRY: 'retry',
  HALT: 'halt',
});

export const PIPELINE_STEP_OUTCOMES: Record<string, any> = Object.freeze({
  PASSED: 'passed',
  FIX_REQUESTED: 'fix_requested',
  WAITING: 'waiting',
  RETRYING: 'retrying',
  NEEDS_NOVA: 'needs_nova',
  BLOCKED: 'blocked',
  ERROR: 'error',
  TIMEOUT: 'timeout',
  RATE_LIMITED: 'rate_limited',
});

const OUTCOMES_BY_ACTION: Record<string, readonly string[]> = Object.freeze({
  [PIPELINE_STEP_ACTIONS.CONTINUE]: Object.freeze([PIPELINE_STEP_OUTCOMES.PASSED]),
  [PIPELINE_STEP_ACTIONS.REQUEST_FIX]: Object.freeze([PIPELINE_STEP_OUTCOMES.FIX_REQUESTED]),
  [PIPELINE_STEP_ACTIONS.WAIT]: Object.freeze([PIPELINE_STEP_OUTCOMES.WAITING]),
  [PIPELINE_STEP_ACTIONS.RETRY]: Object.freeze([PIPELINE_STEP_OUTCOMES.RETRYING]),
  [PIPELINE_STEP_ACTIONS.HALT]: Object.freeze([
    PIPELINE_STEP_OUTCOMES.NEEDS_NOVA,
    PIPELINE_STEP_OUTCOMES.BLOCKED,
    PIPELINE_STEP_OUTCOMES.ERROR,
    PIPELINE_STEP_OUTCOMES.TIMEOUT,
    PIPELINE_STEP_OUTCOMES.RATE_LIMITED,
  ]),
});

const CONTROL_ACTION_TO_STEP_ACTION: Record<string, any> = Object.freeze({
  pass: PIPELINE_STEP_ACTIONS.CONTINUE,
  request_fix: PIPELINE_STEP_ACTIONS.REQUEST_FIX,
  wait: PIPELINE_STEP_ACTIONS.WAIT,
  retry: PIPELINE_STEP_ACTIONS.RETRY,
  block: PIPELINE_STEP_ACTIONS.HALT,
});

export function cloneSerializable(value: unknown): any {
  return cloneSerializableValue(value);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstArrayValue(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function objectRecord(value: unknown): UnknownRecord {
  return isPlainObject(value) ? value : {};
}

function allowedOutcomesForAction(action: unknown): readonly string[] {
  if (!isPipelineStepAction(action)) return [];
  return OUTCOMES_BY_ACTION[action as string];
}

function normalizeStepType(stepType: unknown): string | null {
  if (stepType == null) return null;
  const normalized = String(stepType).trim();
  return selectTruthyValue(() => (normalized), () => (null));
}

function normalizeStepId(stepId: unknown): string | null {
  if (stepId == null) return null;
  const normalized = String(stepId).trim();
  return selectTruthyValue(() => (normalized), () => (null));
}

function terminalReasonCodeAuthority(terminalReasonCode: unknown, controlFailureClass: unknown): unknown {
  return selectDefinedValue(() => (terminalReasonCode), () => (controlFailureClass));
}

function terminalStatusAuthority(stepResult: UnknownRecord): string | null {
  return stepResult.terminal.status;
}

function maxRateLimitPausesAuthority(rateLimit: UnknownRecord, rateLimitStatus: UnknownRecord | null): unknown {
  if (rateLimit.max_rate_limit_pauses !== undefined && rateLimit.max_rate_limit_pauses !== null) return rateLimit.max_rate_limit_pauses;
  return selectDefinedValue(() => (rateLimitStatus?.max_rate_limit_pauses), () => (null));
}

function isPipelineStepAction(action: unknown): boolean {
  return Object.values(PIPELINE_STEP_ACTIONS).includes(action as string);
}

function isPipelineStepOutcome(outcome: unknown): boolean {
  return Object.values(PIPELINE_STEP_OUTCOMES).includes(outcome as string);
}

function isTerminalPipelineStepOutcome(outcome: unknown): boolean {
  return pipelineTerminalStatusForStepOutcome(outcome) != null;
}

export function pipelineStepActionForControlAction(controlAction: unknown): string | null {
  return selectTruthyValue(() => (CONTROL_ACTION_TO_STEP_ACTION[controlAction as string]), () => (null));
}

export function normalizePipelineStepOutcome(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return null;
  if (isPipelineStepOutcome(normalized)) return normalized;
  return null;
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTerminal({
  outcome,
  stepId,
  correlation,
  terminalAction,
  terminalScope,
  terminalReasonCode = null,
  terminalHumanReason = null,
  terminalSource = null,
  terminalMetadata = {},
}: UnknownRecord = {}): UnknownRecord {
  const decision = buildPipelineTerminalDecisionFromStepOutcome({
    outcome,
    action: terminalAction,
    scope: terminalScope,
    stepId,
    reasonCode: terminalReasonCode,
    humanReason: terminalHumanReason,
    runId: selectDefinedValue(() => (selectDefinedValue(() => (correlation?.run_id), () => (correlation?.runId))), () => (null)),
    attempt: selectDefinedValue(() => (correlation?.attempt), () => (null)),
    dispatchId: selectDefinedValue(() => (selectDefinedValue(() => (correlation?.dispatch_id), () => (correlation?.dispatchId))), () => (null)),
    sessionKey: selectDefinedValue(() => (selectDefinedValue(() => (correlation?.session_key), () => (correlation?.sessionKey))), () => (null)),
    source: terminalSource,
    metadata: terminalMetadata,
  });
  return {
    status: selectDefinedValue(() => (decision?.status), () => (null)),
    decision,
  };
}

export function buildPipelineStepResult({
  stepType,
  stepId,
  nextAction,
  outcome,
  issueType = null,
  reason = null,
  summary = null,
  diagnostics = {},
  correlation = {},
  remediation = null,
  wait = null,
  rateLimit = null,
  controlResult = null,
  terminalAction = null,
  terminalScope = null,
  terminalReasonCode = null,
  terminalHumanReason = null,
  terminalSource = null,
  terminalMetadata = {},
}: UnknownRecord = {}): UnknownRecord {
  const normalizedStepType = normalizeStepType(stepType);
  const normalizedStepId = normalizeStepId(stepId);
  const normalizedAction = selectTruthyValue(() => (nextAction), () => (null));
  const normalizedOutcome = normalizePipelineStepOutcome(outcome);
  const normalizedReason = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (reason), () => (summary))), () => (diagnostics?.summary))), () => (controlResult?.diagnostics?.summary))), () => (null));
  const typedDiagnostics = {
    ...(diagnostics?.typed ? cloneSerializable(diagnostics.typed) : {}),
    ...(controlResult ? { controlResult: cloneSerializable(controlResult) } : {}),
    ...(remediation ? { remediation: cloneSerializable(remediation) } : {}),
    ...(wait ? { wait: cloneSerializable(wait) } : {}),
  };
  const result = {
    schemaVersion: PIPELINE_STEP_RESULT_SCHEMA_VERSION,
    kind: PIPELINE_STEP_RESULT_KIND,
    stepType: normalizedStepType,
    stepId: normalizedStepId,
    nextAction: normalizedAction,
    outcome: normalizedOutcome,
    ...(issueType ? { issueType } : {}),
    diagnostics: {
      summary: normalizedReason,
      findings: cloneSerializable(firstArrayValue(diagnostics?.findings, controlResult?.diagnostics?.findings)),
      metadata: cloneSerializable(objectRecord(diagnostics?.metadata)),
      typed: typedDiagnostics,
      ...(diagnostics?.contract_invalid === true ? { contract_invalid: true } : {}),
      ...(diagnostics?.contract_diagnostic ? { contract_diagnostic: cloneSerializable(diagnostics.contract_diagnostic) } : {}),
    },
    correlation: cloneSerializable(objectRecord(correlation)),
    rateLimit: rateLimit == null ? null : cloneSerializable(rateLimit),
    terminal: normalizeTerminal({
      outcome: normalizedOutcome,
      stepId: normalizedStepId,
      correlation,
      terminalAction,
      terminalScope,
      terminalReasonCode,
      terminalHumanReason,
      terminalSource,
      terminalMetadata,
    }),
  };

  const errors = validatePipelineStepResult(result);
  if (errors.length > 0) {
    throw new Error(`Invalid pipeline step result: ${errors.join('; ')}`);
  }
  return result;
}

export function buildPipelineStepResultFromControlResult(controlResult: UnknownRecord = {}, {
  stepType,
  stepId,
  outcome = null,
  reason = null,
  correlation = {},
  remediation = null,
  wait = null,
  rateLimit = null,
  terminalAction = null,
  terminalScope = null,
  terminalReasonCode = null,
  terminalHumanReason = null,
  terminalSource = null,
  terminalMetadata = {},
}: UnknownRecord = {}): UnknownRecord {
  const action = pipelineStepActionForControlAction(controlResult?.nextAction);
  const metadata = isPlainObject(controlResult?.diagnostics?.metadata)
    ? controlResult.diagnostics.metadata
    : {};
  const controlFailureClass = typeof metadata.failure_class === 'string' && metadata.failure_class.trim()
    ? metadata.failure_class.trim()
    : null;
  return buildPipelineStepResult({
    stepType,
    stepId,
    nextAction: action,
    outcome,
    issueType: selectTruthyValue(() => (controlResult?.issueType), () => (null)),
    reason,
    summary: selectTruthyValue(() => (controlResult?.diagnostics?.summary), () => (null)),
    diagnostics: {
      findings: arrayValue(controlResult?.diagnostics?.findings),
      metadata: objectRecord(controlResult?.diagnostics?.metadata),
    },
    correlation,
    remediation,
    wait,
    rateLimit,
    controlResult,
    terminalAction,
    terminalScope,
    terminalReasonCode: terminalReasonCodeAuthority(terminalReasonCode, controlFailureClass),
    terminalHumanReason,
    terminalSource,
    terminalMetadata,
  });
}

export function isPipelineStepResult(result: unknown): result is UnknownRecord {
  return isPlainObject(result)
    && result.schemaVersion === PIPELINE_STEP_RESULT_SCHEMA_VERSION
    && result.kind === PIPELINE_STEP_RESULT_KIND
    && typeof result.stepType === 'string'
    && typeof result.stepId === 'string'
    && typeof result.nextAction === 'string'
    && typeof result.outcome === 'string';
}

export function validatePipelineStepResult(result: unknown = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(result)) {
    return ['result must be an object'];
  }
  if (result.schemaVersion !== PIPELINE_STEP_RESULT_SCHEMA_VERSION) errors.push(`schemaVersion must be '${PIPELINE_STEP_RESULT_SCHEMA_VERSION}'`);
  if (result.kind !== PIPELINE_STEP_RESULT_KIND) errors.push(`kind must be '${PIPELINE_STEP_RESULT_KIND}'`);
  if (!Object.values(PIPELINE_STEP_TYPES).includes(result.stepType)) errors.push(`stepType must be one of: ${Object.values(PIPELINE_STEP_TYPES).join(', ')}`);
  if (selectTruthyValue(() => (!result.stepId), () => (typeof result.stepId !== 'string'))) errors.push('stepId must be a non-empty string');
  if (!isPipelineStepAction(result.nextAction)) errors.push(`nextAction must be one of: ${Object.values(PIPELINE_STEP_ACTIONS).join(', ')}`);
  if (!isPipelineStepOutcome(result.outcome)) errors.push(`outcome must be one of: ${Object.values(PIPELINE_STEP_OUTCOMES).join(', ')}`);

  const allowedOutcomes = allowedOutcomesForAction(result.nextAction);
  if (result.outcome && allowedOutcomes.length > 0 && !allowedOutcomes.includes(result.outcome)) {
    errors.push(`outcome '${result.outcome}' is not valid for nextAction '${result.nextAction}'`);
  }

  const terminal = objectRecord(result?.terminal);
  if (Object.prototype.hasOwnProperty.call(terminal, 'exitCode')) errors.push('numeric terminal exitCode must not be present');
  if (Object.prototype.hasOwnProperty.call(terminal, 'exitLabel')) errors.push('numeric terminal exitLabel must not be present');
  if (Object.prototype.hasOwnProperty.call(terminal, 'exit_code')) errors.push('numeric terminal exit_code must not be present');
  if (Object.prototype.hasOwnProperty.call(terminal, 'exit_label')) errors.push('numeric terminal exit_label must not be present');
  if (result.rateLimit != null && !isPlainObject(result.rateLimit)) errors.push('rateLimit must be an object or null');
  if (result.outcome === PIPELINE_STEP_OUTCOMES.RATE_LIMITED && !isPlainObject(result.rateLimit)) {
    errors.push('rateLimit must be provided for rate_limited outcomes');
  }

  const expectedTerminalStatus = pipelineTerminalStatusForStepOutcome(result.outcome);
  const actualTerminalStatus = selectDefinedValue(() => (result?.terminal?.status), () => (null));
  if (expectedTerminalStatus !== actualTerminalStatus) {
    errors.push(`terminal.status must be ${expectedTerminalStatus == null ? 'null' : expectedTerminalStatus} for outcome '${result.outcome}'`);
  }

  const terminalDecision = selectDefinedValue(() => (result?.terminal?.decision), () => (null));
  if (expectedTerminalStatus == null && terminalDecision != null) {
    errors.push(`terminal.decision must be null for non-terminal outcome '${result.outcome}'`);
  } else if (expectedTerminalStatus != null) {
    const decisionErrors = validatePipelineTerminalDecision(terminalDecision);
    if (decisionErrors.length > 0) {
      errors.push(...decisionErrors.map((error: any) => `terminal.decision ${error}`));
    } else if (terminalDecision.status !== expectedTerminalStatus) {
      errors.push(`terminal.decision.status must be ${expectedTerminalStatus} for outcome '${result.outcome}'`);
    }
  }

  return errors;
}

export function assertPipelineStepResult(result: unknown = {}): UnknownRecord {
  const errors = validatePipelineStepResult(result);
  if (errors.length > 0) throw new Error(`Invalid pipeline step result: ${errors.join('; ')}`);
  return result as UnknownRecord;
}

export function pipelineStepTerminalStatus(result: unknown = {}): string | null {
  const stepResult = assertPipelineStepResult(result);
  return terminalStatusAuthority(stepResult);
}

export function pipelineStepTerminalDecision(result: unknown = {}): UnknownRecord | null {
  const stepResult = assertPipelineStepResult(result);
  return selectDefinedValue(() => (stepResult?.terminal?.decision), () => (null));
}

export function pipelineStepDiagnosticSummary(result: unknown = {}): string | null {
  const stepResult = assertPipelineStepResult(result);
  return selectTruthyValue(() => (stepResult?.diagnostics?.summary), () => (null));
}

export function pipelineStepRateLimitDetails(result: unknown = {}): UnknownRecord {
  const stepResult = assertPipelineStepResult(result);
  const rateLimit = stepResult.rateLimit && typeof stepResult.rateLimit === 'object' ? stepResult.rateLimit : {};
  const rateLimitStatus = selectTruthyValue(() => (rateLimit.rate_limit_status), () => (null));
  const maxRateLimitPauses = maxRateLimitPausesAuthority(rateLimit, rateLimitStatus);
  return {
    source: 'typed_step_result_rate_limit',
    rate_limit_exhausted: stepResult.outcome === PIPELINE_STEP_OUTCOMES.RATE_LIMITED,
    max_rate_limit_pauses: maxRateLimitPauses,
    rate_limit_pauses: selectDefinedValue(() => (rateLimit.rate_limit_pauses), () => (null)),
    rate_limit_status: rateLimitStatus,
  };
}
