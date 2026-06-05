import {
  PLUGIN_CONTRACT_VERSION,
  PLUGIN_CONFIG_SCHEMA_TYPE,
  PLUGIN_CONFIG_SCHEMA_VERSION,
  PLUGIN_KINDS,
  PLUGIN_ALLOWED_HOOK_FAMILIES,
  PLUGIN_HOOK_FAMILIES,
  PLUGIN_STAGE_IDS,
  PLUGIN_REQUIRED_CAPABILITIES,
  PLUGIN_OPTIONAL_CAPABILITIES,
  PLUGIN_FORBIDDEN_CAPABILITIES,
  PLUGIN_REJECTION_CODES,
  PLUGIN_CAPABILITY_REJECTION_CODES,
  PLUGIN_TRUST_TIERS,
  PLUGIN_SOURCE_TYPES,
} from '../constants.ts';
import { isPlainObject } from '../../services/validation.ts';
import { cloneSerializable } from '../../services/serialization.ts';
import { allKnownCapabilities } from './config-normalization.ts';
import { createRegistryDictionary, isReservedRegistryKey } from './dictionary.ts';

type AnyRecord = Record<string, any>;
type RegistryError = { code: string; message: string; [key: string]: any };

export const PLUGIN_METHOD_BY_KIND = Object.freeze({
  worker: 'execute',
  gate: 'execute',
  validator: 'run',
  generator: 'run',
  notification: 'observe',
  telemetry: 'observe',
});

function pushError(errors: RegistryError[], code: string, message: string, details: AnyRecord = {}) {
  errors.push({ code, message, ...details });
}

export function validateManifestConfigSchema(manifest: AnyRecord, errors: RegistryError[]) {
  if (!isPlainObject(manifest.configSchema)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CONFIG_SCHEMA_INVALID, `Module '${manifest.moduleId}' must declare an object configSchema envelope`);
    return;
  }
  if (manifest.configSchema.schemaType !== PLUGIN_CONFIG_SCHEMA_TYPE) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CONFIG_SCHEMA_INVALID, `Module '${manifest.moduleId}' configSchema.schemaType must be '${PLUGIN_CONFIG_SCHEMA_TYPE}'`);
  }
  if (manifest.configSchema.schemaVersion !== PLUGIN_CONFIG_SCHEMA_VERSION) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CONFIG_SCHEMA_INVALID, `Module '${manifest.moduleId}' configSchema.schemaVersion must be '${PLUGIN_CONFIG_SCHEMA_VERSION}'`);
  }
  if (!isPlainObject(manifest.configSchema.schema)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CONFIG_SCHEMA_INVALID, `Module '${manifest.moduleId}' configSchema.schema must be an object`);
  } else if (manifest.configSchema.schema.type !== 'object') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CONFIG_SCHEMA_INVALID, `Module '${manifest.moduleId}' configSchema.schema.type must be 'object'`);
  }
  if (manifest.configSchema.defaults !== undefined && !isPlainObject(manifest.configSchema.defaults)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CONFIG_SCHEMA_INVALID, `Module '${manifest.moduleId}' configSchema.defaults must be an object when provided`);
  }
}

