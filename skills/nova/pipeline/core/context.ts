import { bindRunContext, createRunId, createRunStats, createEffectReceipt } from './runtime.ts';
import { resolveStageOwner } from './registry.ts';
import { buildInvocationSnapshot } from '../services/correlation.ts';
import { createPluginArtifactsApi } from '../services/artifact-bundle.ts';
import { appendStructuredEvent } from '../services/observability.ts';
import { emitTelemetryStreamEvent } from '../services/telemetry-stream.ts';
import { cloneReadonlySnapshot, createReadonlySnapshot, deepClone } from '../services/serialization.ts';
import { discord } from '../integrations/discord.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
const PLUGIN_MODULE_CONFIG = Symbol('PluginContextV1.moduleConfig');

type AnyRecord = Record<string, any>;
type NullableRecord = AnyRecord | null;
type PluginRecord = AnyRecord | null;
type EffectHandlerMap = Record<string, any>;

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

type ReceiptMethodOptions = {
  moduleId: string;
  stageId: string;
  surfaceName: string;
  handler?: ((input?: any) => any) | null;
  allowDefaultReceipt?: boolean;
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
  if (objectRecord(stats)) return stats;
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
    this._pipelineLogPath = selectTruthyValue(() => (pipelineLogFd?.path), () => (null));
    this._runPipelineLogPath = selectTruthyValue(() => (runPipelineLogFd?.path), () => (null));
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

export function isPipelineContext(value: any) {
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

function createMissingSurfaceError(moduleId: string, stageId: string, surfaceName: string) {
  return new Error(`PluginContextV1 surface '${surfaceName}' is scaffolded but not wired yet for module '${moduleId}' at stage '${stageId}'`);
}

function buildReceiptMethod({ moduleId, stageId, surfaceName, handler, allowDefaultReceipt = true }: ReceiptMethodOptions) {
  return async (request: AnyRecord = {}) => {
    if (typeof handler !== 'function') {
      throw createMissingSurfaceError(moduleId, stageId, surfaceName);
    }
    const result = await handler({ request: deepClone(request) });
    if (result === undefined) {
      if (!allowDefaultReceipt) {
        throw new Error(`PluginContextV1 surface '${surfaceName}' did not return the required result payload for module '${moduleId}' at stage '${stageId}'`);
      }
      return createEffectReceipt({ dedupeKey: request?.dedupeKey });
    }
    return deepClone(result);
  };
}

function resolveEffectHandlers(effects: AnyRecord = {}) {
  const resolvedEffects = selectDefinedValue(() => (objectRecord(effects)), () => ({}));
  return {
    artifacts: selectDefinedValue(() => (objectRecord(resolvedEffects.artifacts)), () => ({})),
    stream: selectDefinedValue(() => (objectRecord(resolvedEffects.stream)), () => ({})),
    telemetry: selectDefinedValue(() => (objectRecord(resolvedEffects.telemetry)), () => ({})),
    waits: selectDefinedValue(() => (objectRecord(resolvedEffects.waits)), () => ({})),
    signals: selectDefinedValue(() => (objectRecord(resolvedEffects.signals)), () => ({})),
    notify: selectDefinedValue(() => (objectRecord(resolvedEffects.notify)), () => ({})),
    workerRuntime: selectDefinedValue(() => (objectRecord(resolvedEffects.workerRuntime)), () => ({})),
  };
}

function createDefaultStreamEmitHandler(meta: AnyRecord, getInvocationSnapshot: () => AnyRecord) {
  return async ({ request = {} }: { request?: AnyRecord } = {}) => {
    const normalizedRequest = selectDefinedValue(() => (objectRecord(request)), () => ({}));
    const payload = {
      level: selectDefinedValue(() => (nonEmptyString(normalizedRequest.level)?.toUpperCase()), () => ('INFO')),
      message: selectDefinedValue(() => (normalizedRequest.message), () => (null)),
      data: deepClone(selectDefinedValue(() => (selectDefinedValue(() => (normalizedRequest.data), () => (normalizedRequest.payload))), () => (null))),
      hook_family: meta.hookFamily,
      stage_id: meta.stageId,
      module_id: meta.moduleId,
      invocation: getInvocationSnapshot(),
    };
    appendStructuredEvent(meta.config, selectDefinedValue(() => (nonEmptyString(normalizedRequest.eventType)), () => ('plugin.stream')), payload);
  };
}

function createDefaultTelemetryEmitHandler(meta: AnyRecord) {
  return async ({ request = {} }: { request?: AnyRecord } = {}) => {
    const normalizedRequest = selectDefinedValue(() => (objectRecord(request)), () => ({}));
    const telemetryPayload = selectDefinedValue(() => (selectDefinedValue(() => (objectRecord(normalizedRequest.payload)), () => (objectRecord(normalizedRequest.data)))), () => ({}));
    await emitTelemetryStreamEvent(
      meta.config,
      selectDefinedValue(() => (selectDefinedValue(() => (nonEmptyString(normalizedRequest.eventType)), () => (nonEmptyString(normalizedRequest.type)))), () => ('plugin.telemetry')),
      {
        hook_family: meta.hookFamily,
        stage_id: meta.stageId,
        module_id: meta.moduleId,
        ...deepClone(telemetryPayload),
      },
      {
        runId: selectDefinedValue(() => (selectDefinedValue(() => (meta.config?._runId), () => (meta.config?.run_id))), () => (null)),
        emitter: 'nova/pipeline/core/context',
      },
    );
  };
}

function createDefaultNotifyOperatorHandler(meta: AnyRecord, getInvocationSnapshot: () => AnyRecord) {
  return async ({ request = {} }: { request?: AnyRecord } = {}) => {
    const normalizedRequest = selectDefinedValue(() => (objectRecord(request)), () => ({}));
    const notificationTitle = selectDefinedValue(() => (nonEmptyString(normalizedRequest.title)), () => (`Plugin operator notification: ${meta.stageId}`));
    const notificationDescription = selectDefinedValue(() => (selectDefinedValue(() => (nonEmptyString(normalizedRequest.description)), () => (nonEmptyString(normalizedRequest.message)))), () => (''));
    const invocationIds = selectDefinedValue(() => (objectRecord(getInvocationSnapshot().ids)), () => ({}));
    await discord(
      meta.config,
      selectDefinedValue(() => (selectDefinedValue(() => (nonEmptyString(normalizedRequest.level)?.toUpperCase()), () => (nonEmptyString(normalizedRequest.severity)?.toUpperCase()))), () => ('INFO')),
      notificationTitle,
      notificationDescription,
      Array.isArray(normalizedRequest.fields)
        ? normalizedRequest.fields
        : [
            { name: 'Stage', value: meta.stageId, inline: true },
            { name: 'Plugin', value: meta.moduleId, inline: true },
            ...(normalizedRequest.message && !normalizedRequest.description ? [{ name: 'Message', value: String(normalizedRequest.message), inline: false }] : []),
            { name: 'Invocation', value: JSON.stringify(invocationIds), inline: false },
          ],
    );
  };
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
  if (!config) throw new Error('createPluginContext requires config');
  if (selectTruthyValue(() => (typeof hookFamily !== 'string'), () => (!hookFamily.trim()))) throw new Error('createPluginContext requires hookFamily');
  if (selectTruthyValue(() => (typeof stageId !== 'string'), () => (!stageId.trim()))) throw new Error('createPluginContext requires stageId');
  const hookFamilyId = hookFamily;
  const stageIdValue = stageId;

  const resolvedRecord = pluginOwnerAuthority(config, hookFamilyId, stageIdValue, record);
  if (!resolvedRecord) {
    throw new Error(`No registered plugin owner found for hookFamily '${hookFamilyId}' stage '${stageIdValue}'`);
  }

  const moduleId = resolvedRecord.manifest.moduleId;
  const capabilities = Array.isArray(resolvedRecord.manifest.capabilities) ? [...resolvedRecord.manifest.capabilities] : [];
  const handlers = resolveEffectHandlers(effects);
  const readonlyModuleConfigSnapshot = createReadonlySnapshot(selectDefinedValue(() => (objectRecord(resolvedRecord.config)), () => ({})));
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

  const getInvocationSnapshot = () => (buildInvocationSnapshot as any)({
    config,
    hookFamily: hookFamilyId,
    stageId: stageIdValue,
    invocation,
  });

  const pluginContext: AnyRecord = {
    schemaVersion: 'v1',
    moduleId,
    hookFamily: hookFamilyId,
    stageId: stageIdValue,
    capabilities: [...capabilities],
    read: {
      invocation: async () => deepClone(getInvocationSnapshot()),
      stateSnapshot: async () => deepClone(await resolveStateSnapshot(stateSnapshot, meta)),
      environment: async () => deepClone(buildEnvironmentContext(config, resolvedRecord, environmentMetadata)),
      moduleConfig: async () => readonlyModuleConfigSnapshot,
    },
  };

  Object.defineProperty(pluginContext, PLUGIN_MODULE_CONFIG, {
    value: readonlyModuleConfigSnapshot,
    enumerable: false,
    configurable: false,
  });

  if (resolvedRecord.manifest.sourceType === 'builtin') {
    Object.defineProperty(pluginContext, 'coreRuntime', {
      value: Object.freeze({
        readConfig: () => config,
        readProgress: () => progress,
        readDeps: () => injectedDeps,
        signal,
      }),
      enumerable: false,
      configurable: false,
    });
  }

  if (selectTruthyValue(() => (hasCapability(capabilities, 'read.artifacts')), () => (hasCapability(capabilities, 'write.artifacts')))) {
    const getDefaultArtifactsApi = () => (createPluginArtifactsApi as any)(config, {
      hookFamily: hookFamilyId,
      stageId: stageIdValue,
      moduleId,
      invocation,
    });

    pluginContext.artifacts = {
      get: async (ref: any) => {
        if (!hasCapability(capabilities, 'read.artifacts')) {
          throw createMissingSurfaceError(moduleId, stageId, 'artifacts.get');
        }
        const handler = handlers.artifacts.get;
        if (typeof handler === 'function') {
          return deepClone(await handler({ request: deepClone(ref), ...meta, invocation: getInvocationSnapshot() }));
        }
        return getDefaultArtifactsApi().get(ref);
      },
      find: async (query: AnyRecord = {}) => {
        if (!hasCapability(capabilities, 'read.artifacts')) {
          throw createMissingSurfaceError(moduleId, stageId, 'artifacts.find');
        }
        const handler = handlers.artifacts.find;
        if (typeof handler === 'function') {
          return deepClone(await handler({ request: deepClone(query), ...meta, invocation: getInvocationSnapshot() }));
        }
        return getDefaultArtifactsApi().find(query);
      },
      persist: async (request: AnyRecord = {}) => {
        if (!hasCapability(capabilities, 'write.artifacts')) {
          throw createMissingSurfaceError(moduleId, stageId, 'artifacts.persist');
        }
        const handler = handlers.artifacts.persist;
        if (typeof handler === 'function') {
          return deepClone(await handler({ request: deepClone(request), ...meta, invocation: getInvocationSnapshot() }));
        }
        return getDefaultArtifactsApi().persist(request);
      },
    };
  }

  if (hasCapability(capabilities, 'emit.stream')) {
    const streamHandler = handlers.stream.emit
      ? ({ request }: { request?: AnyRecord } = {}) => handlers.stream.emit({ request, ...meta, invocation: getInvocationSnapshot() })
      : createDefaultStreamEmitHandler(meta, getInvocationSnapshot);
    pluginContext.stream = {
      emit: buildReceiptMethod({
        moduleId,
        stageId,
        surfaceName: 'stream.emit',
        handler: streamHandler,
        allowDefaultReceipt: true,
      }),
    };
  }

  if (hasCapability(capabilities, 'emit.telemetry')) {
    const telemetryHandler = handlers.telemetry.emit
      ? ({ request }: { request?: AnyRecord } = {}) => handlers.telemetry.emit({ request, ...meta, invocation: getInvocationSnapshot() })
      : createDefaultTelemetryEmitHandler(meta);
    pluginContext.telemetry = {
      emit: buildReceiptMethod({
        moduleId,
        stageId,
        surfaceName: 'telemetry.emit',
        handler: telemetryHandler,
        allowDefaultReceipt: true,
      }),
    };
  }

  if (hasCapability(capabilities, 'request.wait') && typeof handlers.waits.create === 'function') {
    pluginContext.waits = {
      create: buildReceiptMethod({
        moduleId,
        stageId,
        surfaceName: 'waits.create',
        handler: ({ request }: { request?: AnyRecord } = {}) => handlers.waits.create({ request, ...meta, invocation: getInvocationSnapshot() }),
        allowDefaultReceipt: false,
      }),
    };
  }

  if (hasCapability(capabilities, 'request.signal') && typeof handlers.signals.issue === 'function') {
    pluginContext.signals = {
      issue: buildReceiptMethod({
        moduleId,
        stageId,
        surfaceName: 'signals.issue',
        handler: ({ request }: { request?: AnyRecord } = {}) => handlers.signals.issue({ request, ...meta, invocation: getInvocationSnapshot() }),
        allowDefaultReceipt: false,
      }),
    };
  }

  if (hasCapability(capabilities, 'notify.operator')) {
    const notifyHandler = handlers.notify.operator
      ? ({ request }: { request?: AnyRecord } = {}) => handlers.notify.operator({ request, ...meta, invocation: getInvocationSnapshot() })
      : createDefaultNotifyOperatorHandler(meta, getInvocationSnapshot);
    pluginContext.notify = {
      operator: buildReceiptMethod({
        moduleId,
        stageId,
        surfaceName: 'notify.operator',
        handler: notifyHandler,
        allowDefaultReceipt: true,
      }),
    };
  }

  if (hasCapability(capabilities, 'dispatch.worker_runtime') && typeof handlers.workerRuntime.dispatch === 'function') {
    pluginContext.workerRuntime = {
      dispatch: buildReceiptMethod({
        moduleId,
        stageId,
        surfaceName: 'workerRuntime.dispatch',
        handler: ({ request }: { request?: AnyRecord } = {}) => handlers.workerRuntime.dispatch({ request, ...meta, invocation: getInvocationSnapshot() }),
        allowDefaultReceipt: false,
      }),
    };
  }

  return pluginContext;
}
