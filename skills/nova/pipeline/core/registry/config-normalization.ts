import {
  PLUGIN_REJECTION_CODES,
  PLUGIN_CAPABILITY_REJECTION_CODES,
  PLUGIN_TRUST_TIERS,
  PLUGIN_REQUIRED_CAPABILITIES,
  PLUGIN_OPTIONAL_CAPABILITIES,
} from '../constants.ts';
import { isPlainObject } from '../../services/validation.ts';
import { createRegistryDictionary, isReservedRegistryKey } from './dictionary.ts';

type AnyRecord = Record<string, any>;
type RegistryError = { code: string; message: string; [key: string]: any };

function pushError(errors: RegistryError[], code: string, message: string, details: AnyRecord = {}) {
  errors.push({ code, message, ...details });
}

function assertBoolean(value: any, label: string, errors: RegistryError[], code = PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID) {
  if (typeof value !== 'boolean') {
    pushError(errors, code, `${label} must be a boolean`);
    return false;
  }
  return true;
}

function normalizeModuleOverrides(modulesInput: any, errors: RegistryError[]) {
  if (modulesInput === undefined) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, 'config.plugins.modules is required');
    return createRegistryDictionary();
  }
  if (!isPlainObject(modulesInput)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, 'config.plugins.modules must be an object keyed by moduleId');
    return createRegistryDictionary();
  }

  const normalized: AnyRecord = createRegistryDictionary();
  for (const [moduleId, rawOverrideValue] of Object.entries(modulesInput)) {
    const rawOverride = rawOverrideValue as AnyRecord;
    if (isReservedRegistryKey(moduleId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.modules.${moduleId} is reserved and cannot be used as a registry key`);
      continue;
    }
    if (!isPlainObject(rawOverride)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.modules.${moduleId} must be an object`);
      continue;
    }

    const moduleOverride: AnyRecord = createRegistryDictionary();
    if (rawOverride.enabled !== undefined) {
      if (assertBoolean(rawOverride.enabled, `config.plugins.modules.${moduleId}.enabled`, errors)) {
        moduleOverride.enabled = rawOverride.enabled;
      }
    }

    if (rawOverride.config !== undefined) {
      if (!isPlainObject(rawOverride.config)) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.modules.${moduleId}.config must be an object`);
      } else {
        moduleOverride.config = { ...rawOverride.config };
      }
    }

    if (rawOverride.trustOverride !== undefined) {
      if (!PLUGIN_TRUST_TIERS.has(rawOverride.trustOverride)) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_TRUST_OVERRIDE_INVALID, `config.plugins.modules.${moduleId}.trustOverride must be 'trusted' or 'restricted'`);
      } else {
        moduleOverride.trustOverride = rawOverride.trustOverride;
      }
    }

    normalized[moduleId] = moduleOverride;
  }

  return normalized;
}

function normalizeStageOwners(stageOwnersInput: any, errors: RegistryError[]) {
  if (stageOwnersInput === undefined) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, 'config.plugins.stageOwners is required');
    return createRegistryDictionary();
  }
  if (!isPlainObject(stageOwnersInput)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, 'config.plugins.stageOwners must be an object keyed by stageId');
    return createRegistryDictionary();
  }

  const normalized: AnyRecord = createRegistryDictionary();
  for (const [stageId, moduleId] of Object.entries(stageOwnersInput)) {
    if (isReservedRegistryKey(stageId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.stageOwners.${stageId} is reserved and cannot be used as a registry key`);
      continue;
    }
    if (typeof moduleId !== 'string' || !moduleId.trim()) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.stageOwners.${stageId} must be a non-empty moduleId string`);
      continue;
    }
    normalized[stageId] = moduleId.trim();
  }
  return normalized;
}

function normalizeCapabilityAllowlist(input: any, errors: RegistryError[]) {
  if (input === undefined) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, 'config.plugins.restrictedCapabilityAllowlist is required');
    return createRegistryDictionary();
  }
  if (!isPlainObject(input)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, 'config.plugins.restrictedCapabilityAllowlist must be an object keyed by moduleId');
    return createRegistryDictionary();
  }

  const normalized: AnyRecord = createRegistryDictionary();
  for (const [moduleId, capabilities] of Object.entries(input)) {
    if (isReservedRegistryKey(moduleId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.restrictedCapabilityAllowlist.${moduleId} is reserved and cannot be used as a registry key`);
      continue;
    }
    if (!Array.isArray(capabilities)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.restrictedCapabilityAllowlist.${moduleId} must be an array of capability strings`);
      continue;
    }
    const seen = new Set();
    normalized[moduleId] = [];
    for (const capability of capabilities) {
      if (typeof capability !== 'string' || !capability.trim()) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.restrictedCapabilityAllowlist.${moduleId} must contain only non-empty capability strings`);
        continue;
      }
      const trimmed = capability.trim();
      if (seen.has(trimmed)) {
        pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_UNKNOWN, `config.plugins.restrictedCapabilityAllowlist.${moduleId} contains duplicate capability '${trimmed}'`);
        continue;
      }
      if (!allKnownCapabilities().has(trimmed)) {
        pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_UNKNOWN, `config.plugins.restrictedCapabilityAllowlist.${moduleId} references unknown capability '${trimmed}'`);
        continue;
      }
      seen.add(trimmed);
      normalized[moduleId].push(trimmed);
    }
  }
  return normalized;
}

