import { log } from '../core/logger.ts';
import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.ts';
import { STATUS } from '../core/constants.ts';
import { getRunId } from '../core/runtime.ts';
import { requireStageHandler, resolveStageOwner } from '../core/registry.ts';
import { createContractInvalidError, getContractInvalidDiagnostic, isContractInvalidError } from '../services/contract-diagnostics.ts';
import {
  buildArchitectureValidatorControlResult,
  coerceArchitectureValidatorControlResult,
} from '../services/arch-validator.ts';
import {
  buildModuleValidatorControlResult,
  normalizeTypedValidatorControlResult,
  validateTypedValidatorControlResult,
} from '../services/contracts/validator-control-result.ts';
import {
  normalizeGeneratorResult,
  validateGeneratorResult,
} from '../services/contracts/generator-result.ts';
import { releaseGateFiles, syncControlFiles } from '../services/blueprint.ts';
import {
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  PIPELINE_STEP_TYPES,
  buildPipelineStepResult,
  buildPipelineStepResultFromControlResult,
} from '../services/contracts/pipeline-step-result.ts';
import {
  PIPELINE_TERMINAL_ACTIONS,
  PIPELINE_TERMINAL_SCOPES,
} from '../services/contracts/terminal-decision.ts';
import {
  loadAuthoritativeModuleState,
  hasAnyStartedModules,
  projectPipelineGateState,
} from './pipeline-runner-shared.ts';
import { checkDependencies as checkModuleDependencies } from '../services/dependencies.ts';
import {
  buildStagePluginInvocation,
  buildStageRefs,
} from './stage-envelope-primitives.ts';
import { countByStatus, buildGeneratorArtifactRefs } from './pipeline-runner-scheduling/snapshots.ts';
import { resolveGateTargetModule } from './gate-target-module.ts';
import {
  isScheduledValidatorComplete,
  markScheduledValidatorComplete,
} from './pipeline-runner-scheduling/validator-completions.ts';
import { getArchValidationConfig, getReviewDefaultsConfig } from '../services/runtime-defaults.ts';
import { buildDependencyGraph, collectReadyBatch } from '../scheduler.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

const loggedConsumedGateKeys = new Set<string>();

function logGateConsumedOnce(config: AnyRecord, gateId: string, status: string, source: string) {
  const runId = selectDefinedValue(() => (selectDefinedValue(() => (config?._runId), () => (config?.run_id))), () => ('run_unknown'));
  const key = `${runId}:${gateId}:${status}:${source}`;
  if (loggedConsumedGateKeys.has(key)) return;
  loggedConsumedGateKeys.add(key);
  log('DEBUG', `Gate '${gateId}' already consumed via gate read model (${status}, source=${source}) — skipping`);
}
export { isScheduledValidatorComplete, markScheduledValidatorComplete };

type AnyRecord = Record<string, any>;

const EXECUTION_FAILED_VALIDATOR_POLICY = Object.freeze({ nextAction: 'block', issueType: 'environment', outcomeClass: 'execution_failed' });

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordOrEmpty(value: unknown): AnyRecord {
  return isRecord(value) ? value : {};
}

function keysOf(value: unknown): string[] {
  return Object.keys(recordOrEmpty(value));
}

