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
import { getArchValidationConfig } from '../services/runtime-defaults.ts';

export { isScheduledValidatorComplete, markScheduledValidatorComplete };

type AnyRecord = Record<string, any>;

const EXECUTION_FAILED_VALIDATOR_POLICY = Object.freeze({ nextAction: 'block', issueType: 'environment', outcomeClass: 'execution_failed' });

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildGeneratorStateSnapshot(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}, deps: AnyRecord = {}) {
  const moduleStatuses = Object.entries(progress?.modules ?? {}).map(([moduleId, mod = {}]: [string, any]) => {
    void mod;
    const authoritative = loadAuthoritativeModuleState(config, progress, moduleId);
    return authoritative?.status ?? STATUS.PENDING;
  });
  const gateStatuses = Object.keys(progress?.gates ?? {}).map((gateId: string) => {
    const gate = progress.gates[gateId] ?? null;
    const gateProjection = projectPipelineGateState(config, gateId, gate, deps);
    return gateProjection?.status ?? 'PENDING';
  });

  return {
    pipeline: {
      project: config?.project ?? null,
      run_id: getRunId(config),
      terminal_status: opts.terminalStatus ?? null,
      terminal_decision: opts.terminalDecision ?? null,
      reason_code: opts.reasonCode ?? null,
      schedule_reason: opts.scheduleReason ?? null,
      mode: opts.mode ?? 'full',
    },
    modules: {
      total: Object.keys(progress?.modules ?? {}).length,
      status_counts: countByStatus(moduleStatuses),
    },
    gates: {
      total: Object.keys(progress?.gates ?? {}).length,
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
  const generatorType = String(stageId || '').split(':')[1] || stageId || 'unknown';
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
      scheduleReason: opts.scheduleReason || null,
      mode: opts.mode || 'full',
      terminalStatus: opts.terminalStatus ?? null,
      terminalDecision: opts.terminalDecision ?? null,
      reasonCode: opts.reasonCode || null,
      orderIndex: opts.orderIndex ?? null,
    },
  };
}

function buildGeneratorPluginInvocation(stageId: string, opts: AnyRecord = {}) {
  return buildStagePluginInvocation(stageId, {
    moduleId: opts.moduleId || null,
    gateId: opts.gateId || null,
    causationRef: opts.causationRef || null,
  });
}

function buildValidatorStateSnapshot(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}, deps: AnyRecord = {}) {
  return {
    pipeline: {
      project: config?.project || null,
      run_id: getRunId(config),
      resume: opts.resume === true,
      arch_validation_enabled: opts.archEnabled !== false,
      has_started_modules: opts.hasStartedModules === true,
    },
    modules: {
      total: Object.keys(progress?.modules || {}).length,
      started: hasAnyStartedModules(config, progress, deps),
    },
    gates: {
      total: Object.keys(progress?.gates || {}).length,
    },
  };
}

function buildValidatorRunInput(config: AnyRecord, progress: AnyRecord, stageId: string, opts: AnyRecord = {}, deps: AnyRecord = {}) {
  const runId = getRunId(config);
  const validatorName = String(stageId || '').split(':')[1] || stageId || 'unknown';
  const moduleId = opts.moduleId || null;
  const gateId = opts.gateId || null;
  const moduleConfig = moduleId ? progress?.modules?.[moduleId] || null : null;
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
      scope: opts.scope || (moduleId ? 'module' : (gateId ? 'gate' : 'run')),
      stageId,
      ...(moduleId ? { moduleId, moduleDir: moduleConfig?.dir || null } : {}),
      ...(gateId ? { gateId } : {}),
    },
    validator: {
      validatorType: validatorName,
      config: stageConfig,
    },
    module: moduleId ? {
      moduleId,
      dir: moduleConfig?.dir || null,
      title: moduleConfig?.title || null,
      config: moduleConfig || {},
      status: moduleState || null,
    } : null,
    gate: gateId ? {
      gateId,
      config: progress?.gates?.[gateId] || null,
    } : null,
    artifacts: [],
    stateSnapshot: buildValidatorStateSnapshot(config, progress, opts, deps),
    executionContext: {
      resume: opts.resume === true,
      hasStartedModules: opts.hasStartedModules === true,
      archEnabled: opts.archEnabled !== false,
      ...(moduleConfig?.dir ? { moduleDir: moduleConfig.dir } : {}),
      scheduleKey: opts.scheduleKey || null,
      scheduleReason: opts.scheduleReason || null,
      orderIndex: opts.orderIndex ?? null,
    },
  };
}

