import { getRunId } from '../../core/runtime.ts';
import { createContractInvalidError } from '../contract-diagnostics.ts';
import { cloneSerializable as cloneSerializableValue } from '../serialization.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
type UnknownRecord = Record<string, any>;

export const VALIDATOR_CONTROL_NEXT_ACTIONS: readonly string[] = Object.freeze(['pass', 'request_fix', 'block']);
const VALIDATOR_PRODUCER_TYPE = 'validator';
const MISSING_PRODUCER_TYPE = 'missing_producer_type';
const VALIDATION_FAILURE_CODE = 'VALIDATION_FAILURE';
const VALIDATION_FAILURE_MESSAGE = 'Validation failure';

export function cloneSerializable(value: unknown): any {
  return cloneSerializableValue(value);
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function firstTextValue(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = textValue(value);
    if (normalized) return normalized;
  }
  return null;
}

function validatorProducerType(value: unknown): string {
  return selectDefinedValue(() => (textValue(value)), () => (VALIDATOR_PRODUCER_TYPE));
}

function validationFailureSummary(item: UnknownRecord): string {
  return selectDefinedValue(() => (firstTextValue(item.code, item.explanation, item.stage)), () => ('validation_failure'));
}

function normalizeStageId(stageId: string | null = null, producerType: string | null = null): string {
  return selectDefinedValue(() => (textValue(stageId)), () => (`validator:${selectDefinedValue(() => (textValue(producerType)), () => (MISSING_PRODUCER_TYPE))}`));
}

function validatorErrorLabel(label: unknown, stageId: string): string {
  return selectDefinedValue(() => (firstTextValue(label, stageId)), () => (stageId));
}

function validatorScope(scope: unknown, moduleId: unknown): string {
  const explicitScope = textValue(scope);
  if (explicitScope) return explicitScope;
  return textValue(moduleId) ? 'module' : 'pipeline';
}

function summarizeValidationFailures(failures: unknown[] = []): string | null {
  if (selectTruthyValue(() => (!Array.isArray(failures)), () => (failures.length === 0))) return null;
  return failures.map((failure = {}) => {
    const item = isPlainObject(failure) ? failure : {};
    return validationFailureSummary(item);
  }).join(', ');
}

function summarizeLintReport(report: unknown = null): string | null {
  if (selectTruthyValue(() => (!isPlainObject(report)), () => (!isPlainObject(report.summary)))) return null;
  const { total_errors: totalErrors = 0, total_warnings: totalWarnings = 0, tools_failed: toolsFailed = 0 } = report.summary;
  return `${totalErrors} error(s), ${totalWarnings} warning(s), ${toolsFailed} failed tool(s)`;
}

function buildValidatorSummary(result: UnknownRecord = {}, opts: UnknownRecord = {}): string {
  const producerType = validatorProducerType(opts.producerType);
  if (typeof opts.summary === 'string' && opts.summary.trim()) return opts.summary.trim();
  if (typeof result.summary === 'string' && result.summary.trim()) return result.summary.trim();
  if (typeof result.error === 'string' && result.error.trim()) return result.error.trim();
  const failureSummary = summarizeValidationFailures(result.failures);
  if (failureSummary) return `${producerType} failed: ${failureSummary}`;
  const lintSummary = summarizeLintReport(result.report);
  if (lintSummary) return `${producerType} completed: ${lintSummary}`;
  return opts.nextAction === 'pass'
    ? `${producerType} passed`
    : `${producerType} requires attention`;
}

function mapValidationFailureToFinding(failure: UnknownRecord = {}): UnknownRecord {
  return {
    code: selectDefinedValue(() => (firstTextValue(failure.code)), () => (VALIDATION_FAILURE_CODE)),
    severity: 'error',
    message: selectDefinedValue(() => (firstTextValue(failure.explanation, failure.message)), () => (VALIDATION_FAILURE_MESSAGE)),
    category: selectTruthyValue(() => (failure.stage), () => (null)),
    target: selectTruthyValue(() => (failure.target), () => (null)),
    retryable: false,
    environmentIssue: false,
    metadata: {
      next_step: selectTruthyValue(() => (failure.next_step), () => (null)),
      raw_failure: cloneSerializable(failure),
    },
  };
}

