import { bindRunContext, createRunId, createRunStats, createEffectReceipt } from './runtime.js';
import { resolveStageOwner } from './registry.js';
import { buildInvocationSnapshot } from '../services/correlation.js';
import { createPluginArtifactsApi } from '../services/artifact-bundle.js';
import { appendStructuredEvent } from '../services/observability.js';
import { emitTelemetryStreamEvent } from '../services/telemetry-stream.js';
import { discord } from '../integrations/discord.js';

const _runtimeConfigByPluginContext = new WeakMap();
const _runtimeProgressByPluginContext = new WeakMap();

function deepClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const entry of Object.values(value)) {
    deepFreeze(entry, seen);
  }
  return Object.freeze(value);
}

function cloneReadonlySnapshot(value, seen = new WeakMap()) {
  if (value === undefined || value === null) return value;
  if (typeof value === 'function') return undefined;
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const clone = [];
    seen.set(value, clone);
    for (const entry of value) {
      const clonedEntry = cloneReadonlySnapshot(entry, seen);
      if (clonedEntry !== undefined || entry === undefined) {
        clone.push(clonedEntry);
      } else if (typeof entry === 'function') {
        clone.push(null);
      }
    }
    return clone;
  }

  const clone = {};
  seen.set(value, clone);
  for (const [key, entry] of Object.entries(value)) {
    const clonedEntry = cloneReadonlySnapshot(entry, seen);
    if (clonedEntry !== undefined || entry === undefined) {
      clone[key] = clonedEntry;
    }
  }
  return clone;
}

function createReadonlySnapshot(value) {
  return deepFreeze(cloneReadonlySnapshot(value));
}

function hasCapability(capabilities, capability) {
  return Array.isArray(capabilities) && capabilities.includes(capability);
}

function resolveStateSnapshot(stateSnapshot, meta) {
  if (typeof stateSnapshot === 'function') return stateSnapshot(meta);
  return stateSnapshot ?? {};
}

function buildEnvironmentContext(config = {}, record = {}, metadata = undefined) {
  return {
    project: config?.project || 'unknown',
    runtime: 'pipeline',
    trustTier: record?.resolvedTrustTier || record?.manifest?.trustTier || 'trusted',
    sourceType: record?.manifest?.sourceType || 'builtin',
    ...(metadata !== undefined ? { metadata: deepClone(metadata) } : {}),
  };
}

function createMissingSurfaceError(moduleId, stageId, surfaceName) {
  return new Error(`PluginContextV1 surface '${surfaceName}' is scaffolded but not wired yet for module '${moduleId}' at stage '${stageId}'`);
}

