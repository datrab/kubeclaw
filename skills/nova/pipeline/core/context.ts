import { bindRunContext, createRunId, createRunStats } from './runtime.ts';
import { resolveStageOwner } from './registry-access.ts';
import { buildInvocationSnapshot } from '../services/correlation.ts';
import { cloneReadonlySnapshot, createReadonlySnapshot, deepClone } from '../services/serialization.ts';
import {
  createPluginContextShell,
} from './plugin-context-surfaces.ts';
import {
  installPluginContextCapabilities,
  PLUGIN_MODULE_CONFIG,
  requiredPluginCoordinates,
} from './plugin-context-assembly.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;
type NullableRecord = AnyRecord | null;
type PluginRecord = AnyRecord | null;

type PipelineContextInit = {
  config?: NullableRecord;
  progress?: any;
  runId?: string | null;
  novaChannel?: string | null;
  stats?: AnyRecord | null;
  logDir?: string | null;
  runLogDir?: string | null;
  pluginRegistry?: any;
  runtimeOverrides?: any;
};

type LogDirUpdate = {
  logDir?: string | null;
  runLogDir?: string | null;
};

type PipelineLogStreams = {
  pipelineLogFd?: AnyRecord | null;
  runPipelineLogFd?: AnyRecord | null;
};

type PluginContextOptions = {
  config?: NullableRecord;
  progress?: any;
  hookFamily?: string;
  stageId?: string;
  record?: PluginRecord;
  invocation?: AnyRecord;
  stateSnapshot?: AnyRecord | ((meta: AnyRecord) => any);
  environmentMetadata?: any;
  effects?: AnyRecord;
  injectedDeps?: any;
  signal?: any;
};

function contextRunIdAuthority(runId: string | null, config: NullableRecord) {
  const explicitRunId = nonEmptyString(runId);
  if (explicitRunId) return explicitRunId;
  const contextRunId = nonEmptyString(config?._runId);
  if (contextRunId) return contextRunId;
  const configRunId = nonEmptyString(config?.run_id);
  if (configRunId) return configRunId;
  return createRunId();
}

function contextStatsAuthority(stats: AnyRecord | null, config: NullableRecord) {
  const explicitStats = objectRecord(stats);
  if (explicitStats) return explicitStats;
  const configStats = objectRecord(config?._runStats);
  if (configStats) return configStats;
  return createRunStats();
}

function pluginOwnerAuthority(config: NullableRecord, hookFamilyId: string, stageIdValue: string, record: PluginRecord) {
  if (record) return record;
  return resolveStageOwner(config, hookFamilyId, stageIdValue);
}

export class PipelineContext {
  schemaVersion: 'pipeline-context-v1';
  config: NullableRecord;
  progress: any;
  runId: string;
  novaChannel: string | null;
  stats: AnyRecord;
  logDir: string | null;
  runLogDir: string | null;
  pluginRegistry: any;
  runtimeOverrides: any;
  _logModule: string | null;
  _logPhase: string | null;
  _logFd: any;
  _pipelineLogFd: any;
  _runPipelineLogFd: any;
  _pipelineLogPath: string | null;
  _runPipelineLogPath: string | null;
  _runLogFd: any;
  _tmpDir: string | null;

  constructor({
    config = null,
    progress = null,
    runId = null,
    novaChannel = null,
    stats = null,
    logDir = null,
    runLogDir = null,
    pluginRegistry = null,
    runtimeOverrides = null,
  }: PipelineContextInit = {}) {
    this.schemaVersion = 'pipeline-context-v1';
    this.config = config;
    this.progress = progress;
    this.runId = contextRunIdAuthority(runId, config);
    this.novaChannel = selectDefinedValue(() => (novaChannel), () => (null));
    this.stats = contextStatsAuthority(stats, config);
    this.logDir = selectTruthyValue(() => (logDir), () => (null));
    this.runLogDir = selectTruthyValue(() => (runLogDir), () => (null));
    this.pluginRegistry = selectTruthyValue(() => (pluginRegistry), () => (null));
    this.runtimeOverrides = selectTruthyValue(() => (runtimeOverrides), () => (null));

    this._logModule = null;
    this._logPhase = null;
    this._logFd = null;
    this._pipelineLogFd = null;
    this._runPipelineLogFd = null;
    this._pipelineLogPath = null;
    this._runPipelineLogPath = null;
    this._runLogFd = null;
    this._tmpDir = null;
  }

