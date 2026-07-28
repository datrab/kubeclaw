import { cloneSerializable as cloneSerializableValue } from '../serialization.ts';
import {
  buildPipelineTerminalDecisionFromStepOutcome,
  pipelineTerminalStatusForStepOutcome,
  validatePipelineTerminalDecision,
} from './terminal-decision.ts';
import { buildStepDiagnostics } from './pipeline-step-diagnostics.ts';
import { arrayValue, isPlainObject, objectRecord } from './contract-values.ts';

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

function allowedOutcomesForAction(action: unknown): readonly string[] {
  if (!isPipelineStepAction(action)) return [];
  return OUTCOMES_BY_ACTION[action as string] ?? [];
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

export function buildPipelineStepResult(input: UnknownRecord = {}): UnknownRecord {
  const {
    stepType, stepId, nextAction, outcome, issueType, reason, summary,
    diagnostics, correlation, remediation, wait, rateLimit, controlResult,
    terminalAction, terminalScope, terminalReasonCode, terminalHumanReason,
    terminalSource, terminalMetadata,
  } = input;
  const normalizedStepType = normalizeStepType(stepType);
  const normalizedStepId = normalizeStepId(stepId);
  const normalizedAction = selectTruthyValue(() => (nextAction), () => (null));
  const normalizedOutcome = normalizePipelineStepOutcome(outcome);
  const result: UnknownRecord = {
    schemaVersion: PIPELINE_STEP_RESULT_SCHEMA_VERSION,
    kind: PIPELINE_STEP_RESULT_KIND,
    stepType: normalizedStepType,
    stepId: normalizedStepId,
    nextAction: normalizedAction,
    outcome: normalizedOutcome,
    diagnostics: buildStepDiagnostics({ reason, summary, diagnostics, controlResult, remediation, wait }),
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
  if (issueType) result.issueType = issueType;

  const errors = validatePipelineStepResult(result);
  if (errors.length > 0) {
    throw new Error(`Invalid pipeline step result: ${errors.join('; ')}`);
  }
  return result;
}

export function buildPipelineStepResultFromControlResult(controlResult: UnknownRecord = {}, options: UnknownRecord = {}): UnknownRecord {
  const {
    stepType, stepId, outcome, reason, correlation, remediation, wait, rateLimit,
    terminalAction, terminalScope, terminalReasonCode, terminalHumanReason,
    terminalSource, terminalMetadata,
  } = options;
  const diagnostics = objectRecord(controlResult.diagnostics);
  const action = pipelineStepActionForControlAction(controlResult?.nextAction);
  const metadata = objectRecord(diagnostics.metadata);
  const controlFailureClass = typeof metadata.failure_class === 'string' && metadata.failure_class.trim()
    ? metadata.failure_class.trim()
    : null;
  return buildPipelineStepResult({
    stepType,
    stepId,
    nextAction: action,
    outcome,
    issueType: controlResult.issueType ?? null,
    reason,
    summary: diagnostics.summary ?? null,
    diagnostics: {
      findings: arrayValue(diagnostics.findings),
      metadata,
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

function stepShapeErrors(result: UnknownRecord): string[] {
  const errors: string[] = [];
  if (result.schemaVersion !== PIPELINE_STEP_RESULT_SCHEMA_VERSION) errors.push(`schemaVersion must be '${PIPELINE_STEP_RESULT_SCHEMA_VERSION}'`);
  if (result.kind !== PIPELINE_STEP_RESULT_KIND) errors.push(`kind must be '${PIPELINE_STEP_RESULT_KIND}'`);
  if (!Object.values(PIPELINE_STEP_TYPES).includes(result.stepType)) errors.push(`stepType must be one of: ${Object.values(PIPELINE_STEP_TYPES).join(', ')}`);
  if (!result.stepId || typeof result.stepId !== 'string') errors.push('stepId must be a non-empty string');
  if (!isPipelineStepAction(result.nextAction)) errors.push(`nextAction must be one of: ${Object.values(PIPELINE_STEP_ACTIONS).join(', ')}`);
  if (!isPipelineStepOutcome(result.outcome)) errors.push(`outcome must be one of: ${Object.values(PIPELINE_STEP_OUTCOMES).join(', ')}`);
  const allowed = allowedOutcomesForAction(result.nextAction);
  if (result.outcome && allowed.length > 0 && !allowed.includes(result.outcome)) {
    errors.push(`outcome '${result.outcome}' is not valid for nextAction '${result.nextAction}'`);
  }
  return errors;
}

function terminalEnvelopeErrors(result: UnknownRecord): string[] {
  const errors: string[] = [];
  const terminal = objectRecord(result.terminal);
  for (const field of ['exitCode', 'exitLabel', 'exit_code', 'exit_label']) {
    if (Object.prototype.hasOwnProperty.call(terminal, field)) errors.push(`numeric terminal ${field} must not be present`);
  }
  if (result.rateLimit != null && !isPlainObject(result.rateLimit)) errors.push('rateLimit must be an object or null');
  if (result.outcome === PIPELINE_STEP_OUTCOMES.RATE_LIMITED && !isPlainObject(result.rateLimit)) {
    errors.push('rateLimit must be provided for rate_limited outcomes');
  }
  return errors;
}

function terminalDecisionErrors(result: UnknownRecord): string[] {
  const errors: string[] = [];
  const terminal = objectRecord(result.terminal);
  const expected = pipelineTerminalStatusForStepOutcome(result.outcome);
  const actual = terminal.status ?? null;
  if (expected !== actual) errors.push(`terminal.status must be ${expected == null ? 'null' : expected} for outcome '${result.outcome}'`);
  const decision = terminal.decision ?? null;
  if (expected == null && decision != null) {
    errors.push(`terminal.decision must be null for non-terminal outcome '${result.outcome}'`);
    return errors;
  }
  if (expected == null) return errors;
  const decisionErrors = validatePipelineTerminalDecision(decision);
  errors.push(...decisionErrors.map((error) => `terminal.decision ${error}`));
  if (decisionErrors.length === 0 && decision.status !== expected) {
    errors.push(`terminal.decision.status must be ${expected} for outcome '${result.outcome}'`);
  }
  return errors;
}

export function validatePipelineStepResult(result: unknown = {}): string[] {
  if (!isPlainObject(result)) return ['result must be an object'];
  return [...stepShapeErrors(result), ...terminalEnvelopeErrors(result), ...terminalDecisionErrors(result)];
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