function buildReceiptMethod({ moduleId, stageId, surfaceName, handler, allowDefaultReceipt = true }) {
  return async (request = {}) => {
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

function resolveEffectHandlers(effects = {}) {
  return {
    artifacts: effects.artifacts || {},
    stream: effects.stream || {},
    telemetry: effects.telemetry || {},
    waits: effects.waits || {},
    signals: effects.signals || {},
    notify: effects.notify || {},
    workerBackend: effects.workerBackend || {},
  };
}

function createDefaultStreamEmitHandler(meta, getInvocationSnapshot) {
  return async ({ request = {} }) => {
    const payload = {
      level: String(request?.level || 'INFO').toUpperCase(),
      message: request?.message || null,
      data: deepClone(request?.data ?? request?.payload ?? null),
      hook_family: meta.hookFamily,
      stage_id: meta.stageId,
      module_id: meta.moduleId,
      invocation: getInvocationSnapshot(),
    };
    appendStructuredEvent(meta.config, request?.eventType || 'plugin.stream', payload);
  };
}

function createDefaultTelemetryEmitHandler(meta) {
  return async ({ request = {} }) => {
    await emitTelemetryStreamEvent(
      meta.config,
      request?.eventType || request?.type || 'plugin.telemetry',
      {
        hook_family: meta.hookFamily,
        stage_id: meta.stageId,
        module_id: meta.moduleId,
        ...deepClone(request?.payload || request?.data || {}),
      },
      {
        runId: meta.config?._runId || meta.config?.run_id || null,
        emitter: 'nova/pipeline/core/context',
      },
    );
  };
}

function createDefaultNotifyOperatorHandler(meta, getInvocationSnapshot) {
  return async ({ request = {} }) => {
    await discord(
      meta.config,
      String(request?.level || request?.severity || 'INFO').toUpperCase(),
      request?.title || `Plugin operator notification: ${meta.stageId}`,
      request?.description || request?.message || '',
      Array.isArray(request?.fields)
        ? request.fields
        : [
            { name: 'Stage', value: meta.stageId, inline: true },
            { name: 'Plugin', value: meta.moduleId, inline: true },
            ...(request?.message && !request?.description ? [{ name: 'Message', value: String(request.message), inline: false }] : []),
            { name: 'Invocation', value: JSON.stringify(getInvocationSnapshot().ids || {}), inline: false },
          ],
    );
  };
}

export function createPipelineContext({ config, progress, runId, novaChannel, stats } = {}) {
  const ctx = {
    config,
    progress,
    runId: runId || config?._runId || createRunId(),
    novaChannel,
    stats: stats || config?._runStats || createRunStats(),
    _logModule: null,
    _logPhase: null,
    _logFd: null,
    _pipelineLogFd: null,
    _tmpDir: null,
  };

  bindRunContext(config, ctx);
  return ctx;
}

export function buildPluginInvocationEnvelope(input = {}, pluginContext = null, extras = {}) {
  const baseInput = input && typeof input === 'object' ? input : {};
  return {
    ...baseInput,
    ...extras,
    input: baseInput,
    pluginContext,
  };
}

export function getRuntimeConfigFromPluginContext(ctx = null) {
  return ctx ? (_runtimeConfigByPluginContext.get(ctx) || null) : null;
}

export function getRuntimeProgressFromPluginContext(ctx = null) {
  return ctx ? (_runtimeProgressByPluginContext.get(ctx) || null) : null;
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
} = {}) {
  if (!config) throw new Error('createPluginContext requires config');
  if (typeof hookFamily !== 'string' || !hookFamily.trim()) throw new Error('createPluginContext requires hookFamily');
  if (typeof stageId !== 'string' || !stageId.trim()) throw new Error('createPluginContext requires stageId');

  const resolvedRecord = record || resolveStageOwner(config, hookFamily, stageId);
  if (!resolvedRecord) {
    throw new Error(`No registered plugin owner found for hookFamily '${hookFamily}' stage '${stageId}'`);
  }

  const moduleId = resolvedRecord.manifest.moduleId;
  const capabilities = [...(resolvedRecord.manifest.capabilities || [])];
  const handlers = resolveEffectHandlers(effects);
  const readonlyConfigSnapshot = createReadonlySnapshot(config);
  const meta = {
    config,
    progress,
    record: resolvedRecord,
    hookFamily,
    stageId,
    moduleId,
    capabilities,
    invocation,
  };

  const getInvocationSnapshot = () => buildInvocationSnapshot({
    config,
    hookFamily,
    stageId,
    invocation,
  });

  const pluginContext = {
    schemaVersion: 'v1',
    moduleId,
    hookFamily,
    stageId,
    capabilities: [...capabilities],
    read: {
      invocation: async () => deepClone(getInvocationSnapshot()),
      stateSnapshot: async () => deepClone(await resolveStateSnapshot(stateSnapshot, meta)),
      environment: async () => deepClone(buildEnvironmentContext(config, resolvedRecord, environmentMetadata)),
      config: async () => readonlyConfigSnapshot,
      progress: async () => deepClone(progress),
    },
  };

  _runtimeConfigByPluginContext.set(pluginContext, config);
  _runtimeProgressByPluginContext.set(pluginContext, progress);

  if (hasCapability(capabilities, 'read.artifacts') || hasCapability(capabilities, 'write.artifacts')) {
    const getDefaultArtifactsApi = () => createPluginArtifactsApi(config, {
      hookFamily,
      stageId,
      moduleId,
      invocation,
    });

    pluginContext.artifacts = {
      get: async (ref) => {
        if (!hasCapability(capabilities, 'read.artifacts')) {
          throw createMissingSurfaceError(moduleId, stageId, 'artifacts.get');
        }
        const handler = handlers.artifacts.get;
        if (typeof handler === 'function') {
          return deepClone(await handler({ request: deepClone(ref), ...meta, invocation: getInvocationSnapshot() }));
        }
        return getDefaultArtifactsApi().get(ref);
      },
      find: async (query = {}) => {
        if (!hasCapability(capabilities, 'read.artifacts')) {
          throw createMissingSurfaceError(moduleId, stageId, 'artifacts.find');
        }
        const handler = handlers.artifacts.find;
        if (typeof handler === 'function') {
          return deepClone(await handler({ request: deepClone(query), ...meta, invocation: getInvocationSnapshot() }));
        }
        return getDefaultArtifactsApi().find(query);
      },
      persist: async (request = {}) => {
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
      ? ({ request }) => handlers.stream.emit({ request, ...meta, invocation: getInvocationSnapshot() })
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
      ? ({ request }) => handlers.telemetry.emit({ request, ...meta, invocation: getInvocationSnapshot() })
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
        handler: ({ request }) => handlers.waits.create({ request, ...meta, invocation: getInvocationSnapshot() }),
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
        handler: ({ request }) => handlers.signals.issue({ request, ...meta, invocation: getInvocationSnapshot() }),
        allowDefaultReceipt: false,
      }),
    };
  }

  if (hasCapability(capabilities, 'notify.operator')) {
    const notifyHandler = handlers.notify.operator
      ? ({ request }) => handlers.notify.operator({ request, ...meta, invocation: getInvocationSnapshot() })
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

  if (hasCapability(capabilities, 'dispatch.worker_backend') && typeof handlers.workerBackend.dispatch === 'function') {
    pluginContext.workerBackend = {
      dispatch: buildReceiptMethod({
        moduleId,
        stageId,
        surfaceName: 'workerBackend.dispatch',
        handler: ({ request }) => handlers.workerBackend.dispatch({ request, ...meta, invocation: getInvocationSnapshot() }),
        allowDefaultReceipt: false,
      }),
    };
  }

  return pluginContext;
}