  setLogDirs({ logDir = null, runLogDir = null }: LogDirUpdate = {}) {
    if (logDir !== null) this.logDir = logDir;
    if (runLogDir !== null) this.runLogDir = runLogDir;
    return this;
  }

  setPipelineLogStreams({ pipelineLogFd = null, runPipelineLogFd = null }: PipelineLogStreams = {}) {
    this._pipelineLogFd = pipelineLogFd;
    this._runPipelineLogFd = runPipelineLogFd;
    this._pipelineLogPath = nonEmptyString(pipelineLogFd?.path);
    this._runPipelineLogPath = nonEmptyString(runPipelineLogFd?.path);
    this._logFd = pipelineLogFd;
    this._runLogFd = runPipelineLogFd;
    return this;
  }

  setTempDir(tmpDir: string | null = null) {
    this._tmpDir = tmpDir;
    return this;
  }

  runtimeStateSnapshot() {
    return createReadonlySnapshot({
      schemaVersion: this.schemaVersion,
      runId: this.runId,
      novaChannel: this.novaChannel,
      logDir: this.logDir,
      runLogDir: this.runLogDir,
      hasPluginRegistry: Boolean(this.pluginRegistry),
      hasRuntimeOverrides: Boolean(this.runtimeOverrides),
      stats: deepClone(this.stats),
    });
  }
}

function isPipelineContext(value: any) {
  return selectTruthyValue(() => (value instanceof PipelineContext), () => (value?.schemaVersion === 'pipeline-context-v1'));
}

function hasCapability(capabilities: any, capability: string) {
  return Array.isArray(capabilities) && capabilities.includes(capability);
}

function nonEmptyString(value: any): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function objectRecord(value: any): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function resolveStateSnapshot(stateSnapshot: any, meta: AnyRecord) {
  if (typeof stateSnapshot === 'function') return stateSnapshot(meta);
  return selectDefinedValue(() => (objectRecord(stateSnapshot)), () => ({ state: 'snapshot_absent' }));
}

function buildEnvironmentContext(config: NullableRecord = {}, record: PluginRecord = {}, metadata: any = undefined) {
  return {
    project: selectDefinedValue(() => (nonEmptyString(config?.project)), () => ('missing_project')),
    runtime: 'pipeline',
    trustTier: selectDefinedValue(() => (selectDefinedValue(() => (nonEmptyString(record?.resolvedTrustTier)), () => (nonEmptyString(record?.manifest?.trustTier)))), () => ('missing_trust_tier')),
    sourceType: selectDefinedValue(() => (nonEmptyString(record?.manifest?.sourceType)), () => ('missing_source_type')),
    ...(metadata !== undefined ? { metadata: deepClone(metadata) } : {}),
  };
}

function invocationSnapshotReader(config: AnyRecord, hookFamily: string, stageId: string, invocation: AnyRecord) {
  return () => (buildInvocationSnapshot as any)({
    config,
    hookFamily,
    stageId,
    invocation,
  });
}


export function createPipelineContext(init: PipelineContextInit = {}) {
  const ctx = new PipelineContext(init);

  bindRunContext(ctx.config, ctx as any);
  return ctx;
}

export function narrowPluginInputForCapabilities(input: any = {}, capabilities: any[] = []) {
  const narrowed = (input && typeof input === 'object' ? cloneReadonlySnapshot(input) : {}) as AnyRecord;
  if (!hasCapability(capabilities, 'read.artifacts')) {
    delete narrowed.artifacts;
    delete narrowed.summaries;
    delete narrowed.priorResults;
  }
  if (!hasCapability(capabilities, 'notify.operator')) {
    delete narrowed.presentation;
  }
  return createReadonlySnapshot(narrowed);
}

