import {
  installBuiltinPluginRuntime,
  installPluginEffectSurfaces,
} from './plugin-context-surfaces.ts';

type AnyRecord = Record<string, any>;

export const PLUGIN_MODULE_CONFIG = Symbol('PluginContextV1.moduleConfig');

export function requiredPluginCoordinates(options: {
  config: AnyRecord | null | undefined;
  hookFamily: string | undefined;
  stageId: string | undefined;
}) {
  if (!options.config) throw new Error('createPluginContext requires config');
  if (typeof options.hookFamily !== 'string' || !options.hookFamily.trim()) {
    throw new Error('createPluginContext requires hookFamily');
  }
  if (typeof options.stageId !== 'string' || !options.stageId.trim()) {
    throw new Error('createPluginContext requires stageId');
  }
  return {
    config: options.config,
    hookFamilyId: options.hookFamily,
    stageIdValue: options.stageId,
  };
}

export function installPluginContextCapabilities(options: AnyRecord) {
  Object.defineProperty(options.pluginContext, PLUGIN_MODULE_CONFIG, {
    value: options.readonlyModuleConfigSnapshot,
    enumerable: false,
    configurable: false,
  });
  installBuiltinPluginRuntime(options.pluginContext, options.resolvedRecord, options.runtime);
  installPluginEffectSurfaces({
    pluginContext: options.pluginContext,
    meta: options.meta,
    effects: options.effects,
    capabilities: options.capabilities,
    getInvocationSnapshot: options.getInvocationSnapshot,
  });
}
