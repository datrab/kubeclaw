import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { getActiveContext } from './logger.ts';
import { PLUGIN_METHOD_BY_KIND } from './registry/validation.ts';

type AnyRecord = Record<string, any>;

function activeContextRegistry(config: any) {
  const active = getActiveContext();
  if (!active?.pluginRegistry) return null;
  if (config && active.config !== config) return null;
  return active.pluginRegistry;
}

function resolveRegistryObject(configOrRegistry: any) {
  return configOrRegistry?.stageOwners ? configOrRegistry : getPluginRegistry(configOrRegistry);
}

function priorityValue(value: any): number {
  return Number(selectDefinedValue(() => value, () => 0));
}

function moduleIdSortValue(value: any): string {
  return typeof value === 'string' ? value : '';
}

export function getPluginRegistry(config: any) {
  return selectDefinedValue(() => config?.pluginRegistry, () => activeContextRegistry(config));
}

export function requirePluginRegistry(configOrRegistry: any) {
  const registry = resolveRegistryObject(configOrRegistry);
  if (!registry) {
    throw new Error('Pipeline plugin registry is missing. loadConfig() must assemble and freeze the startup registry before execution.');
  }
  if (registry.enabled === false) {
    throw new Error('Pipeline plugin registry is disabled. Decision-bearing stages cannot execute without the startup registry.');
  }
  return registry;
}

export function resolveStageOwner(configOrRegistry: any, hookFamily: string, stageId: string) {
  const registry = resolveRegistryObject(configOrRegistry);
  if (!registry || registry.enabled === false) return null;
  return selectTruthyValue(() => registry.stageOwners?.[hookFamily]?.[stageId], () => null);
}

export function requireStageOwner(configOrRegistry: any, hookFamily: string, stageId: string) {
  const registry = requirePluginRegistry(configOrRegistry);
  const record = selectTruthyValue(() => registry.stageOwners?.[hookFamily]?.[stageId], () => null);
  if (!record) {
    throw new Error(`No registered plugin owner found for hookFamily '${hookFamily}' stage '${stageId}' in the startup-frozen registry.`);
  }
  return record;
}

export function requireGateTypeOwner(configOrRegistry: any, gateType: string) {
  const registry = requirePluginRegistry(configOrRegistry);
  const entry = selectTruthyValue(() => registry.gateTypes?.[gateType], () => null);
  if (!entry) {
    throw new Error(`No registered gate type owner found for gate type '${gateType}' in the startup-frozen registry.`);
  }
  return entry;
}

export function requireStageHandler(configOrRegistry: any, hookFamily: string, stageId: string, methodName: string | null = null) {
  const record = requireStageOwner(configOrRegistry, hookFamily, stageId);
  const resolvedMethodName = selectTruthyValue(
    () => methodName,
    () => (PLUGIN_METHOD_BY_KIND as AnyRecord)[record.manifest.kind],
  );
  if (!resolvedMethodName) {
    throw new Error(`No registry method mapping found for module '${record.manifest.moduleId}' at hookFamily '${hookFamily}' stage '${stageId}'.`);
  }
  const handler = selectTruthyValue(() => record.implementation?.[resolvedMethodName], () => null);
  if (typeof handler !== 'function') {
    throw new Error(`Registered module '${record.manifest.moduleId}' does not implement '${resolvedMethodName}' for hookFamily '${hookFamily}' stage '${stageId}'.`);
  }
  return { record, handler, methodName: resolvedMethodName };
}

// Optional hook listeners are fan-out only. Absence means no observer/sink is
// registered; decision-bearing stage owners must use requireStageHandler().
export function resolveHookListeners(configOrRegistry: any, hookFamily: string, stageId: any = hookFamily) {
  const registry = configOrRegistry?.hookIndex ? configOrRegistry : getPluginRegistry(configOrRegistry);
  if (!registry || registry.enabled === false) return [];
  const records = Array.isArray(registry.hookIndex?.[hookFamily]?.[stageId]) ? registry.hookIndex[hookFamily][stageId] : [];
  return [...records]
    .filter((record: any) => record?.enabled)
    .sort((left: any, right: any) => {
      const leftPriority = priorityValue(left?.manifest?.priority);
      const rightPriority = priorityValue(right?.manifest?.priority);
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return moduleIdSortValue(left?.manifest?.moduleId).localeCompare(moduleIdSortValue(right?.manifest?.moduleId));
    });
}
