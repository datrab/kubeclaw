import { STATUS } from '../core/constants.ts';
import { getRunId } from '../core/runtime.ts';
import { loadAuthoritativeModuleState, hasAnyStartedModules, projectPipelineGateState } from './pipeline-runner-shared.ts';
import { buildStagePluginInvocation, buildStageRefs } from './stage-envelope-primitives.ts';
import { countByStatus, buildGeneratorArtifactRefs } from './pipeline-runner-scheduling/snapshots.ts';
import { getArchValidationConfig } from '../services/runtime-defaults.ts';
import { selectDefinedValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function recordOrEmpty(value: unknown): AnyRecord {
  return isRecord(value) ? value : {};
}

function keysOf(value: unknown): string[] {
  return Object.keys(recordOrEmpty(value));
}

function entriesOf(value: unknown): [string, any][] {
  return Object.entries(recordOrEmpty(value));
}

export function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredText(value: unknown, field: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${field}: required non-empty string`);
  return text;
}

export function requiredGeneratorMode(opts: AnyRecord): string {
  return requiredText(opts.mode, 'generator.mode');
}

export function stageTypeFromStageId(stageId: string, field: string): string {
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

export function buildGeneratorRunInput(config: AnyRecord, progress: AnyRecord, stageId: string, opts: AnyRecord = {}, deps: AnyRecord = {}) {
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

export function buildGeneratorPluginInvocation(stageId: string, opts: AnyRecord = {}) {
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

function validatorStageConfig(config: AnyRecord, progress: AnyRecord, stageId: string, validatorName: string, opts: AnyRecord) {
  const layers = [
    stageId === 'validator:architecture' ? getArchValidationConfig(config) : null,
    stageId === 'validator:architecture' ? recordOrEmpty(progress?.arch_validation) : null,
    recordOrEmpty(config?.validators?.[validatorName]),
    recordOrEmpty(progress?.validators?.config?.[validatorName]),
    recordOrEmpty(opts.validatorConfig),
  ];
  return Object.assign({}, ...layers.filter(Boolean));
}

function validatorScope(opts: AnyRecord, moduleId: string | null, gateId: string | null) {
  if (optionalText(opts.scope)) return optionalText(opts.scope);
  if (moduleId) return 'module';
  if (gateId) return 'gate';
  return 'run';
}

function validatorTarget(progress: AnyRecord, moduleId: string | null, gateId: string | null, moduleConfig: AnyRecord | null, moduleState: AnyRecord | null) {
  return {
    module: moduleId ? { moduleId, dir: moduleConfig?.dir ?? null, title: moduleConfig?.title ?? null, config: recordOrEmpty(moduleConfig), status: moduleState ?? null } : null,
    gate: gateId ? { gateId, config: progress?.gates?.[gateId] ?? null } : null,
  };
}

export function buildValidatorRunInput(config: AnyRecord, progress: AnyRecord, stageId: string, opts: AnyRecord = {}, deps: AnyRecord = {}) {
  const runId = getRunId(config);
  const validatorName = stageTypeFromStageId(stageId, 'validator.stageId');
  const moduleId = optionalText(opts.moduleId);
  const gateId = optionalText(opts.gateId);
  const moduleConfig = moduleId ? (selectDefinedValue(() => (progress?.modules?.[moduleId]), () => (null))) : null;
  const moduleState = moduleId
    ? loadAuthoritativeModuleState(config, progress, moduleId)
    : null;
  const stageConfig = validatorStageConfig(config, progress, stageId, validatorName, opts);
  const target = validatorTarget(progress, moduleId, gateId, moduleConfig, moduleState);

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
      scope: validatorScope(opts, moduleId, gateId),
      stageId,
      ...(moduleId ? { moduleId, moduleDir: selectDefinedValue(() => (moduleConfig?.dir), () => (null)) } : {}),
      ...(gateId ? { gateId } : {}),
    },
    validator: {
      validatorType: validatorName,
      config: stageConfig,
    },
    module: target.module,
    gate: target.gate,
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

export function buildValidatorPluginInvocation(stageId: string, opts: AnyRecord = {}) {
  return buildStagePluginInvocation(stageId, {
    resume: opts.resume === true,
    moduleId: optionalText(opts.moduleId),
    gateId: optionalText(opts.gateId),
    causationRef: optionalText(opts.causationRef),
  });
}