function buildValidatorPluginInvocation(stageId: string, opts: AnyRecord = {}) {
  return buildStagePluginInvocation(stageId, {
    resume: opts.resume === true,
    moduleId: opts.moduleId || null,
    gateId: opts.gateId || null,
    causationRef: opts.causationRef || null,
  });
}

function validateArchitectureValidatorControlResult(result: AnyRecord, stageId = 'validator:architecture') {
  const errors = validateTypedValidatorControlResult(result, {
    producerType: 'architecture',
    stageId,
    allowedNextActions: ['pass', 'block'],
  });
  if (typeof stageId === 'string' && stageId === 'validator:architecture') {
    const metadata = result?.diagnostics?.metadata || result?.diagnostics?.typed?.validator?.metadata || {};
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
      stageId: opts.stageId || 'validator:architecture',
      hookFamily: 'validator.run',
      moduleId: opts.moduleId || null,
      producerKind: 'validator',
      producerType: 'architecture',
      validationErrors: errors,
      rawResult,
      coercedResult: controlResult,
      input: opts.input || null,
      invocation: opts.pluginInvocation || null,
    });
  }
  return controlResult;
}

function validatorProducerType(stageId = ''): string {
  return String(stageId || '').split(':')[1] || stageId || 'unknown';
}

function isArchitectureValidatorStage(stageId = ''): boolean {
  return stageId === 'validator:architecture';
}

function buildFailedValidatorControlResult(config: AnyRecord, stageId: string, opts: AnyRecord = {}) {
  if (isArchitectureValidatorStage(stageId)) {
    return buildArchitectureValidatorControlResult(config, { blocked: true, findings: [] }, opts);
  }
  return buildModuleValidatorControlResult(config, {
    passed: false,
    blocked: true,
    error: opts.error || 'unknown validator execution error',
  }, {
    ...opts,
    producerType: validatorProducerType(stageId),
    stageId,
    scope: opts.scope || 'pipeline',
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
    moduleId: opts.moduleId || null,
    input: opts.input || null,
    invocation: opts.pluginInvocation || null,
  });
}

