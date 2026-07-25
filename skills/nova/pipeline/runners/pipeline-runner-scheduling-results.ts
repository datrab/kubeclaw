import { getRunId } from '../core/runtime.ts';
import { createContractInvalidError, getContractInvalidDiagnostic, isContractInvalidError } from '../services/contract-diagnostics.ts';
import { buildArchitectureValidatorControlResult, coerceArchitectureValidatorControlResult } from '../services/arch-validator.ts';
import { buildModuleValidatorControlResult, normalizeTypedValidatorControlResult, validateTypedValidatorControlResult } from '../services/contracts/validator-control-result.ts';
import { normalizeGeneratorResult, validateGeneratorResult } from '../services/contracts/generator-result.ts';
import { PIPELINE_STEP_ACTIONS, PIPELINE_STEP_OUTCOMES, PIPELINE_STEP_TYPES, buildPipelineStepResult, buildPipelineStepResultFromControlResult } from '../services/contracts/pipeline-step-result.ts';
import { PIPELINE_TERMINAL_ACTIONS, PIPELINE_TERMINAL_SCOPES } from '../services/contracts/terminal-decision.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { optionalText, recordOrEmpty, stageTypeFromStageId } from './pipeline-runner-scheduling-inputs.ts';

type AnyRecord = Record<string, any>;
const EXECUTION_FAILED_VALIDATOR_POLICY = Object.freeze({ nextAction: 'block', issueType: 'environment', outcomeClass: 'execution_failed' });
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function validateArchitectureValidatorControlResult(result: AnyRecord, stageId: any = 'validator:architecture') {
  const errors = validateTypedValidatorControlResult(result, {
    producerType: 'architecture',
    stageId,
    allowedNextActions: ['pass', 'block'],
  });
  if (typeof stageId === 'string' && stageId === 'validator:architecture') {
    const metadata = selectDefinedValue(() => (selectDefinedValue(() => (result?.diagnostics?.metadata), () => (result?.diagnostics?.typed?.validator?.metadata))), () => ({}));
    if (metadata?.blocked === true && result.nextAction !== 'block') {
      errors.push('blocked validator metadata must map to nextAction=block');
    }
  }
  return errors;
}

function normalizeArchitectureValidatorResult(config: AnyRecord, rawResult: unknown, opts: AnyRecord = {}) {
  const controlResult = coerceArchitectureValidatorControlResult(config, rawResult, opts);
  const errors = validateArchitectureValidatorControlResult(controlResult, opts.stageId);
  if (errors.length > 0) {
    throw createContractInvalidError(`Architecture validator returned invalid control result: ${errors.join('; ')}`, {
      label: 'Architecture validator',
      stageId: selectDefinedValue(() => (optionalText(opts.stageId)), () => ('validator:architecture')),
      hookFamily: 'validator.run',
      moduleId: optionalText(opts.moduleId),
      producerKind: 'validator',
      producerType: 'architecture',
      validationErrors: errors,
      rawResult,
      coercedResult: controlResult,
      input: selectDefinedValue(() => (opts.input), () => (null)),
      invocation: selectDefinedValue(() => (opts.pluginInvocation), () => (null)),
    });
  }
  return controlResult;
}

function validatorProducerType(stageId: any = ''): string {
  return stageTypeFromStageId(stageId, 'validator.stageId');
}

function isArchitectureValidatorStage(stageId: any = ''): boolean {
  return stageId === 'validator:architecture';
}

