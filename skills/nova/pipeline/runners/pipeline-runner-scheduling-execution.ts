import { log } from '../core/logger.ts';
import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.ts';
import { requireStageHandler } from '../core/registry-access.ts';
import { getContractInvalidDiagnostic, isContractInvalidError } from '../services/contract-diagnostics.ts';
import { buildValidatorRunInput, buildValidatorPluginInvocation, buildGeneratorRunInput, buildGeneratorPluginInvocation, optionalText, requiredGeneratorMode, stageTypeFromStageId } from './pipeline-runner-scheduling-inputs.ts';
import { buildFailedValidatorControlResult, normalizeScheduledValidatorResult, normalizeGeneratorExecutionResult, failedGeneratorResult } from './pipeline-runner-scheduling-results.ts';
import { selectDefinedValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export async function runScheduledValidator(config: AnyRecord, progress: AnyRecord, stageId: string, opts: AnyRecord = {}, deps: AnyRecord = {}) {
  const validatorInput = buildValidatorRunInput(config, progress, stageId, opts, deps);

  let executeValidator;
  let record;
  try {
    ({ handler: executeValidator, record } = requireStageHandler(config, 'validator.run', stageId, 'run'));
  } catch (error: any) {
    log('ERROR', `[validator] ${stageId} registry resolution failed: ${errorMessage(error)}`);
    return buildFailedValidatorControlResult(config, stageId, {
      ...opts,
      input: validatorInput,
      stageId,
      executionFailed: true,
      error: selectDefinedValue(() => (optionalText(errorMessage(error))), () => ('validator_registry_resolution_error_missing')),
    });
  }

  const pluginInvocation = buildValidatorPluginInvocation(stageId, opts);
  const pluginContext = createPluginContext({
    config,
    progress,
    hookFamily: 'validator.run',
    stageId,
    record,
    invocation: pluginInvocation,
    stateSnapshot: async () => validatorInput.stateSnapshot,
    environmentMetadata: {
      resume: opts.resume === true,
      hasStartedModules: opts.hasStartedModules === true,
      archEnabled: opts.archEnabled !== false,
    },
    signal: selectDefinedValue(() => (opts.signal), () => (null)),
  });

  try {
    const rawResult = await executeValidator(
      buildPluginInvocationEnvelope(validatorInput, pluginContext),
      pluginContext,
    );
    return normalizeScheduledValidatorResult(config, stageId, rawResult, { ...opts, input: validatorInput, stageId, moduleId: record.manifest.moduleId, pluginInvocation });
  } catch (error: any) {
    log('ERROR', `[validator] ${stageId} execution failed: ${errorMessage(error)}`);
    const contractDiagnostic = getContractInvalidDiagnostic(error);
    return buildFailedValidatorControlResult(config, stageId, {
      ...opts,
      input: validatorInput,
      stageId,
      executionFailed: true,
      contractInvalid: isContractInvalidError(error),
      contractDiagnostic,
      error: selectDefinedValue(() => (optionalText(errorMessage(error))), () => ('validator_execution_error_missing')),
    });
  }
}

export async function runScheduledGenerator(config: AnyRecord, progress: AnyRecord, stageId: string, opts: AnyRecord = {}, deps: AnyRecord = {}) {
  let executeGenerator;
  let record;
  try {
    ({ handler: executeGenerator, record } = requireStageHandler(config, 'generator.run', stageId, 'run'));
  } catch (error: any) {
    log('WARN', `[generator] ${stageId} registry resolution failed: ${errorMessage(error)}`);
    return failedGeneratorResult(stageId, error);
  }

  const generatorInput = buildGeneratorRunInput(config, progress, stageId, opts, deps);
  const pluginInvocation = buildGeneratorPluginInvocation(stageId, opts);
  const pluginContext = createPluginContext({
    config,
    progress,
    hookFamily: 'generator.run',
    stageId,
    record,
    invocation: pluginInvocation,
    stateSnapshot: async () => generatorInput.stateSnapshot,
    environmentMetadata: {
      scheduleReason: optionalText(opts.scheduleReason),
      mode: requiredGeneratorMode(opts),
      terminalStatus: selectDefinedValue(() => (opts.terminalStatus), () => (null)),
      terminalDecision: selectDefinedValue(() => (opts.terminalDecision), () => (null)),
      reasonCode: optionalText(opts.reasonCode),
    },
    injectedDeps: deps,
  });

  try {
    const rawResult = await executeGenerator(
      buildPluginInvocationEnvelope(generatorInput, pluginContext),
      pluginContext,
    );
    return normalizeGeneratorExecutionResult(rawResult, stageId, { moduleId: record.manifest.moduleId, input: generatorInput, pluginInvocation });
  } catch (error: any) {
    log('WARN', `[generator] ${stageId} degraded: ${errorMessage(error)}`);
    return failedGeneratorResult(stageId, error, generatorInput.ids.generatorType);
  }
}