function validateJsonSchemaValue(value: any, schema: any = {}, pathLabel: string, errors: RegistryError[]) {
  if (!isPlainObject(schema)) return;

  if (Array.isArray(schema.enum) && !schema.enum.some((entry: any) => Object.is(entry, value))) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel} must be one of: ${schema.enum.map((entry: any) => JSON.stringify(entry)).join(', ')}`);
    return;
  }

  switch (schema.type) {
    case 'object': {
      if (!isPlainObject(value)) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel} must be an object`);
        return;
      }
      const properties = isPlainObject(schema.properties) ? schema.properties : createRegistryDictionary();
      if (Array.isArray(schema.required)) {
        for (const requiredKey of schema.required) {
          if (typeof requiredKey !== 'string') continue;
          if (!Object.prototype.hasOwnProperty.call(value, requiredKey)) {
            pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel}.${requiredKey} is required`);
          }
        }
      }
      for (const [key, childValue] of Object.entries(value)) {
        if (Object.prototype.hasOwnProperty.call(properties, key) && isPlainObject(properties[key])) {
          validateJsonSchemaValue(childValue, properties[key], `${pathLabel}.${key}`, errors);
          continue;
        }
        if (schema.additionalProperties === false) {
          pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel}.${key} is not allowed by configSchema`);
        } else if (isPlainObject(schema.additionalProperties)) {
          validateJsonSchemaValue(childValue, schema.additionalProperties, `${pathLabel}.${key}`, errors);
        }
      }
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel} must be an array`);
        return;
      }
      if (isPlainObject(schema.items)) {
        value.forEach((entry: any, index: number) => validateJsonSchemaValue(entry, schema.items, `${pathLabel}[${index}]`, errors));
      }
      return;
    }
    case 'string':
      if (typeof value !== 'string') pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel} must be a string`);
      return;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel} must be a number`);
      return;
    case 'integer':
      if (!Number.isInteger(value)) pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel} must be an integer`);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel} must be a boolean`);
      return;
    case 'null':
      if (value !== null) pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel} must be null`);
      return;
    default:
      return;
  }
}