function mapLintReportToFindings(report: unknown = null): UnknownRecord[] {
  if (selectTruthyValue(() => (!isPlainObject(report)), () => (!isPlainObject(report.tools)))) return [];
  const findings: UnknownRecord[] = [];
  for (const [toolId, toolResult] of Object.entries(report.tools)) {
    if (!isPlainObject(toolResult)) continue;
    if (toolResult.status === 'error') {
      findings.push({
        code: `${toolId}.tool_error`,
        severity: 'error',
        message: selectDefinedValue(() => (firstTextValue(toolResult.error)), () => (`${toolId} failed`)),
        category: toolId,
        target: null,
        retryable: true,
        environmentIssue: true,
        metadata: { tool_id: toolId, tool_status: toolResult.status },
      });
      continue;
    }
    for (const finding of Array.isArray(toolResult.findings) ? toolResult.findings : []) {
      const item = isPlainObject(finding) ? finding : {};
      findings.push({
        code: selectDefinedValue(() => (firstTextValue(item.code)), () => (`${toolId}.finding`)),
        severity: item.severity === 'warning' ? 'warn' : 'error',
        message: selectDefinedValue(() => (firstTextValue(item.message)), () => (`${toolId} finding`)),
        category: toolId,
        target: selectTruthyValue(() => (item.file), () => (null)),
        retryable: false,
        environmentIssue: false,
        metadata: {
          tool_id: toolId,
          line: selectDefinedValue(() => (item.line), () => (null)),
          raw_finding: cloneSerializable(item),
        },
      });
    }
  }
  return findings;
}

export function buildTypedValidatorControlResult({
  producerType,
  nextAction,
  issueType = null,
  summary,
  outcomeClass,
  metadata = {},
  findings = [],
  scope = null,
  stageId = null,
  validatorRef = null,
  typedMetadata = {},
}: UnknownRecord = {}): UnknownRecord {
  const diagnostics: UnknownRecord = {
    summary,
    metadata,
    typed: {
      validator: {
        schemaVersion: 'v1',
        validatorType: producerType,
        outcomeClass,
        scope,
        stageId: normalizeStageId(stageId, producerType),
        validatorRef,
        metadata: typedMetadata,
      },
    },
  };
  if (Array.isArray(findings) && findings.length > 0) diagnostics.findings = findings;

  return {
    schemaVersion: 'v1',
    producerKind: 'validator',
    producerType,
    nextAction,
    ...(issueType ? { issueType } : {}),
    diagnostics,
  };
}

export function buildModuleValidatorControlResult(config: UnknownRecord, result: UnknownRecord = {}, opts: UnknownRecord = {}): UnknownRecord {
  if (selectTruthyValue(() => (typeof opts.producerType !== 'string'), () => (!opts.producerType.trim()))) {
    throw new Error('validator control result requires explicit producerType');
  }
  if (!VALIDATOR_CONTROL_NEXT_ACTIONS.includes(opts.nextAction)) {
    throw new Error('validator control result requires explicit nextAction');
  }
  if (selectTruthyValue(() => (typeof opts.outcomeClass !== 'string'), () => (!opts.outcomeClass.trim()))) {
    throw new Error('validator control result requires explicit outcomeClass');
  }
  if (['request_fix', 'block'].includes(opts.nextAction) && !opts.issueType) {
    throw new Error(`${opts.nextAction} validator control result requires explicit issueType`);
  }
  const producerType = opts.producerType.trim();
  const stageId = normalizeStageId(opts.stageId, producerType);
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (result?.run_id), () => (opts.runId))), () => (getRunId(config as never)))), () => (config?._runId))), () => (config?.run_id))), () => (null));
  const moduleId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (result?.module_id), () => (opts.moduleId))), () => (opts?.input?.ids?.moduleId))), () => (null));
  const moduleDir = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (result?.module_dir), () => (opts.moduleDir))), () => (opts?.input?.workspace?.moduleDir))), () => (null));
  const failures = Array.isArray(result?.failures) ? result.failures : [];
  const findings = Array.isArray(opts.findings)
    ? opts.findings
    : [
        ...failures.map((failure: UnknownRecord) => mapValidationFailureToFinding(failure)),
        ...mapLintReportToFindings(result?.report),
      ];
  const summary = buildValidatorSummary(result, { ...opts, producerType, stageId });
  const metadata: UnknownRecord = {
    passed: opts.nextAction === 'pass',
    blocked: opts.nextAction === 'block',
    execution_failed: opts.executionFailed === true,
    contract_invalid: opts.contractInvalid === true,
    error: selectTruthyValue(() => (selectTruthyValue(() => (result?.error), () => (opts.error))), () => (null)),
    project: selectTruthyValue(() => (config?.project), () => ('missing_project')),
    run_id: runId,
    module_id: moduleId,
    module_dir: moduleDir,
    stage_id: stageId,
    validator_type: producerType,
    scope: validatorScope(opts.scope, moduleId),
    outcome_class: opts.outcomeClass,
    failures: cloneSerializable(failures),
    report_summary: cloneSerializable(selectTruthyValue(() => (result?.report?.summary), () => (null))),
    report_artifact: selectTruthyValue(() => (selectTruthyValue(() => (result?.report_artifact), () => (opts.reportArtifact))), () => (null)),
    report: opts.includeReport === true ? cloneSerializable(selectTruthyValue(() => (result?.report), () => (null))) : undefined,
  };

  return buildTypedValidatorControlResult({
    producerType,
    nextAction: opts.nextAction,
    issueType: opts.issueType,
    summary,
    metadata,
    findings,
    scope: metadata.scope,
    stageId,
    validatorRef: selectTruthyValue(() => (opts.validatorRef), () => (null)),
    outcomeClass: opts.outcomeClass,
    typedMetadata: metadata,
  });
}

