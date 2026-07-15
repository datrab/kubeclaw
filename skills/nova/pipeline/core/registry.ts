import {
  PLUGIN_CONTRACT_VERSION,
  PLUGIN_REJECTION_CODES,
} from './constants.ts';
import { cloneSerializable, deepFreeze } from '../services/serialization.ts';
import { getActiveContext } from './logger.ts';
import { BUILTIN_PLUGIN_DEFINITIONS } from './registry/builtins.ts';
import { normalizePluginConfig } from './registry/config-normalization.ts';
import {
  PLUGIN_METHOD_BY_KIND,
  resolveModuleConfig,
  validateCapabilities,
  validateImplementation,
  validateManifest,
  validateTrustPolicy,
} from './registry/validation.ts';
import { createRegistryDictionary } from './registry/dictionary.ts';
import { buildGateTypeIndex, buildHookIndex, buildStageOwnerIndex } from './registry/indexes.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;
type RegistryError = { code: string; message: string; [key: string]: any };

function cloneArrayField(value: any) {
  return Array.isArray(value) ? [...value] : [];
}

function objectRecord(value: any): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requireSourceRef(value: any, moduleId: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return `builtin:${moduleId}`;
}

function priorityValue(value: any): number {
  return Number(selectDefinedValue(() => (value), () => (0)));
}

function moduleIdSortValue(value: any): string {
  return typeof value === 'string' ? value : '';
}

function registryTrustTier(manifest: AnyRecord, override: AnyRecord) {
  return selectDefinedValue(() => (override.trustOverride), () => (manifest.trustTier));
}

function registryEnabled(manifest: AnyRecord, override: AnyRecord) {
  return selectDefinedValue(() => (override.enabled), () => (manifest.defaultEnabled));
}

function registryImplementationRef(definition: AnyRecord, manifest: AnyRecord) {
  return selectDefinedValue(() => (definition.implementationRef), () => (manifest.moduleId));
}

function activeContextRegistry(config: any) {
  const active = getActiveContext();
  if (!active?.pluginRegistry) return null;
  if (config && active.config !== config) return null;
  return active.pluginRegistry;
}

function cloneManifest(manifest: AnyRecord = {}): AnyRecord {
  return {
    ...manifest,
    ...(Array.isArray(manifest.gateTypes) ? { gateTypes: [...manifest.gateTypes] } : {}),
    stageIds: cloneArrayField(manifest.stageIds),
    capabilities: cloneArrayField(manifest.capabilities),
    configSchema: cloneSerializable(manifest.configSchema),
  };
}

function createError(code: string, message: string, details: AnyRecord = {}) {
  return { code, message, ...details };
}

function pushError(errors: RegistryError[], code: string, message: string, details: AnyRecord = {}) {
  errors.push(createError(code, message, details));
}

function formatErrorList(errors: RegistryError[]) {
  return errors.map((error) => `  - [${error.code}] ${error.message}`).join('\n');
}

export function getBuiltinPluginDefinitions() {
  return BUILTIN_PLUGIN_DEFINITIONS.map((definition) => ({
    ...definition,
    manifest: cloneManifest(definition.manifest),
    implementation: { ...definition.implementation },
  }));
}

export function formatPluginRegistryErrors(errors: RegistryError[] = []) {
  if (!errors.length) return '';
  return `Plugin registry validation failed with ${errors.length} error(s):\n${formatErrorList(errors)}`;
}

