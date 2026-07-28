import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';

type AnyRecord = Record<string, any>;

export async function readPluginConfig(ctx: AnyRecord = {}) {
  if (typeof ctx?.coreRuntime?.readConfig === 'function') return ctx.coreRuntime.readConfig();
  throw new Error('Built-in plugin bridge requires explicit coreRuntime config; public PluginContextV1 does not expose read.config()');
}

export async function readPluginProgress(ctx: AnyRecord = {}) {
  if (typeof ctx?.coreRuntime?.readProgress === 'function') return ctx.coreRuntime.readProgress();
  throw new Error('Built-in plugin bridge requires explicit coreRuntime progress; public PluginContextV1 does not expose read.progress()');
}

export function readPluginDeps(ctx: AnyRecord = {}) {
  return typeof ctx?.coreRuntime?.readDeps === 'function' ? ctx.coreRuntime.readDeps() : null;
}

export async function emitBuiltinBridgeTrace(ctx: AnyRecord = {}, eventType: string, message: string, payload: AnyRecord = {}) {
  const suffix = '.bridge_invoked';
  const pluginId = eventType.startsWith('plugin.') && eventType.endsWith(suffix)
    ? `builtin.${eventType.slice('plugin.'.length, -suffix.length)}`
    : 'builtin.missing';
  if (typeof ctx?.telemetry?.emit !== 'function') return;
  await ctx.telemetry.emit({
    eventType: 'plugin.event',
    payload: {
      plugin_id: pluginId,
      plugin_event: 'bridge_invoked',
      module_id: selectTruthyValue(() => (payload.moduleId), () => (null)),
      gate_id: selectTruthyValue(() => (payload.gateId), () => (null)),
      gate_type: selectTruthyValue(() => (payload.gateType), () => (null)),
      attempt: selectDefinedValue(() => (payload.attempt), () => (null)),
      dispatch_id: selectTruthyValue(() => (payload.dispatchId), () => (null)),
      details: { bridge_event_type: eventType, message, ...payload },
    },
  });
}