export function buildPluginInvocationEnvelope(input: any = {}, pluginContext: any = null, extras: any = {}) {
  const contextCapabilities = Array.isArray(pluginContext?.capabilities) ? pluginContext.capabilities : [];
  const baseInput = pluginContext
    ? narrowPluginInputForCapabilities(input, contextCapabilities)
    : createReadonlySnapshot(input && typeof input === 'object' ? input : {});
  const pluginConfig = pluginContext ? objectRecord(pluginContext[PLUGIN_MODULE_CONFIG]) : null;
  const pluginInfo = pluginContext ? {
    schemaVersion: 'v1',
    moduleId: selectDefinedValue(() => (pluginContext.moduleId), () => (null)),
    hookFamily: selectDefinedValue(() => (pluginContext.hookFamily), () => (null)),
    stageId: selectDefinedValue(() => (pluginContext.stageId), () => (null)),
    config: deepClone(selectDefinedValue(() => (pluginConfig), () => ({}))),
  } : null;
  const baseInputRecord = baseInput as AnyRecord;
  const envelopeInput = createReadonlySnapshot(pluginInfo ? { ...baseInputRecord, plugin: pluginInfo } : baseInputRecord) as AnyRecord;
  const safeExtras = (pluginContext
    ? narrowPluginInputForCapabilities(extras, contextCapabilities)
    : (extras && typeof extras === 'object' ? cloneReadonlySnapshot(extras) : {})) as AnyRecord;
  return createReadonlySnapshot({
    ...envelopeInput,
    ...safeExtras,
    input: envelopeInput,
  });
}

export function createPluginContext({
  config,
  progress = null,
  hookFamily,
  stageId,
  record = null,
  invocation = {},
  stateSnapshot = {},
  environmentMetadata = undefined,
  effects = {},
  injectedDeps = null,
  signal = null,
}: PluginContextOptions = {}) {
  const coordinates = requiredPluginCoordinates({ config, hookFamily, stageId });
  const { hookFamilyId, stageIdValue } = coordinates;
  config = coordinates.config;

  const resolvedRecord = pluginOwnerAuthority(config, hookFamilyId, stageIdValue, record);
  if (!resolvedRecord) {
    throw new Error(`No registered plugin owner found for hookFamily '${hookFamilyId}' stage '${stageIdValue}'`);
  }

  const moduleId = resolvedRecord.manifest.moduleId;
  const capabilities = Array.isArray(resolvedRecord.manifest.capabilities) ? [...resolvedRecord.manifest.capabilities] : [];
  const readonlyModuleConfigSnapshot = createReadonlySnapshot(
    objectRecord(resolvedRecord.config) ?? {}
  );
  const meta = {
    config,
    progress,
    record: resolvedRecord,
    hookFamily: hookFamilyId,
    stageId: stageIdValue,
    moduleId,
    capabilities,
    invocation,
  };

  const getInvocationSnapshot = invocationSnapshotReader(config, hookFamilyId, stageIdValue, invocation);

  const pluginContext: AnyRecord = createPluginContextShell({
    moduleId,
    hookFamilyId,
    stageIdValue,
    capabilities,
    readInvocation: async () => deepClone(getInvocationSnapshot()),
    readStateSnapshot: async () => deepClone(await resolveStateSnapshot(stateSnapshot, meta)),
    readEnvironment: async () => deepClone(buildEnvironmentContext(config, resolvedRecord, environmentMetadata)),
    readModuleConfig: async () => readonlyModuleConfigSnapshot,
  });

  installPluginContextCapabilities({
    pluginContext,
    readonlyModuleConfigSnapshot,
    resolvedRecord,
    runtime: { config, progress, injectedDeps, signal },
    meta,
    effects,
    capabilities,
    getInvocationSnapshot,
  });

  return pluginContext;
}