export function buildPluginRegistry(pluginConfigInput: any, opts: AnyRecord = {}) {
  const errors: RegistryError[] = [];
  const normalizedConfig = normalizePluginConfig(pluginConfigInput, errors);
  const builtinModules = Array.isArray(opts.builtinModules) ? opts.builtinModules : getBuiltinPluginDefinitions();
  const discoveredDefinitions: AnyRecord[] = [];
  const discoveredModuleIds = new Set();

  for (const definition of builtinModules) {
    validateManifest(definition, errors);
    if (!definition?.manifest?.moduleId) continue;
    if (discoveredModuleIds.has(definition.manifest.moduleId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Duplicate moduleId '${definition.manifest.moduleId}' discovered during registry assembly`);
      continue;
    }
    discoveredModuleIds.add(definition.manifest.moduleId);
    discoveredDefinitions.push(definition);
  }

  for (const moduleId of Object.keys(normalizedConfig.modules)) {
    if (!discoveredModuleIds.has(moduleId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.modules.${moduleId} references a module that was not discovered at startup`);
    }
  }

  for (const moduleId of Object.keys(normalizedConfig.restrictedCapabilityAllowlist)) {
    if (!discoveredModuleIds.has(moduleId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.restrictedCapabilityAllowlist.${moduleId} references a module that was not discovered at startup`);
    }
  }

  const records: AnyRecord = createRegistryDictionary();
  for (const definition of discoveredDefinitions) {
    const manifest = cloneManifest(definition.manifest);
    validateImplementation(definition, errors);

    const override = objectRecord(normalizedConfig.modules[manifest.moduleId]);
    const resolvedTrustTier = registryTrustTier(manifest, override);
    if (override.trustOverride && !discoveredModuleIds.has(manifest.moduleId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_TRUST_OVERRIDE_INVALID, `config.plugins.modules.${manifest.moduleId}.trustOverride cannot target an undiscovered module`);
    }
    const resolvedModuleConfig = resolveModuleConfig(manifest.moduleId, objectRecord(override.config), manifest, errors);
    validateTrustPolicy(manifest, override, resolvedTrustTier, errors);
    validateCapabilities(manifest, resolvedTrustTier, normalizedConfig.restrictedCapabilityAllowlist, errors);

    records[manifest.moduleId] = deepFreeze({
      manifest: deepFreeze(manifest),
      enabled: registryEnabled(manifest, override),
      resolvedTrustTier,
      resolvedStageIds: deepFreeze(cloneArrayField(manifest.stageIds)),
      sourceRef: requireSourceRef(definition.sourceRef, manifest.moduleId),
      implementationRef: registryImplementationRef(definition, manifest),
      implementation: deepFreeze({ ...definition.implementation }),
      config: deepFreeze(resolvedModuleConfig),
    });
  }

  const stageOwners = buildStageOwnerIndex(normalizedConfig, records, errors);
  const gateTypes = buildGateTypeIndex(normalizedConfig, records, stageOwners, errors);
  const hookIndex = buildHookIndex(records);

  const registry = deepFreeze({
    contractVersion: PLUGIN_CONTRACT_VERSION,
    enabled: normalizedConfig.enabled,
    config: deepFreeze({ ...normalizedConfig }),
    records: deepFreeze(records),
    hookIndex: deepFreeze(hookIndex),
    stageOwners: deepFreeze(stageOwners),
    gateTypes: deepFreeze(gateTypes),
    summary: deepFreeze({
      discoveredModules: Object.keys(records).length,
      enabledModules: Object.values(records).filter((record: any) => record.enabled).length,
      stageOwnerCount: Object.values(stageOwners).reduce((total: number, stageMap: any) => total + Object.keys(stageMap).length, 0),
      gateTypeCount: Object.keys(gateTypes).length,
    }),
  });

  if (opts.throwOnError !== false && errors.length > 0) {
    throw new Error(formatPluginRegistryErrors(errors));
  }

  return { normalizedConfig, registry, errors };
}

export function getPluginRegistry(config: any) {
  return selectDefinedValue(() => (config?.pluginRegistry), () => (activeContextRegistry(config)));
}

function resolveRegistryObject(configOrRegistry: any) {
  return configOrRegistry?.stageOwners ? configOrRegistry : getPluginRegistry(configOrRegistry);
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
  if (!registry) return null;
  if (registry.enabled === false) return null;
  return selectTruthyValue(() => (registry.stageOwners?.[hookFamily]?.[stageId]), () => (null));
}

export function requireStageOwner(configOrRegistry: any, hookFamily: string, stageId: string) {
  const registry = requirePluginRegistry(configOrRegistry);
  const record = selectTruthyValue(() => (registry.stageOwners?.[hookFamily]?.[stageId]), () => (null));
  if (!record) {
    throw new Error(`No registered plugin owner found for hookFamily '${hookFamily}' stage '${stageId}' in the startup-frozen registry.`);
  }
  return record;
}

export function requireGateTypeOwner(configOrRegistry: any, gateType: string) {
  const registry = requirePluginRegistry(configOrRegistry);
  const entry = selectTruthyValue(() => (registry.gateTypes?.[gateType]), () => (null));
  if (!entry) {
    throw new Error(`No registered gate type owner found for gate type '${gateType}' in the startup-frozen registry.`);
  }
  return entry;
}

export function requireStageHandler(configOrRegistry: any, hookFamily: string, stageId: string, methodName: string | null = null) {
  const record = requireStageOwner(configOrRegistry, hookFamily, stageId);
  const resolvedMethodName = selectTruthyValue(() => (selectTruthyValue(() => (methodName), () => ((PLUGIN_METHOD_BY_KIND as AnyRecord)[record.manifest.kind]))), () => (null));
  if (!resolvedMethodName) {
    throw new Error(`No registry method mapping found for module '${record.manifest.moduleId}' at hookFamily '${hookFamily}' stage '${stageId}'.`);
  }
  const handler = selectTruthyValue(() => (record.implementation?.[resolvedMethodName]), () => (null));
  if (typeof handler !== 'function') {
    throw new Error(`Registered module '${record.manifest.moduleId}' does not implement '${resolvedMethodName}' for hookFamily '${hookFamily}' stage '${stageId}'.`);
  }
  return { record, handler, methodName: resolvedMethodName };
}

// Optional hook listeners are fan-out only. Absence means no observer/sink is
// registered; decision-bearing stage owners must use requireStageHandler().
export function resolveHookListeners(configOrRegistry: any, hookFamily: string, stageId = hookFamily) {
  const registry = configOrRegistry?.hookIndex ? configOrRegistry : getPluginRegistry(configOrRegistry);
  if (!registry) return [];
  if (registry.enabled === false) return [];
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