function normalizeExtraModulePaths(extraModulePathsInput: any, errors: RegistryError[]) {
  if (extraModulePathsInput === undefined) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, 'config.plugins.extraModulePaths is required');
    return [];
  }
  if (!Array.isArray(extraModulePathsInput)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_DISCOVERY_PATH_FORBIDDEN, 'config.plugins.extraModulePaths is unsupported; custom plugin-module discovery is reserved but not implemented yet');
    return [];
  }

  if (extraModulePathsInput.length > 0) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_DISCOVERY_PATH_FORBIDDEN, 'config.plugins.extraModulePaths is unsupported; custom plugin-module discovery is reserved but not implemented yet');
  }
  return [];
}

export function normalizePluginConfig(pluginConfigInput: any, errors: RegistryError[]) {
  if (pluginConfigInput === undefined || pluginConfigInput === null) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, 'config.plugins is required');
    return { enabled: false, allowCustomModules: false, extraModulePaths: [], modules: createRegistryDictionary(), stageOwners: createRegistryDictionary(), restrictedCapabilityAllowlist: createRegistryDictionary() };
  }

  if (!isPlainObject(pluginConfigInput)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, 'config.plugins must be an object');
    return { enabled: false, allowCustomModules: false, extraModulePaths: [], modules: createRegistryDictionary(), stageOwners: createRegistryDictionary(), restrictedCapabilityAllowlist: createRegistryDictionary() };
  }

  const normalized = {
    enabled: typeof pluginConfigInput.enabled === 'boolean' ? pluginConfigInput.enabled : false,
    allowCustomModules: typeof pluginConfigInput.allowCustomModules === 'boolean' ? pluginConfigInput.allowCustomModules : false,
    extraModulePaths: normalizeExtraModulePaths(pluginConfigInput.extraModulePaths, errors),
    modules: normalizeModuleOverrides(pluginConfigInput.modules, errors),
    stageOwners: normalizeStageOwners(pluginConfigInput.stageOwners, errors),
    restrictedCapabilityAllowlist: normalizeCapabilityAllowlist(pluginConfigInput.restrictedCapabilityAllowlist, errors),
  };

  assertBoolean(pluginConfigInput.enabled, 'config.plugins.enabled', errors);
  assertBoolean(pluginConfigInput.allowCustomModules, 'config.plugins.allowCustomModules', errors);
  return normalized;
}

export function allKnownCapabilities() {
  return new Set([
    ...PLUGIN_REQUIRED_CAPABILITIES.worker,
    ...PLUGIN_REQUIRED_CAPABILITIES.gate,
    ...PLUGIN_REQUIRED_CAPABILITIES.validator,
    ...PLUGIN_REQUIRED_CAPABILITIES.generator,
    ...PLUGIN_REQUIRED_CAPABILITIES.notification,
    ...PLUGIN_REQUIRED_CAPABILITIES.telemetry,
    ...PLUGIN_OPTIONAL_CAPABILITIES.worker,
    ...PLUGIN_OPTIONAL_CAPABILITIES.gate,
    ...PLUGIN_OPTIONAL_CAPABILITIES.validator,
    ...PLUGIN_OPTIONAL_CAPABILITIES.generator,
    ...PLUGIN_OPTIONAL_CAPABILITIES.notification,
    ...PLUGIN_OPTIONAL_CAPABILITIES.telemetry,
  ]);
}