export function isTypedValidatorControlResult(result: unknown, producerType: string | null = null): result is UnknownRecord {
  return isPlainObject(result)
    && result?.schemaVersion === 'v1'
    && result?.producerKind === 'validator'
    && (producerType ? result?.producerType === producerType : typeof result?.producerType === 'string')
    && typeof result?.nextAction === 'string';
}

export function coerceTypedValidatorControlResult(result: unknown, { producerType }: { producerType?: string | null | undefined } = {}): UnknownRecord {
  if (isTypedValidatorControlResult(result, selectDefinedValue(() => (producerType), () => (null)))) return result;
  throw new Error(`validator:${selectTruthyValue(() => (producerType), () => ('missing_producer_type'))} plugin output must be a typed validator control result; compatibility-shaped validation results are not accepted at the validator boundary`);
}

export function validateTypedValidatorControlResult(result: unknown, {
  producerType = null,
  stageId = `validator:${selectTruthyValue(() => (producerType), () => ('missing_producer_type'))}`,
  allowedNextActions = VALIDATOR_CONTROL_NEXT_ACTIONS,
}: {
  producerType?: string | null | undefined;
  stageId?: string;
  allowedNextActions?: readonly string[];
} = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(result)) {
    errors.push('result must be an object');
    return errors;
  }
  if (result.schemaVersion !== 'v1') errors.push("schemaVersion must be 'v1'");
  if (result.producerKind !== 'validator') errors.push("producerKind must be 'validator'");
  if (producerType && result.producerType !== producerType) errors.push(`producerType must be '${producerType}'`);
  if (!allowedNextActions.includes(result.nextAction)) {
    errors.push(`nextAction must be ${allowedNextActions.map((value) => `'${value}'`).join(', ').replace(/, ([^,]+)$/, ', or $1')} for ${stageId}`);
  }
  if (!isPlainObject(result.diagnostics)) {
    errors.push('diagnostics must be an object');
  } else if (selectTruthyValue(() => (typeof result.diagnostics.summary !== 'string'), () => (!result.diagnostics.summary.trim()))) {
    errors.push('diagnostics.summary must be a non-empty string');
  }
  if (['request_fix', 'block'].includes(result.nextAction) && !result.issueType) {
    errors.push(`${result.nextAction} action requires issueType`);
  }
  return errors;
}

export function normalizeTypedValidatorControlResult(rawResult: unknown, {
  producerType,
  label,
  stageId = `validator:${selectTruthyValue(() => (producerType), () => ('missing_producer_type'))}`,
  coerce = (value: unknown) => coerceTypedValidatorControlResult(value, { producerType }),
  moduleId = null,
  input = null,
  invocation = null,
}: {
  producerType?: string | null | undefined;
  label?: string | null;
  stageId?: string;
  coerce?: (value: unknown) => UnknownRecord;
  moduleId?: string | null;
  input?: unknown;
  invocation?: unknown;
} = {}): UnknownRecord {
  let controlResult: UnknownRecord;
  try {
    controlResult = coerce(rawResult);
  } catch (error) {
    const validationErrors = [error instanceof Error && error.message ? error.message : 'coercion failed'];
    const errorLabel = validatorErrorLabel(label, stageId);
    throw createContractInvalidError(`${errorLabel} validator returned invalid control result: ${validationErrors.join('; ')}`, {
      label: errorLabel,
      stageId,
      hookFamily: 'validator.run',
      moduleId,
      producerKind: 'validator',
      producerType,
      validationErrors,
      rawResult,
      input,
      invocation,
    });
  }
  const errors = validateTypedValidatorControlResult(controlResult, { producerType, stageId });
  if (errors.length > 0) {
    const errorLabel = validatorErrorLabel(label, stageId);
    throw createContractInvalidError(`${errorLabel} validator returned invalid control result: ${errors.join('; ')}`, {
      label: errorLabel,
      stageId,
      hookFamily: 'validator.run',
      moduleId,
      producerKind: 'validator',
      producerType,
      validationErrors: errors,
      rawResult,
      coercedResult: controlResult,
      input,
      invocation,
    });
  }
  return controlResult;
}