export function projectValidatorControlResultToStepResult(config: AnyRecord, controlResult: AnyRecord = {}, opts: AnyRecord = {}) {
  const stageId = opts.stageId || `validator:${controlResult?.producerType || 'unknown'}`;
  const stepId = opts.stepId || stageId;
  const validatorOutcomeClass = controlResult?.diagnostics?.typed?.validator?.outcomeClass;
  const typedValidatorMetadata = controlResult?.diagnostics?.typed?.validator?.metadata || {};
  const validatorMetadata = controlResult?.diagnostics?.metadata || {};
  const invalidOrExecutionFailed = typedValidatorMetadata?.contract_invalid === true
    || typedValidatorMetadata?.execution_failed === true
    || validatorMetadata?.contract_invalid === true
    || validatorMetadata?.execution_failed === true;
  const outcome = invalidOrExecutionFailed ? PIPELINE_STEP_OUTCOMES.ERROR
    : validatorOutcomeClass === 'blocked' ? PIPELINE_STEP_OUTCOMES.BLOCKED
    : controlResult?.nextAction === 'pass' ? PIPELINE_STEP_OUTCOMES.PASSED
      : PIPELINE_STEP_OUTCOMES.ERROR;
  const terminalAction = outcome === PIPELINE_STEP_OUTCOMES.PASSED ? PIPELINE_TERMINAL_ACTIONS.NONE
    : outcome === PIPELINE_STEP_OUTCOMES.BLOCKED ? PIPELINE_TERMINAL_ACTIONS.NOTIFY_OPERATOR
      : PIPELINE_TERMINAL_ACTIONS.STOP;
  const correlation = {
    run_id: config?._runId ?? config?.run_id ?? getRunId(config) ?? null,
    validator_stage_id: stageId,
    validator_type: controlResult?.producerType || validatorProducerType(stageId),
    schedule_key: opts.scheduleKey || null,
    module_id: opts.moduleId || null,
    gate_id: opts.gateId || null,
  };

  if (controlResult?.nextAction === 'request_fix') {
    const requestFixOutcome = invalidOrExecutionFailed ? PIPELINE_STEP_OUTCOMES.ERROR : PIPELINE_STEP_OUTCOMES.NEEDS_NOVA;
    const requestFixTerminalAction = invalidOrExecutionFailed ? PIPELINE_TERMINAL_ACTIONS.STOP : PIPELINE_TERMINAL_ACTIONS.REQUEST_HANDOFF;
    return buildPipelineStepResult({
      stepType: PIPELINE_STEP_TYPES.VALIDATOR,
      stepId,
      nextAction: PIPELINE_STEP_ACTIONS.HALT,
      outcome: requestFixOutcome,
      issueType: controlResult.issueType || 'code',
      summary: controlResult?.diagnostics?.summary || 'Validator requested a fix',
      diagnostics: {
        findings: controlResult?.diagnostics?.findings || [],
        metadata: controlResult?.diagnostics?.metadata || {},
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

export function validateGeneratorExecutionResult(result: AnyRecord, stageId = 'generator:unknown') {
  const expectedProducerType = String(stageId || '').split(':')[1] || stageId || 'unknown';
  const errors = validateGeneratorResult(result, {
    producerType: expectedProducerType,
    stageId,
  });
  if (result?.outputs && typeof result.outputs === 'object' && !Array.isArray(result.outputs)
    && (typeof result.outputs.status !== 'string' || !result.outputs.status.trim())) {
    errors.push('outputs.status must be a non-empty string');
  }
  return errors;
}

function normalizeGeneratorExecutionResult(rawResult: unknown, stageId = 'generator:unknown', opts: AnyRecord = {}) {
  const producerType = String(stageId || '').split(':')[1] || stageId || 'unknown';
  const generatorResult = normalizeGeneratorResult(rawResult, {
    producerType,
    label: `Generator '${stageId}'`,
    stageId,
    moduleId: opts.moduleId || null,
    input: opts.input || null,
    invocation: opts.pluginInvocation || null,
  });
  const errors: string[] = [];
  if (typeof generatorResult.outputs.status !== 'string' || !generatorResult.outputs.status.trim()) {
    errors.push('outputs.status must be a non-empty string');
  }
  if (errors.length > 0) {
    throw createContractInvalidError(`Generator '${stageId}' returned invalid result: ${errors.join('; ')}`, {
      label: `Generator '${stageId}'`,
      stageId,
      hookFamily: 'generator.run',
      moduleId: opts.moduleId || null,
      producerKind: 'generator',
      producerType,
      validationErrors: errors,
      rawResult,
      coercedResult: generatorResult,
      input: opts.input || null,
      invocation: opts.pluginInvocation || null,
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
      error: errorMessage(error) || 'unknown validator registry resolution error',
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
    signal: opts.signal || null,
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
      error: errorMessage(error) || 'unknown validator execution error',
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
      producerType: String(stageId || '').split(':')[1] || stageId || 'unknown',
      outputs: {
        status: 'failed',
      },
      diagnostics: {
        error: errorMessage(error) || 'unknown generator registry resolution error',
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
      scheduleReason: opts.scheduleReason || null,
      mode: opts.mode || 'full',
      terminalStatus: opts.terminalStatus ?? null,
      terminalDecision: opts.terminalDecision ?? null,
      reasonCode: opts.reasonCode || null,
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
    const message = errorMessage(error) || 'unknown';
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
  if (!ref || typeof ref !== 'string') return null;
  const normalized = ref.trim();
  if (!normalized) return null;
  if (normalized.startsWith('module:') || normalized.startsWith('gate:') || normalized.startsWith('validator:')) return normalized;
  if (progress?.modules?.[normalized]) return `module:${normalized}`;
  if (progress?.gates?.[normalized]) return `gate:${normalized}`;
  return normalized;
}

function normalizeValidatorScheduleEntry(progress: AnyRecord, entry: AnyRecord = {}, index = 0): AnyRecord | null {
  const stage = entry.stage || entry.validator || entry.validator_stage || entry.id || null;
  if (!stage || typeof stage !== 'string' || !stage.startsWith('validator:')) return null;
  const after = normalizeScheduleRef(progress, entry.after || entry.after_step || null);
  const before = normalizeScheduleRef(progress, entry.before || entry.before_step || null);
  const timing = before ? 'before' : (after ? 'after' : 'inline');
  const ref = before || after || `schedule:${index}`;
  const scope = entry.scope || 'pipeline';
  const key = entry.key || `${timing}:${ref}:${stage}:${scope}:${index}`;
  return {
    ...entry,
    stage,
    after,
    before,
    timing,
    ref,
    scope,
    key,
    orderIndex: entry.orderIndex ?? entry.order_index ?? index,
    mode: entry.mode || 'mandatory',
  };
}

export function resolveConfiguredValidatorSchedule(progress: AnyRecord = {}): AnyRecord[] {
  const rawSchedule = Array.isArray(progress?.validators?.schedule) ? progress.validators.schedule : [];
  return rawSchedule
    .map((entry: any, index: number) => normalizeValidatorScheduleEntry(progress, entry, index))
    .filter(Boolean);
}

function normalizeExecutionModuleId(progress: AnyRecord, stepId: unknown): string | null {
  if (typeof stepId !== 'string' || !stepId.trim() || stepId.startsWith('gate:') || stepId.startsWith('validator:')) return null;
  const moduleId = stepId.startsWith('module:') ? stepId.slice('module:'.length) : stepId;
  if (!moduleId) return null;
  return progress?.modules?.[moduleId] ? moduleId : null;
}

function moduleDependsOnAny(progress: AnyRecord, moduleId: string, blockedDependencyIds: Set<string>): boolean {
  const dependsOn = Array.isArray(progress?.modules?.[moduleId]?.depends_on) ? progress.modules[moduleId].depends_on : [];
  return dependsOn.some((dependency: string) => blockedDependencyIds.has(String(dependency || '').replace(/^module:/, '')));
}

function moduleIsReadyForBatch(config: AnyRecord, progress: AnyRecord, moduleId: string, deps: AnyRecord = {}, blockedDependencyIds = new Set<string>()): boolean {
  const lifecycleModule = loadAuthoritativeModuleState(config, progress, moduleId);
  if (lifecycleModule?.status === STATUS.PASS || lifecycleModule?.status === STATUS.BLOCKED) return false;
  if (moduleDependsOnAny(progress, moduleId, blockedDependencyIds)) return false;
  const dependencyChecker = deps.checkDependencies || checkModuleDependencies;
  const dependencyState = dependencyChecker(config, progress, moduleId);
  return dependencyState?.met === true;
}

function collectReadyModuleBatch(config: AnyRecord, progress: AnyRecord, deps: AnyRecord = {}, startIndex = 0): string[] {
  const executionOrder = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  const batch: string[] = [];
  const batchIds = new Set<string>();
  for (let index = startIndex; index < executionOrder.length; index += 1) {
    const moduleId = normalizeExecutionModuleId(progress, executionOrder[index]);
    if (!moduleId) break;
    if (!moduleIsReadyForBatch(config, progress, moduleId, deps, batchIds)) {
      if (batch.length > 0) break;
      continue;
    }
    batch.push(moduleId);
    batchIds.add(moduleId);
  }
  return batch;
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
      scheduleReason: reason || schedule.scheduleReason || schedule.reason || null,
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
      tier: gate?.lint_tier || 'full',
    },
  };
}

export function findNextStep(config: AnyRecord, progress: AnyRecord, deps: AnyRecord = {}): AnyRecord {
  const executionOrder = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  const gates = progress?.gates || null;
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

      if (gateProjection?.scheduler_consumed === true || gateProjection?.completed === true) {
        const source = gateProjection?.completion_source ?? gateProjection?.projection_source ?? 'gate_read_model';
        const status = gateProjection?.status || 'CONSUMED';
        log('INFO', `Gate '${gateId}' already consumed via gate read model (${status}, source=${source}) — skipping`);
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

    if (typeof stepId !== 'string' || !stepId.trim()) {
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
    if (lifecycleModule?.status === STATUS.FAIL) log('INFO', `Module ${moduleId} is FAIL (${lifecycleModule.fail_count || 0} attempts) — will retry`);
    else if (lifecycleModule?.status && lifecycleModule.status !== STATUS.PENDING) log('INFO', `Module ${moduleId} resuming from ${lifecycleModule.status}`);
    const readyBatch = collectReadyModuleBatch(config, progress, deps, orderIndex);
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
  const releaseGateFilesFn = deps.releaseGateFiles || releaseGateFiles;
  const syncControlFilesFn = deps.syncControlFiles || syncControlFiles;

  try {
    const result = await releaseGateFilesFn(config, progress);
    appendStartupDegradedEvidence(config, result?.degraded);
  }
  catch (e) {
    const evidence = { code: 'blueprint_gate_release_failed', surface: 'release_gate_files', message: errorMessage(e) };
    appendStartupDegradedEvidence(config, evidence);
    log('WARN', `Gate files release failed (non-critical): ${errorMessage(e)}`);
  }

  try {
    const result = await syncControlFilesFn(config, progress);
    appendStartupDegradedEvidence(config, result?.degraded);
  }
  catch (e) {
    const evidence = { code: 'blueprint_control_sync_failed', surface: 'sync_control_files', message: errorMessage(e) };
    appendStartupDegradedEvidence(config, evidence);
    log('WARN', `Control file sync failed (non-critical): ${errorMessage(e)}`);
  }
}
