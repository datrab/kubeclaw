import { createEffectReceipt } from './runtime.ts';
import { createPluginArtifactsApi } from '../services/artifact-bundle.ts';
import { appendStructuredEvent } from '../services/observability.ts';
import { emitTelemetryStreamEvent } from '../services/telemetry-stream.ts';
import { deepClone } from '../services/serialization.ts';
import { discord } from '../integrations/discord.ts';
import { selectDefinedValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;

type SurfaceInstallOptions = {
  pluginContext: AnyRecord;
  meta: AnyRecord;
  effects?: AnyRecord;
  capabilities: string[];
  getInvocationSnapshot: () => AnyRecord;
};

export function createPluginContextShell(options: AnyRecord) {
  return {
    schemaVersion: 'v1',
    moduleId: options.moduleId,
    hookFamily: options.hookFamilyId,
    stageId: options.stageIdValue,
    capabilities: [...options.capabilities],
    read: {
      invocation: options.readInvocation,
      stateSnapshot: options.readStateSnapshot,
      environment: options.readEnvironment,
      moduleConfig: options.readModuleConfig,
    },
  };
}

export function installBuiltinPluginRuntime(
  pluginContext: AnyRecord,
  resolvedRecord: AnyRecord,
  runtime: AnyRecord,
) {
  if (resolvedRecord.manifest.sourceType !== 'builtin') return;
  Object.defineProperty(pluginContext, 'coreRuntime', {
    value: Object.freeze({
      readConfig: () => runtime.config,
      readProgress: () => runtime.progress,
      readDeps: () => runtime.injectedDeps,
      signal: runtime.signal,
    }),
    enumerable: false,
    configurable: false,
  });
}

function objectRecord(value: any): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function nonEmptyString(value: any): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function hasCapability(capabilities: string[], capability: string) {
  return capabilities.includes(capability);
}

function missingSurfaceError(meta: AnyRecord, surfaceName: string) {
  return new Error(
    `PluginContextV1 surface '${surfaceName}' is scaffolded but not wired yet for module '${meta.moduleId}' at stage '${meta.stageId}'`,
  );
}

function receiptMethod(meta: AnyRecord, surfaceName: string, handler: any, allowDefaultReceipt = true) {
  return async (request: AnyRecord = {}) => {
    if (typeof handler !== 'function') throw missingSurfaceError(meta, surfaceName);
    const result = await handler({ request: deepClone(request) });
    if (result !== undefined) return deepClone(result);
    if (!allowDefaultReceipt) {
      throw new Error(
        `PluginContextV1 surface '${surfaceName}' did not return the required result payload for module '${meta.moduleId}' at stage '${meta.stageId}'`,
      );
    }
    return createEffectReceipt({ dedupeKey: request?.dedupeKey });
  };
}

function resolvedHandlers(effects: AnyRecord = {}) {
  const value = objectRecord(effects) ?? {};
  return {
    artifacts: objectRecord(value.artifacts) ?? {},
    stream: objectRecord(value.stream) ?? {},
    telemetry: objectRecord(value.telemetry) ?? {},
    waits: objectRecord(value.waits) ?? {},
    signals: objectRecord(value.signals) ?? {},
    notify: objectRecord(value.notify) ?? {},
    workerRuntime: objectRecord(value.workerRuntime) ?? {},
  };
}

function defaultStreamHandler(meta: AnyRecord, getInvocationSnapshot: () => AnyRecord) {
  return async ({ request = {} }: { request?: AnyRecord } = {}) => {
    const normalized = objectRecord(request) ?? {};
    appendStructuredEvent(
      meta.config,
      selectDefinedValue(() => nonEmptyString(normalized.eventType), () => 'plugin.stream'),
      {
        level: selectDefinedValue(() => nonEmptyString(normalized.level)?.toUpperCase(), () => 'INFO'),
        message: selectDefinedValue(() => normalized.message, () => null),
        data: deepClone(selectDefinedValue(() => normalized.data, () => selectDefinedValue(() => normalized.payload, () => null))),
        hook_family: meta.hookFamily,
        stage_id: meta.stageId,
        module_id: meta.moduleId,
        invocation: getInvocationSnapshot(),
      },
    );
  };
}

function defaultTelemetryHandler(meta: AnyRecord) {
  return async ({ request = {} }: { request?: AnyRecord } = {}) => {
    const normalized = objectRecord(request) ?? {};
    await emitTelemetryStreamEvent(
      meta.config,
      selectDefinedValue(
        () => nonEmptyString(normalized.eventType),
        () => selectDefinedValue(() => nonEmptyString(normalized.type), () => 'plugin.telemetry'),
      ),
      {
        hook_family: meta.hookFamily,
        stage_id: meta.stageId,
        module_id: meta.moduleId,
        ...deepClone(objectRecord(normalized.payload)),
      },
      {
        runId: selectDefinedValue(
          () => meta.config?._runId,
          () => selectDefinedValue(() => meta.config?.run_id, () => null),
        ),
        emitter: 'nova/skills/common/plugin-runtime/core/context',
      },
    );
  };
}

function defaultNotifyHandler(meta: AnyRecord, getInvocationSnapshot: () => AnyRecord) {
  return async ({ request = {} }: { request?: AnyRecord } = {}) => {
    const normalized = objectRecord(request) ?? {};
    const description = selectDefinedValue(
      () => nonEmptyString(normalized.description),
      () => selectDefinedValue(() => nonEmptyString(normalized.message), () => ''),
    );
    const invocationIds = objectRecord(getInvocationSnapshot().ids) ?? {};
    await discord(
      meta.config,
      selectDefinedValue(
        () => nonEmptyString(normalized.level)?.toUpperCase(),
        () => selectDefinedValue(() => nonEmptyString(normalized.severity)?.toUpperCase(), () => 'INFO'),
      ),
      selectDefinedValue(() => nonEmptyString(normalized.title), () => `Plugin operator notification: ${meta.stageId}`),
      description,
      Array.isArray(normalized.fields)
        ? normalized.fields
        : [
            { name: 'Stage', value: meta.stageId, inline: true },
            { name: 'Plugin', value: meta.moduleId, inline: true },
            ...(normalized.message && !normalized.description
              ? [{ name: 'Message', value: String(normalized.message), inline: false }]
              : []),
            { name: 'Invocation', value: JSON.stringify(invocationIds), inline: false },
          ],
    );
  };
}

function installArtifactSurface(options: SurfaceInstallOptions, handlers: AnyRecord) {
  const { pluginContext, meta, capabilities, getInvocationSnapshot } = options;
  if (!hasCapability(capabilities, 'read.artifacts') && !hasCapability(capabilities, 'write.artifacts')) return;
  const defaultApi = () => createPluginArtifactsApi(meta.config, {
    hookFamily: meta.hookFamily,
    stageId: meta.stageId,
    moduleId: meta.moduleId,
    invocation: meta.invocation,
  }) as AnyRecord;
  const invoke = async (operation: string, request: any, capability: string) => {
    if (!hasCapability(capabilities, capability)) throw missingSurfaceError(meta, `artifacts.${operation}`);
    const handler = handlers.artifacts[operation];
    if (typeof handler === 'function') {
      return deepClone(await handler({ request: deepClone(request), ...meta, invocation: getInvocationSnapshot() }));
    }
    return defaultApi()[operation](request);
  };
  pluginContext.artifacts = {
    get: (ref: any) => invoke('get', ref, 'read.artifacts'),
    find: (query: AnyRecord = {}) => invoke('find', query, 'read.artifacts'),
    persist: (request: AnyRecord = {}) => invoke('persist', request, 'write.artifacts'),
  };
}

function contextualHandler(handler: any, meta: AnyRecord, getInvocationSnapshot: () => AnyRecord) {
  return ({ request }: { request?: AnyRecord } = {}) =>
    handler({ request, ...meta, invocation: getInvocationSnapshot() });
}

function surfaceDefinitions(handlers: AnyRecord, meta: AnyRecord, getInvocationSnapshot: () => AnyRecord) {
  const contextual = (handler: any) => handler
    ? contextualHandler(handler, meta, getInvocationSnapshot)
    : null;
  return [
    ['emit.stream', 'stream', 'emit', contextual(handlers.stream.emit) ?? defaultStreamHandler(meta, getInvocationSnapshot), true],
    ['emit.telemetry', 'telemetry', 'emit', contextual(handlers.telemetry.emit) ?? defaultTelemetryHandler(meta), true],
    ['request.wait', 'waits', 'create', contextual(handlers.waits.create), false],
    ['request.signal', 'signals', 'issue', contextual(handlers.signals.issue), false],
    ['notify.operator', 'notify', 'operator', contextual(handlers.notify.operator) ?? defaultNotifyHandler(meta, getInvocationSnapshot), true],
    ['dispatch.worker_runtime', 'workerRuntime', 'dispatch', contextual(handlers.workerRuntime.dispatch), false],
  ] as const;
}

export function installPluginEffectSurfaces(options: SurfaceInstallOptions) {
  const { pluginContext, meta, capabilities, getInvocationSnapshot } = options;
  const handlers = resolvedHandlers(options.effects);
  installArtifactSurface(options, handlers);
  for (const [capability, namespace, operation, handler, allowDefaultReceipt] of surfaceDefinitions(
    handlers,
    meta,
    getInvocationSnapshot,
  )) {
    if (!hasCapability(capabilities, capability) || !handler) continue;
    pluginContext[namespace] = {
      [operation]: receiptMethod(
        meta,
        `${namespace}.${operation}`,
        handler,
        allowDefaultReceipt,
      ),
    };
  }
}