export function buildFailedValidatorControlResult(config: AnyRecord, stageId: string, opts: AnyRecord = {}) {
  if (isArchitectureValidatorStage(stageId)) {
    return buildArchitectureValidatorControlResult(config, {
      blocked: true,
      project: optionalText(config?.project),
      timestamp: new Date().toISOString(),
      run_id: getRunId(config),
      findings: [],
    }, {
      ...opts,
      executionFailed: true,
      error: selectDefinedValue(() => (optionalText(opts.error)), () => ('validator_execution_error_missing')),
    });
  }
  return buildModuleValidatorControlResult(config, {
    passed: false,
    blocked: true,
    error: selectDefinedValue(() => (optionalText(opts.error)), () => ('validator_execution_error_missing')),
  }, {
    ...opts,
    producerType: validatorProducerType(stageId),
    stageId,
    scope: selectDefinedValue(() => (optionalText(opts.scope)), () => ('pipeline')),
    ...EXECUTION_FAILED_VALIDATOR_POLICY,
  });
}

export function normalizeScheduledValidatorResult(config: AnyRecord, stageId: string, rawResult: unknown, opts: AnyRecord = {}) {
  if (isArchitectureValidatorStage(stageId)) {
    return normalizeArchitectureValidatorResult(config, rawResult, opts);
  }
  return normalizeTypedValidatorControlResult(rawResult, {
    producerType: validatorProducerType(stageId),
    label: `${stageId} validator`,
    stageId,
    moduleId: optionalText(opts.moduleId),
    input: selectDefinedValue(() => (opts.input), () => (null)),
    invocation: selectDefinedValue(() => (opts.pluginInvocation), () => (null)),
  });
}

function validatorExecutionFailed(controlResult: AnyRecord) {
  const typed = controlResult?.diagnostics?.typed?.validator?.metadata ?? {};
  const metadata = controlResult?.diagnostics?.metadata ?? {};
  return selectTruthyValue(() => typed.contract_invalid === true, () => typed.execution_failed === true, () => metadata.contract_invalid === true, () => metadata.execution_failed === true);
}

function validatorStepDisposition(controlResult: AnyRecord, invalid: boolean) {
  if (invalid) return { outcome: PIPELINE_STEP_OUTCOMES.ERROR, terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP };
  if (controlResult?.diagnostics?.typed?.validator?.outcomeClass === 'blocked') return { outcome: PIPELINE_STEP_OUTCOMES.BLOCKED, terminalAction: PIPELINE_TERMINAL_ACTIONS.NOTIFY_OPERATOR };
  if (controlResult?.nextAction === 'pass') return { outcome: PIPELINE_STEP_OUTCOMES.PASSED, terminalAction: PIPELINE_TERMINAL_ACTIONS.NONE };
  return { outcome: PIPELINE_STEP_OUTCOMES.ERROR, terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP };
}

export function projectValidatorControlResultToStepResult(config: AnyRecord, controlResult: AnyRecord = {}, opts: AnyRecord = {}) {
  const stageId = selectDefinedValue(() => (optionalText(opts.stageId)), () => (`validator:${selectDefinedValue(() => (controlResult?.producerType), () => ('producer_type_missing'))}`));
  const stepId = selectDefinedValue(() => (optionalText(opts.stepId)), () => (stageId));
  const invalidOrExecutionFailed = validatorExecutionFailed(controlResult);
  const { outcome, terminalAction } = validatorStepDisposition(controlResult, invalidOrExecutionFailed);
  const correlation = {
    run_id: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (config?._runId), () => (config?.run_id))), () => (getRunId(config)))), () => (null)),
    validator_stage_id: stageId,
    validator_type: selectDefinedValue(() => (controlResult?.producerType), () => (validatorProducerType(stageId))),
    schedule_key: optionalText(opts.scheduleKey),
    module_id: optionalText(opts.moduleId),
    gate_id: optionalText(opts.gateId),
  };

  if (controlResult?.nextAction === 'request_fix') {
    const requestFixOutcome = invalidOrExecutionFailed ? PIPELINE_STEP_OUTCOMES.ERROR : PIPELINE_STEP_OUTCOMES.NEEDS_NOVA;
    const requestFixTerminalAction = invalidOrExecutionFailed ? PIPELINE_TERMINAL_ACTIONS.STOP : PIPELINE_TERMINAL_ACTIONS.REQUEST_HANDOFF;
    return buildPipelineStepResult({
      stepType: PIPELINE_STEP_TYPES.VALIDATOR,
      stepId,
      nextAction: PIPELINE_STEP_ACTIONS.HALT,
      outcome: requestFixOutcome,
      issueType: selectDefinedValue(() => (controlResult.issueType), () => ('code')),
      summary: selectDefinedValue(() => (controlResult?.diagnostics?.summary), () => ('validator_fix_requested')),
      diagnostics: {
        findings: Array.isArray(controlResult?.diagnostics?.findings) ? controlResult.diagnostics.findings : [],
        metadata: recordOrEmpty(controlResult?.diagnostics?.metadata),
      },
      correlation,
      controlResult,
      terminalAction: requestFixTerminalAction,
      terminalScope: PIPELINE_TERMINAL_SCOPES.VALIDATOR,
    });
  }

  return buildPipelineStepResultFromControlResult(controlResult, {
    stepType: PIPELINE_STEP_TYPES.VALIDATOR,
    stepId,
    outcome,
    correlation,
    terminalAction,
    terminalScope: PIPELINE_TERMINAL_SCOPES.VALIDATOR,
  });
}