function entriesOf(value: unknown): [string, any][] {
  return Object.entries(recordOrEmpty(value));
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredText(value: unknown, field: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${field}: required non-empty string`);
  return text;
}

function requiredGeneratorMode(opts: AnyRecord): string {
  return requiredText(opts.mode, 'generator.mode');
}

function stageTypeFromStageId(stageId: string, field: string): string {
  const type = selectDefinedValue(() => (optionalText(String(stageId).split(':')[1])), () => (optionalText(stageId)));
  if (!type) throw new Error(`${field}: required stage type`);
  return type;
}

function moduleStatusForGeneratorSnapshot(authoritative: AnyRecord | null): string {
  if (typeof authoritative?.status === 'string' && authoritative.status.trim()) return authoritative.status.trim();
  return STATUS.PENDING;
}

function buildGeneratorStateSnapshot(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}, deps: AnyRecord = {}) {
  const moduleStatuses = entriesOf(progress?.modules).map(([moduleId, mod = {}]: [string, any]) => {
    void mod;
    const authoritative = loadAuthoritativeModuleState(config, progress, moduleId);
    return moduleStatusForGeneratorSnapshot(authoritative);
  });
  const gateStatuses = keysOf(progress?.gates).map((gateId: string) => {
    const gate = selectDefinedValue(() => (progress.gates[gateId]), () => (null));
    const gateProjection = projectPipelineGateState(config, gateId, gate, deps);
    return selectDefinedValue(() => (gateProjection?.status), () => ('PENDING'));
  });

  return {
    pipeline: {
      project: selectDefinedValue(() => (config?.project), () => (null)),
      run_id: getRunId(config),
      terminal_status: selectDefinedValue(() => (opts.terminalStatus), () => (null)),
      terminal_decision: selectDefinedValue(() => (opts.terminalDecision), () => (null)),
      reason_code: selectDefinedValue(() => (opts.reasonCode), () => (null)),
      schedule_reason: selectDefinedValue(() => (opts.scheduleReason), () => (null)),
      mode: requiredGeneratorMode(opts),
    },
    modules: {
      total: keysOf(progress?.modules).length,
      status_counts: countByStatus(moduleStatuses),
    },
    gates: {
      total: keysOf(progress?.gates).length,
      status_counts: countByStatus(gateStatuses),
    },
  };
}


function resolveGeneratorInputConfig(config: AnyRecord, progress: AnyRecord, generatorType: string): AnyRecord {
  const configValue = config?.[generatorType];
  const progressValue = progress?.[generatorType];
  const hasConfig = configValue && typeof configValue === 'object' && !Array.isArray(configValue);
  const hasProgress = progressValue && typeof progressValue === 'object' && !Array.isArray(progressValue);
  if (hasConfig && hasProgress) {
    throw new Error(`Generator '${generatorType}' has ambiguous config in both project config and progress; choose one typed source`);
  }
  if (hasProgress) return { ...progressValue, configSource: 'progress' };
  if (hasConfig) return { ...configValue, configSource: 'config' };
  return { configSource: 'default' };
}

function buildGeneratorRunInput(config: AnyRecord, progress: AnyRecord, stageId: string, opts: AnyRecord = {}, deps: AnyRecord = {}) {
  const runId = getRunId(config);
  const generatorType = stageTypeFromStageId(stageId, 'generator.stageId');
  const refs = buildStageRefs({
    runRef: { prefix: 'run', parts: [runId] },
    moduleRef: opts.moduleId ? { prefix: 'module', parts: [opts.moduleId] } : null,
    gateRef: opts.gateId ? { prefix: 'gate', parts: [opts.gateId] } : null,
  });

  return {
    refs,
    ids: {
      runId,
      generatorType,
      stageId,
      ...(opts.moduleId ? { moduleId: opts.moduleId } : {}),
      ...(opts.gateId ? { gateId: opts.gateId } : {}),
    },
    generator: {
      config: resolveGeneratorInputConfig(config, progress, generatorType),
    },
    artifacts: buildGeneratorArtifactRefs(config),
    summaries: buildGeneratorArtifactRefs(config),
    stateSnapshot: buildGeneratorStateSnapshot(config, progress, opts, deps),
    executionContext: {
      scheduleReason: optionalText(opts.scheduleReason),
      mode: requiredGeneratorMode(opts),
      terminalStatus: selectDefinedValue(() => (opts.terminalStatus), () => (null)),
      terminalDecision: selectDefinedValue(() => (opts.terminalDecision), () => (null)),
      reasonCode: optionalText(opts.reasonCode),
      orderIndex: selectDefinedValue(() => (opts.orderIndex), () => (null)),
    },
  };
}

function buildGeneratorPluginInvocation(stageId: string, opts: AnyRecord = {}) {
  return buildStagePluginInvocation(stageId, {
    moduleId: optionalText(opts.moduleId),
    gateId: optionalText(opts.gateId),
    causationRef: optionalText(opts.causationRef),
  });
}

function buildValidatorStateSnapshot(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}, deps: AnyRecord = {}) {
  return {
    pipeline: {
      project: optionalText(config?.project),
      run_id: getRunId(config),
      resume: opts.resume === true,
      arch_validation_enabled: opts.archEnabled !== false,
      has_started_modules: opts.hasStartedModules === true,
    },
    modules: {
      total: keysOf(progress?.modules).length,
      started: hasAnyStartedModules(config, progress, deps),
    },
    gates: {
      total: keysOf(progress?.gates).length,
    },
  };
}

function buildValidatorRunInput(config: AnyRecord, progress: AnyRecord, stageId: string, opts: AnyRecord = {}, deps: AnyRecord = {}) {
  const runId = getRunId(config);
  const validatorName = stageTypeFromStageId(stageId, 'validator.stageId');
  const moduleId = optionalText(opts.moduleId);
  const gateId = optionalText(opts.gateId);
  const moduleConfig = moduleId ? (selectDefinedValue(() => (progress?.modules?.[moduleId]), () => (null))) : null;
  const moduleState = moduleId
    ? loadAuthoritativeModuleState(config, progress, moduleId)
    : null;
  const stageConfig = {
    ...(stageId === 'validator:architecture' ? getArchValidationConfig(config) : {}),
    ...(stageId === 'validator:architecture' && progress?.arch_validation && typeof progress.arch_validation === 'object' ? progress.arch_validation : {}),
    ...(config?.validators?.[validatorName] && typeof config.validators[validatorName] === 'object' ? config.validators[validatorName] : {}),
    ...(progress?.validators?.config?.[validatorName] && typeof progress.validators.config[validatorName] === 'object' ? progress.validators.config[validatorName] : {}),
    ...(opts.validatorConfig && typeof opts.validatorConfig === 'object' ? opts.validatorConfig : {}),
  };

  return {
    refs: buildStageRefs({
      runRef: { prefix: 'run', parts: [runId] },
      moduleRef: moduleId ? { prefix: 'module', parts: [moduleId] } : null,
      gateRef: gateId ? { prefix: 'gate', parts: [gateId] } : null,
      validatorResultRef: { prefix: 'validator_result', parts: [runId, ...(moduleId ? [moduleId] : []), ...(gateId ? [gateId] : []), validatorName] },
    }),
    ids: {
      runId,
      validatorName,
      scope: selectDefinedValue(() => (optionalText(opts.scope)), () => ((moduleId ? 'module' : (gateId ? 'gate' : 'run')))),
      stageId,
      ...(moduleId ? { moduleId, moduleDir: selectDefinedValue(() => (moduleConfig?.dir), () => (null)) } : {}),
      ...(gateId ? { gateId } : {}),
    },
    validator: {
      validatorType: validatorName,
      config: stageConfig,
    },
    module: moduleId ? {
      moduleId,
      dir: selectDefinedValue(() => (moduleConfig?.dir), () => (null)),
      title: selectDefinedValue(() => (moduleConfig?.title), () => (null)),
      config: recordOrEmpty(moduleConfig),
      status: selectDefinedValue(() => (moduleState), () => (null)),
    } : null,
    gate: gateId ? {
      gateId,
      config: selectDefinedValue(() => (progress?.gates?.[gateId]), () => (null)),
    } : null,
    artifacts: [],
    stateSnapshot: buildValidatorStateSnapshot(config, progress, opts, deps),
    executionContext: {
      resume: opts.resume === true,
      hasStartedModules: opts.hasStartedModules === true,
      archEnabled: opts.archEnabled !== false,
      ...(moduleConfig?.dir ? { moduleDir: moduleConfig.dir } : {}),
      scheduleKey: optionalText(opts.scheduleKey),
      scheduleReason: optionalText(opts.scheduleReason),
      orderIndex: selectDefinedValue(() => (opts.orderIndex), () => (null)),
    },
  };
}

function buildValidatorPluginInvocation(stageId: string, opts: AnyRecord = {}) {
  return buildStagePluginInvocation(stageId, {
    resume: opts.resume === true,
    moduleId: optionalText(opts.moduleId),
    gateId: optionalText(opts.gateId),
    causationRef: optionalText(opts.causationRef),
  });
}

function validateArchitectureValidatorControlResult(result: AnyRecord, stageId = 'validator:architecture') {
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

function validatorProducerType(stageId = ''): string {
  return stageTypeFromStageId(stageId, 'validator.stageId');
}

function isArchitectureValidatorStage(stageId = ''): boolean {
  return stageId === 'validator:architecture';
}

function buildFailedValidatorControlResult(config: AnyRecord, stageId: string, opts: AnyRecord = {}) {
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

function normalizeScheduledValidatorResult(config: AnyRecord, stageId: string, rawResult: unknown, opts: AnyRecord = {}) {
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

export function projectValidatorControlResultToStepResult(config: AnyRecord, controlResult: AnyRecord = {}, opts: AnyRecord = {}) {
  const stageId = selectDefinedValue(() => (optionalText(opts.stageId)), () => (`validator:${selectDefinedValue(() => (controlResult?.producerType), () => ('producer_type_missing'))}`));
  const stepId = selectDefinedValue(() => (optionalText(opts.stepId)), () => (stageId));
  const validatorOutcomeClass = controlResult?.diagnostics?.typed?.validator?.outcomeClass;
  const typedValidatorMetadata = selectDefinedValue(() => (controlResult?.diagnostics?.typed?.validator?.metadata), () => ({}));
  const validatorMetadata = selectDefinedValue(() => (controlResult?.diagnostics?.metadata), () => ({}));
  const invalidOrExecutionFailed = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (typedValidatorMetadata?.contract_invalid === true), () => (typedValidatorMetadata?.execution_failed === true))), () => (validatorMetadata?.contract_invalid === true))), () => (validatorMetadata?.execution_failed === true));
  const outcome = invalidOrExecutionFailed ? PIPELINE_STEP_OUTCOMES.ERROR
    : validatorOutcomeClass === 'blocked' ? PIPELINE_STEP_OUTCOMES.BLOCKED
    : controlResult?.nextAction === 'pass' ? PIPELINE_STEP_OUTCOMES.PASSED
      : PIPELINE_STEP_OUTCOMES.ERROR;
  const terminalAction = outcome === PIPELINE_STEP_OUTCOMES.PASSED ? PIPELINE_TERMINAL_ACTIONS.NONE
    : outcome === PIPELINE_STEP_OUTCOMES.BLOCKED ? PIPELINE_TERMINAL_ACTIONS.NOTIFY_OPERATOR
      : PIPELINE_TERMINAL_ACTIONS.STOP;
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

export function validateGeneratorExecutionResult(result: AnyRecord, stageId = 'generator:missing_generator_type') {
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

function normalizeGeneratorExecutionResult(rawResult: unknown, stageId = 'generator:missing_generator_type', opts: AnyRecord = {}) {
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
  if (selectTruthyValue(() => (typeof generatorResult.outputs.status !== 'string'), () => (!generatorResult.outputs.status.trim()))) {
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

export async function runScheduledValidator(config: AnyRecord, progress: AnyRecord, stageId: string, opts: AnyRecord = {}, deps: AnyRecord = {}) {
  const validatorInput = buildValidatorRunInput(config, progress, stageId, opts, deps);

  let executeValidator;
  let record;
  try {
    ({ handler: executeValidator, record } = requireStageHandler(config, 'validator.run', stageId, 'run'));
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    log('WARN', `[generator] ${stageId} registry resolution failed: ${errorMessage(error)}`);
    return {
      schemaVersion: 'v1',
      producerKind: 'generator',
      producerType: stageTypeFromStageId(stageId, 'generator.stageId'),
      outputs: {
        status: 'failed',
      },
      diagnostics: {
        error: selectDefinedValue(() => (optionalText(errorMessage(error))), () => ('generator_registry_resolution_error_missing')),
      },
    };
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
  } catch (error) {
    log('WARN', `[generator] ${stageId} degraded: ${errorMessage(error)}`);
    const message = selectDefinedValue(() => (optionalText(errorMessage(error))), () => ('generator_execution_error_missing'));
    const contractInvalid = isContractInvalidError(error);
    const contractDiagnostic = getContractInvalidDiagnostic(error);
    return {
      schemaVersion: 'v1',
      producerKind: 'generator',
      producerType: generatorInput.ids.generatorType,
      outputs: {
        status: 'failed',
        reason: message,
      },
      diagnostics: {
        error: message,
        ...(contractInvalid ? { contract_invalid: true, contract_diagnostic: contractDiagnostic } : {}),
      },
    };
  }
}

function normalizeScheduleRef(progress: AnyRecord, ref: unknown): string | null {
  if (selectTruthyValue(() => (!ref), () => (typeof ref !== 'string'))) return null;
  const normalized = ref.trim();
  if (!normalized) return null;
  if (selectTruthyValue(() => (selectTruthyValue(() => (normalized.startsWith('module:')), () => (normalized.startsWith('gate:')))), () => (normalized.startsWith('validator:')))) return normalized;
  if (progress?.modules?.[normalized]) return `module:${normalized}`;
  if (progress?.gates?.[normalized]) return `gate:${normalized}`;
  return normalized;
}

function normalizeValidatorScheduleEntry(progress: AnyRecord, entry: AnyRecord = {}, index = 0): AnyRecord | null {
  const stage = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (optionalText(entry.stage)), () => (optionalText(entry.validator)))), () => (optionalText(entry.validator_stage)))), () => (optionalText(entry.id)));
  if (selectTruthyValue(() => (selectTruthyValue(() => (!stage), () => (typeof stage !== 'string'))), () => (!stage.startsWith('validator:')))) return null;
  const after = normalizeScheduleRef(progress, selectDefinedValue(() => (optionalText(entry.after)), () => (optionalText(entry.after_step))));
  const before = normalizeScheduleRef(progress, selectDefinedValue(() => (optionalText(entry.before)), () => (optionalText(entry.before_step))));
  const timing = before ? 'before' : (after ? 'after' : 'inline');
  const ref = selectDefinedValue(() => (selectDefinedValue(() => (before), () => (after))), () => (`schedule:${index}`));
  const scope = selectDefinedValue(() => (optionalText(entry.scope)), () => ('pipeline'));
  const key = selectDefinedValue(() => (optionalText(entry.key)), () => (`${timing}:${ref}:${stage}:${scope}:${index}`));
  return {
    ...entry,
    stage,
    after,
    before,
    timing,
    ref,
    scope,
    key,
    orderIndex: selectDefinedValue(() => (entry.orderIndex), () => (index)),
    mode: selectDefinedValue(() => (optionalText(entry.mode)), () => ('mandatory')),
  };
}

export function resolveConfiguredValidatorSchedule(progress: AnyRecord = {}): AnyRecord[] {
  const rawSchedule = Array.isArray(progress?.validators?.schedule) ? progress.validators.schedule : [];
  return rawSchedule
    .map((entry: any, index: number) => normalizeValidatorScheduleEntry(progress, entry, index))
    .filter(Boolean);
}

function normalizeExecutionModuleId(progress: AnyRecord, stepId: unknown): string | null {
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (typeof stepId !== 'string'), () => (!stepId.trim()))), () => (stepId.startsWith('gate:')))), () => (stepId.startsWith('validator:')))) return null;
  const moduleId = stepId.startsWith('module:') ? stepId.slice('module:'.length) : stepId;
  if (!moduleId) return null;
  return progress?.modules?.[moduleId] ? moduleId : null;
}

function moduleDependencyIds(progress: AnyRecord, moduleId: string): string[] {
  const dependsOn = Array.isArray(progress?.modules?.[moduleId]?.depends_on) ? progress.modules[moduleId].depends_on : [];
  return dependsOn
    .map((dependency: string) => String(selectDefinedValue(() => (dependency), () => (''))).replace(/^module:/, ''))
    .filter((dependency: string) => dependency && progress?.modules?.[dependency]);
}

function moduleIsReadyForBatch(config: AnyRecord, progress: AnyRecord, moduleId: string, deps: AnyRecord = {}): boolean {
  const lifecycleModule = loadAuthoritativeModuleState(config, progress, moduleId);
  if (selectTruthyValue(() => (lifecycleModule?.status === STATUS.PASS), () => (lifecycleModule?.status === STATUS.BLOCKED))) return false;
  const dependencyState = checkModuleDependencies(config, progress, moduleId);
  return dependencyState?.met === true;
}

function collectReadyModuleBatch(config: AnyRecord, progress: AnyRecord, deps: AnyRecord = {}, startIndex = 0): string[] {
  const executionOrder = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  const moduleOrder = executionOrder.map((stepId: unknown) => normalizeExecutionModuleId(progress, stepId)).filter(Boolean) as string[];
  const graph = buildDependencyGraph(moduleOrder.map((moduleId) => ({
    id: moduleId,
    dependencies: moduleDependencyIds(progress, moduleId),
  })));
  return collectReadyBatch({
    orderedIds: moduleOrder,
    startIndex,
    dependencyIds: (moduleId) => graph.dependencyIds(moduleId),
    isCandidateReady: (moduleId) => moduleIsReadyForBatch(config, progress, moduleId, deps),
  });
}

function moduleOrderIndex(progress: AnyRecord, moduleId: string): number {
  const executionOrder = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  const moduleOrder = executionOrder.map((stepId: unknown) => normalizeExecutionModuleId(progress, stepId)).filter(Boolean) as string[];
  const index = moduleOrder.indexOf(moduleId);
  return index >= 0 ? index : 0;
}

function scheduleMatchesRef(schedule: AnyRecord = {}, timing: string, ref: string): boolean {
  return schedule?.timing === timing && schedule?.ref === ref;
}

function buildValidatorNextStep(schedule: AnyRecord, reason: string | null = null): AnyRecord {
  return {
    type: 'validator',
    id: schedule.stage,
    schedule: {
      ...schedule,
      scheduleReason: selectDefinedValue(() => (selectDefinedValue(() => (optionalText(reason)), () => (optionalText(schedule.scheduleReason)))), () => (optionalText(schedule.reason))),
    },
  };
}

function firstPendingScheduledValidator(config: AnyRecord, progress: AnyRecord, timing: string, ref: string): AnyRecord | null {
  const schedules = resolveConfiguredValidatorSchedule(progress);
  for (const schedule of schedules) {
    if (!scheduleMatchesRef(schedule, timing, ref)) continue;
    if (isScheduledValidatorComplete(config, String(schedule.key))) continue;
    return buildValidatorNextStep(schedule, `progress_json_${timing}_${ref}`);
  }
  return null;
}

function mandatoryReviewFullLintSchedule(config: AnyRecord, progress: AnyRecord, gateId: string, gate: AnyRecord): AnyRecord | null {
  if (gate?.['type'] !== 'review') return null;
  if (!resolveStageOwner(config, 'validator.run', 'validator:full_lint')) return null;
  const targetModule = resolveGateTargetModule(progress, gateId);
  const reviewDefaults = getReviewDefaultsConfig(config);
  return {
    stage: 'validator:full_lint',
    timing: 'before',
    before: `gate:${gateId}`,
    ref: `gate:${gateId}`,
    scope: targetModule.moduleId ? 'module' : 'pipeline',
    mode: 'mandatory',
    key: `mandatory:before:gate:${gateId}:validator:full_lint`,
    gateId,
    moduleId: targetModule.moduleId,
    scheduleReason: 'mandatory_full_lint_before_review',
    validatorConfig: {
      tier: selectDefinedValue(() => (optionalText(gate?.lint_tier)), () => (reviewDefaults.lint_tier)),
    },
  };
}

export function findNextStep(config: AnyRecord, progress: AnyRecord, deps: AnyRecord = {}): AnyRecord {
  const executionOrder = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  const gates = recordOrEmpty(progress?.gates);
  for (let orderIndex = 0; orderIndex < executionOrder.length; orderIndex += 1) {
    const stepId = executionOrder[orderIndex];
    if (typeof stepId === 'string' && stepId.startsWith('validator:')) {
      const schedule = {
        stage: stepId,
        timing: 'inline',
        ref: stepId,
        scope: 'pipeline',
        mode: 'mandatory',
        key: `execution_order:${stepId}`,
        scheduleReason: 'execution_order',
      };
      if (!isScheduledValidatorComplete(config, String(schedule.key))) return buildValidatorNextStep(schedule, 'execution_order');
      continue;
    }

    if (stepId.startsWith('gate:')) {
      const gateId = stepId.replace('gate:', '');
      const gate = gates?.[gateId];
      const gateProjection = projectPipelineGateState(config, gateId, gate, deps);

      if (selectTruthyValue(() => (gateProjection?.scheduler_consumed === true), () => (gateProjection?.completed === true))) {
        const source = selectDefinedValue(() => (gateProjection?.completion_source), () => ('gate_read_model'));
        const status = selectDefinedValue(() => (gateProjection?.status), () => ('GATE_STATUS_CONSUMED'));
        logGateConsumedOnce(config, gateId, status, source);
        const afterConfigured = firstPendingScheduledValidator(config, progress, 'after', `gate:${gateId}`);
        if (afterConfigured) return afterConfigured;
        continue;
      }

      const beforeConfigured = firstPendingScheduledValidator(config, progress, 'before', `gate:${gateId}`);
      if (beforeConfigured) return beforeConfigured;

      const mandatoryFullLint = mandatoryReviewFullLintSchedule(config, progress, gateId, gate);
      if (mandatoryFullLint && !isScheduledValidatorComplete(config, String(mandatoryFullLint.key))) {
        return buildValidatorNextStep(mandatoryFullLint, mandatoryFullLint.scheduleReason);
      }

      return { type: 'gate', id: gateId };
    }

    if (selectTruthyValue(() => (typeof stepId !== 'string'), () => (!stepId.trim()))) {
      throw new Error(`Invalid execution_order step '${String(stepId)}': expected module id, module:<id>, gate:<id>, or validator:<id>`);
    }

    const moduleId = stepId.startsWith('module:') ? stepId.slice('module:'.length) : stepId;
    if (!moduleId) throw new Error(`Invalid execution_order step '${stepId}': module id is required`);
    const mod = progress.modules?.[moduleId];
    if (!mod) {
      throw new Error(`Invalid execution_order step '${String(stepId)}': no typed module/gate/validator target exists`);
    }
    const lifecycleModule = loadAuthoritativeModuleState(config, progress, moduleId);
    if (lifecycleModule?.status === STATUS.PASS) {
      const afterConfigured = firstPendingScheduledValidator(config, progress, 'after', `module:${moduleId}`);
      if (afterConfigured) return afterConfigured;
      continue;
    }
    if (lifecycleModule?.status === STATUS.BLOCKED) return { type: 'blocked', id: moduleId };
    if (lifecycleModule?.status === STATUS.FAIL) log('INFO', `Module ${moduleId} is FAIL (${Number(selectDefinedValue(() => (lifecycleModule.fail_count), () => (0)))} attempts) — will retry`);
    else if (lifecycleModule?.status && lifecycleModule.status !== STATUS.PENDING) log('INFO', `Module ${moduleId} resuming from ${lifecycleModule.status}`);
    const readyBatch = collectReadyModuleBatch(config, progress, deps, moduleOrderIndex(progress, moduleId));
    if (readyBatch.length > 1 && readyBatch[0] === moduleId) {
      log('INFO', `Running ready module batch: ${readyBatch.join(', ')}`);
      return { type: 'module_batch', ids: readyBatch };
    }
    return { type: 'module', id: moduleId };
  }
  return { type: 'done' };
}

function appendStartupDegradedEvidence(config: AnyRecord, evidence: unknown): void {
  const entries = Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
  if (entries.length === 0) return;
  if (!Array.isArray(config._startupDegradedEvidence)) config._startupDegradedEvidence = [];
  config._startupDegradedEvidence.push(...entries);
}

export async function preparePipeline(config: AnyRecord, progress: AnyRecord, deps: AnyRecord = {}) {
  try {
    const result = await releaseGateFiles(config, progress);
    appendStartupDegradedEvidence(config, result?.degraded);
  }
  catch (e) {
    const evidence = { code: 'blueprint_gate_release_failed', surface: 'release_gate_files', message: errorMessage(e) };
    appendStartupDegradedEvidence(config, evidence);
    log('WARN', `Gate files release failed (non-critical): ${errorMessage(e)}`);
  }

  try {
    const result = await syncControlFiles(config, progress);
    appendStartupDegradedEvidence(config, result?.degraded);
  }
  catch (e) {
    const evidence = { code: 'blueprint_control_sync_failed', surface: 'sync_control_files', message: errorMessage(e) };
    appendStartupDegradedEvidence(config, evidence);
    log('WARN', `Control file sync failed (non-critical): ${errorMessage(e)}`);
  }
}
