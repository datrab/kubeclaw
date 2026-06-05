import {
  EXIT_OK,
  EXIT_ERROR,
  EXIT_NEEDS_NOVA,
  EXIT_BLOCKED,
  EXIT_TIMEOUT,
  EXIT_RATE_LIMITED,
} from '../../core/constants.ts';
import { cloneSerializable as cloneSerializableValue } from '../serialization.ts';

type UnknownRecord = Record<string, any>;

export const PIPELINE_STEP_RESULT_SCHEMA_VERSION = 'v1';
export const PIPELINE_STEP_RESULT_KIND = 'pipeline_step_result';

export const PIPELINE_STEP_TYPES: Record<string, any> = Object.freeze({
  MODULE: 'module',
  GATE: 'gate',
  VALIDATOR: 'validator',
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

export const PIPELINE_STEP_EXIT_CODES: Record<string, number> = Object.freeze({
  [PIPELINE_STEP_OUTCOMES.PASSED]: EXIT_OK,
  [PIPELINE_STEP_OUTCOMES.ERROR]: EXIT_ERROR,
  [PIPELINE_STEP_OUTCOMES.NEEDS_NOVA]: EXIT_NEEDS_NOVA,
  [PIPELINE_STEP_OUTCOMES.BLOCKED]: EXIT_BLOCKED,
  [PIPELINE_STEP_OUTCOMES.TIMEOUT]: EXIT_TIMEOUT,
  [PIPELINE_STEP_OUTCOMES.RATE_LIMITED]: EXIT_RATE_LIMITED,
});

export const PIPELINE_STEP_EXIT_LABELS: Record<number, string> = Object.freeze({
  [EXIT_OK]: 'OK',
  [EXIT_ERROR]: 'ERROR',
  [EXIT_NEEDS_NOVA]: 'NEEDS_NOVA',
  [EXIT_BLOCKED]: 'BLOCKED',
  [EXIT_TIMEOUT]: 'TIMEOUT',
  [EXIT_RATE_LIMITED]: 'RATE_LIMITED',
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

function normalizeStepType(stepType: unknown): string | null {
  if (stepType == null) return null;
  const normalized = String(stepType).trim();
  return normalized || null;
}

function normalizeStepId(stepId: unknown): string | null {
  if (stepId == null) return null;
  const normalized = String(stepId).trim();
  return normalized || null;
}

export function isPipelineStepAction(action: unknown): boolean {
  return Object.values(PIPELINE_STEP_ACTIONS).includes(action as string);
}

export function isPipelineStepOutcome(outcome: unknown): boolean {
  return Object.values(PIPELINE_STEP_OUTCOMES).includes(outcome as string);
}

export function isTerminalPipelineStepOutcome(outcome: unknown): boolean {
  return Object.prototype.hasOwnProperty.call(PIPELINE_STEP_EXIT_CODES, outcome as string);
}

export function pipelineStepExitCodeForOutcome(outcome: unknown): number | null {
  return PIPELINE_STEP_EXIT_CODES[outcome as string] ?? null;
}

export function pipelineStepExitLabelForCode(exitCode: unknown): string {
  return PIPELINE_STEP_EXIT_LABELS[Number(exitCode)] || 'UNKNOWN';
}

export function pipelineStepActionForControlAction(controlAction: unknown): string | null {
  return CONTROL_ACTION_TO_STEP_ACTION[controlAction as string] || null;
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

function normalizeTerminal({ outcome }: UnknownRecord = {}): UnknownRecord {
  const exitCode = pipelineStepExitCodeForOutcome(outcome);
  return {
    exitCode,
    exitLabel: exitCode == null ? null : pipelineStepExitLabelForCode(exitCode),
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
  controlResult = null,
}: UnknownRecord = {}): UnknownRecord {
  const normalizedStepType = normalizeStepType(stepType);
  const normalizedStepId = normalizeStepId(stepId);
  const normalizedAction = nextAction || null;
  const normalizedOutcome = normalizePipelineStepOutcome(outcome);
  const normalizedReason = reason || summary || diagnostics?.summary || controlResult?.diagnostics?.summary || null;
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
      findings: cloneSerializable(diagnostics?.findings || controlResult?.diagnostics?.findings || []),
      metadata: cloneSerializable(diagnostics?.metadata || {}),
      typed: typedDiagnostics,
      ...(diagnostics?.contract_invalid === true ? { contract_invalid: true } : {}),
      ...(diagnostics?.contract_diagnostic ? { contract_diagnostic: cloneSerializable(diagnostics.contract_diagnostic) } : {}),
    },
    correlation: cloneSerializable(correlation || {}),
    terminal: normalizeTerminal({ outcome: normalizedOutcome }),
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
}: UnknownRecord = {}): UnknownRecord {
  const action = pipelineStepActionForControlAction(controlResult?.nextAction);
  return buildPipelineStepResult({
    stepType,
    stepId,
    nextAction: action,
    outcome,
    issueType: controlResult?.issueType || null,
    reason,
    summary: controlResult?.diagnostics?.summary || null,
    diagnostics: {
      findings: controlResult?.diagnostics?.findings || [],
      metadata: controlResult?.diagnostics?.metadata || {},
    },
    correlation,
    remediation,
    wait,
    controlResult,
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
  if (!result.stepId || typeof result.stepId !== 'string') errors.push('stepId must be a non-empty string');
  if (!isPipelineStepAction(result.nextAction)) errors.push(`nextAction must be one of: ${Object.values(PIPELINE_STEP_ACTIONS).join(', ')}`);
  if (!isPipelineStepOutcome(result.outcome)) errors.push(`outcome must be one of: ${Object.values(PIPELINE_STEP_OUTCOMES).join(', ')}`);

  const allowedOutcomes = OUTCOMES_BY_ACTION[result.nextAction] || [];
  if (result.outcome && allowedOutcomes.length > 0 && !allowedOutcomes.includes(result.outcome)) {
    errors.push(`outcome '${result.outcome}' is not valid for nextAction '${result.nextAction}'`);
  }

  const expectedExitCode = pipelineStepExitCodeForOutcome(result.outcome);
  const actualExitCode = result?.terminal?.exitCode ?? null;
  if (expectedExitCode !== actualExitCode) {
    errors.push(`terminal.exitCode must be ${expectedExitCode == null ? 'null' : expectedExitCode} for outcome '${result.outcome}'`);
  }

  return errors;
}

export function assertPipelineStepResult(result: unknown = {}): UnknownRecord {
  const errors = validatePipelineStepResult(result);
  if (errors.length > 0) throw new Error(`Invalid pipeline step result: ${errors.join('; ')}`);
  return result as UnknownRecord;
}

export function pipelineStepExitCode(result: unknown = {}): number | null {
  const stepResult = assertPipelineStepResult(result);
  return stepResult?.terminal?.exitCode ?? pipelineStepExitCodeForOutcome(stepResult.outcome);
}

export function pipelineStepExitLabel(result: unknown = {}): string | null {
  const exitCode = pipelineStepExitCode(result);
  return exitCode == null ? null : pipelineStepExitLabelForCode(exitCode);
}

export function pipelineStepDiagnosticSummary(result: unknown = {}): string | null {
  const stepResult = assertPipelineStepResult(result);
  return stepResult?.diagnostics?.summary || null;
}

export function pipelineStepRateLimitDetails(result: unknown = {}): UnknownRecord {
  const stepResult = assertPipelineStepResult(result);
  const metadata = stepResult?.diagnostics?.metadata || {};
  const controlMetadata = stepResult?.diagnostics?.typed?.controlResult?.diagnostics?.metadata || {};
  const rateLimitStatus = metadata.rate_limit_status || controlMetadata.rate_limit_status || null;
  const maxRateLimitPauses = metadata.max_rate_limit_pauses
    ?? controlMetadata.max_rate_limit_pauses
    ?? rateLimitStatus?.max_rate_limit_pauses
    ?? null;
  return {
    source: 'typed_step_result_diagnostics',
    rate_limit_exhausted: stepResult.outcome === PIPELINE_STEP_OUTCOMES.RATE_LIMITED,
    max_rate_limit_pauses: maxRateLimitPauses,
    rate_limit_status: rateLimitStatus,
  };
}