export function validateGeneratorExecutionResult(result: AnyRecord, stageId: any = 'generator:missing_generator_type') {
  const expectedProducerType = stageTypeFromStageId(stageId, 'generator.stageId');
  const errors = validateGeneratorResult(result, {
    producerType: expectedProducerType,
    stageId,
  });
  if (result?.outputs && typeof result.outputs === 'object' && !Array.isArray(result.outputs)
    && (selectTruthyValue(() => (typeof result.outputs.status !== 'string'), () => (!result.outputs.status.trim())))) {
    errors.push('outputs.status must be a non-empty string');
  }
  return errors;
}

export function normalizeGeneratorExecutionResult(rawResult: unknown, stageId: any = 'generator:missing_generator_type', opts: AnyRecord = {}) {
  const producerType = stageTypeFromStageId(stageId, 'generator.stageId');
  const generatorResult = normalizeGeneratorResult(rawResult, {
    producerType,
    label: `Generator '${stageId}'`,
    stageId,
    moduleId: optionalText(opts.moduleId),
    input: selectDefinedValue(() => (opts.input), () => (null)),
    invocation: selectDefinedValue(() => (opts.pluginInvocation), () => (null)),
  });
  const errors: string[] = [];
  const outputStatus = generatorResult.outputs.status;
  if (typeof outputStatus !== 'string') {
    errors.push('outputs.status must be a non-empty string');
  } else if (!outputStatus.trim()) {
    errors.push('outputs.status must be a non-empty string');
  }
  if (errors.length > 0) {
    throw createContractInvalidError(`Generator '${stageId}' returned invalid result: ${errors.join('; ')}`, {
      label: `Generator '${stageId}'`,
      stageId,
      hookFamily: 'generator.run',
      moduleId: optionalText(opts.moduleId),
      producerKind: 'generator',
      producerType,
      validationErrors: errors,
      rawResult,
      coercedResult: generatorResult,
      input: selectDefinedValue(() => (opts.input), () => (null)),
      invocation: selectDefinedValue(() => (opts.pluginInvocation), () => (null)),
    });
  }
  return generatorResult;
}

export function failedGeneratorResult(stageId: string, error: unknown, producerType: string | null = null) {
  const message = optionalText(errorMessage(error)) ?? 'generator_execution_error_missing';
  const contractInvalid = isContractInvalidError(error);
  return {
    schemaVersion: 'v1', producerKind: 'generator', producerType: producerType ?? stageTypeFromStageId(stageId, 'generator.stageId'),
    outputs: { status: 'failed', ...(producerType ? { reason: message } : {}) },
    diagnostics: { error: message, ...(contractInvalid ? { contract_invalid: true, contract_diagnostic: getContractInvalidDiagnostic(error) } : {}) },
  };
}