export function resolveModuleConfig(moduleId: string, moduleConfig: any, manifest: AnyRecord, errors: RegistryError[]) {
  const rawConfig = moduleConfig || {};
  if (!isPlainObject(rawConfig)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.modules.${moduleId}.config must be an object`);
    return {};
  }
  if (!isPlainObject(manifest.configSchema)
    || manifest.configSchema.schemaType !== PLUGIN_CONFIG_SCHEMA_TYPE
    || manifest.configSchema.schemaVersion !== PLUGIN_CONFIG_SCHEMA_VERSION
    || !isPlainObject(manifest.configSchema.schema)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `Module '${moduleId}' cannot validate config because its configSchema is invalid`);
    return {};
  }

  const defaults = isPlainObject(manifest.configSchema.defaults)
    ? cloneSerializable(manifest.configSchema.defaults)
    : {};
  const resolved = {
    ...defaults,
    ...(cloneSerializable(rawConfig) || {}),
  };
  validateJsonSchemaValue(resolved, manifest.configSchema.schema, `config.plugins.modules.${moduleId}.config`, errors);
  return resolved;
}

function validateGateTypes(manifest: AnyRecord, errors: RegistryError[]) {
  if (manifest.kind !== 'gate') {
    if (manifest.gateTypes !== undefined) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Module '${manifest.moduleId || '<unknown>'}' is kind '${manifest.kind}' and cannot declare gateTypes`);
    }
    return;
  }

  if (!Array.isArray(manifest.gateTypes) || manifest.gateTypes.length === 0) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Gate module '${manifest.moduleId || '<unknown>'}' must declare at least one gateTypes entry`);
    return;
  }

  const seenGateTypes = new Set();
  for (const gateType of manifest.gateTypes) {
    if (typeof gateType !== 'string' || !gateType.trim()) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Gate module '${manifest.moduleId || '<unknown>'}' declared an empty gate type`);
      continue;
    }
    if (gateType.includes(':')) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Gate module '${manifest.moduleId || '<unknown>'}' gate type '${gateType}' must be an unqualified type name, not a stage id`);
      continue;
    }
    if (isReservedRegistryKey(gateType)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Gate module '${manifest.moduleId || '<unknown>'}' gate type '${gateType}' is reserved and cannot be used as a registry key`);
      continue;
    }
    if (seenGateTypes.has(gateType)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Gate module '${manifest.moduleId || '<unknown>'}' declared duplicate gate type '${gateType}'`);
      continue;
    }
    seenGateTypes.add(gateType);

    const expectedStageId = `gate:${gateType}`;
    if (Array.isArray(manifest.stageIds) && !manifest.stageIds.includes(expectedStageId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_GATE_TYPE_INVALID, `Gate module '${manifest.moduleId || '<unknown>'}' gate type '${gateType}' must claim matching stageId '${expectedStageId}'`);
    }
  }
}

export function validateCapabilities(manifest: AnyRecord, resolvedTrustTier: string, capabilityAllowlist: AnyRecord, errors: RegistryError[]) {
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CAPABILITY_DECLARATION_INVALID, `Module '${manifest.moduleId}' must declare at least one capability`);
    return;
  }

  const seen = new Set();
  const knownCapabilities = allKnownCapabilities();
  const forbiddenCapabilities = (PLUGIN_FORBIDDEN_CAPABILITIES as AnyRecord)[manifest.kind] || [];
  const requiredCapabilities = (PLUGIN_REQUIRED_CAPABILITIES as AnyRecord)[manifest.kind] || [];
  const optionalCapabilities = (PLUGIN_OPTIONAL_CAPABILITIES as AnyRecord)[manifest.kind] || [];
  for (const capability of manifest.capabilities) {
    if (typeof capability !== 'string' || !capability.trim()) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CAPABILITY_DECLARATION_INVALID, `Module '${manifest.moduleId}' declared an empty capability`);
      continue;
    }
    if (seen.has(capability)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CAPABILITY_DECLARATION_INVALID, `Module '${manifest.moduleId}' declared duplicate capability '${capability}'`);
      continue;
    }
    seen.add(capability);
    if (!knownCapabilities.has(capability)) {
      pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_UNKNOWN, `Module '${manifest.moduleId}' declared unknown capability '${capability}'`);
      continue;
    }
    if (forbiddenCapabilities.includes(capability)) {
      pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_FORBIDDEN_FOR_KIND, `Module '${manifest.moduleId}' kind '${manifest.kind}' cannot declare '${capability}'`);
      continue;
    }
  }

  for (const required of requiredCapabilities) {
    if (!seen.has(required)) {
      pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_REQUIRED_MISSING, `Module '${manifest.moduleId}' must declare required capability '${required}'`);
    }
  }

  if (resolvedTrustTier === 'restricted') {
    const allowlisted = new Set(capabilityAllowlist[manifest.moduleId] || []);
    for (const gated of optionalCapabilities) {
      if (!seen.has(gated)) continue;
      if (!allowlisted.has(gated)) {
        pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_RESTRICTED_NOT_ALLOWLISTED, `Restricted module '${manifest.moduleId}' requested gated capability '${gated}' without allowlist approval`);
      }
    }
    if (seen.has('dispatch.worker_runtime')) {
      pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_FORBIDDEN_FOR_TRUST_TIER, `Restricted module '${manifest.moduleId}' cannot declare 'dispatch.worker_runtime'`);
    }
  }
}

export function validateTrustPolicy(manifest: AnyRecord, override: AnyRecord, resolvedTrustTier: string, errors: RegistryError[]) {
  if (manifest.sourceType !== 'builtin' && manifest.trustTier === 'trusted') {
    pushError(
      errors,
      PLUGIN_REJECTION_CODES.REGISTRY_TRUST_OVERRIDE_INVALID,
      `Module '${manifest.moduleId}' sourceType '${manifest.sourceType}' must declare trustTier 'restricted'; trusted elevation requires explicit config.plugins.modules.${manifest.moduleId}.trustOverride`,
    );
  }
  if (manifest.sourceType === 'external' && resolvedTrustTier === 'trusted') {
    pushError(
      errors,
      PLUGIN_REJECTION_CODES.REGISTRY_TRUST_OVERRIDE_INVALID,
      `External module '${manifest.moduleId}' cannot be elevated to trustTier 'trusted' in v1`,
    );
  }
}

export function validateManifest(definition: AnyRecord, errors: RegistryError[]) {
  const manifest = definition?.manifest;
  if (!isPlainObject(manifest)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, 'Discovered plugin definition is missing a manifest object');
    return false;
  }

  if (typeof manifest.moduleId !== 'string' || !manifest.moduleId.trim()) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, 'Discovered plugin definition is missing a non-empty moduleId');
  } else if (isReservedRegistryKey(manifest.moduleId)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId}' moduleId is reserved and cannot be used as a registry key`);
  }
  if (manifest.contractVersion !== PLUGIN_CONTRACT_VERSION) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CONTRACT_VERSION_UNSUPPORTED, `Module '${manifest.moduleId || '<unknown>'}' must declare contractVersion '${PLUGIN_CONTRACT_VERSION}'`);
  }
  if (!PLUGIN_KINDS.has(manifest.kind)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' declared unknown kind '${manifest.kind}'`);
  }
  if (!PLUGIN_HOOK_FAMILIES.has(manifest.hookFamily)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' declared unknown hookFamily '${manifest.hookFamily}'`);
  }
  if (PLUGIN_KINDS.has(manifest.kind) && !(PLUGIN_ALLOWED_HOOK_FAMILIES as AnyRecord)[manifest.kind]?.has(manifest.hookFamily)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_KIND_HOOK_MISMATCH, `Module '${manifest.moduleId || '<unknown>'}' kind '${manifest.kind}' cannot use hookFamily '${manifest.hookFamily}'`);
  }
  if (!Array.isArray(manifest.stageIds) || manifest.stageIds.length === 0) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `Module '${manifest.moduleId || '<unknown>'}' must declare at least one stageId`);
  } else {
    const seenStageIds = new Set();
    for (const stageId of manifest.stageIds) {
      if (typeof stageId !== 'string' || !stageId.trim()) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `Module '${manifest.moduleId || '<unknown>'}' declared an empty stageId`);
        continue;
      }
      if (seenStageIds.has(stageId)) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `Module '${manifest.moduleId || '<unknown>'}' declared duplicate stageId '${stageId}'`);
        continue;
      }
      seenStageIds.add(stageId);
      if (!(PLUGIN_STAGE_IDS as AnyRecord)[manifest.kind]?.has(stageId)) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `Module '${manifest.moduleId || '<unknown>'}' kind '${manifest.kind}' cannot claim stageId '${stageId}'`);
      }
    }
  }
  if (!PLUGIN_SOURCE_TYPES.has(manifest.sourceType)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' declared unknown sourceType '${manifest.sourceType}'`);
  }
  if (!PLUGIN_TRUST_TIERS.has(manifest.trustTier)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' declared unknown trustTier '${manifest.trustTier}'`);
  }
  if (manifest.displayName !== undefined && typeof manifest.displayName !== 'string') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' displayName must be a string`);
  }
  if (manifest.description !== undefined && typeof manifest.description !== 'string') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' description must be a string`);
  }
  if (typeof manifest.defaultEnabled !== 'boolean') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' defaultEnabled must be a boolean`);
  }
  if (manifest.priority !== undefined && typeof manifest.priority !== 'number') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' priority must be a number`);
  }

  validateGateTypes(manifest, errors);
  validateManifestConfigSchema(manifest, errors);
  return true;
}

export function validateImplementation(definition: AnyRecord, errors: RegistryError[]) {
  const manifest = definition.manifest;
  const requiredMethod = (PLUGIN_METHOD_BY_KIND as AnyRecord)[manifest.kind];
  if (!requiredMethod) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_IMPLEMENTATION_MISSING, `Module '${manifest.moduleId}' kind '${manifest.kind}' has no registered implementation method mapping`);
    return;
  }
  if (!isPlainObject(definition.implementation) || typeof definition.implementation[requiredMethod] !== 'function') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_IMPLEMENTATION_MISSING, `Module '${manifest.moduleId}' must implement '${requiredMethod}(input, ctx)'`);
  }
}
