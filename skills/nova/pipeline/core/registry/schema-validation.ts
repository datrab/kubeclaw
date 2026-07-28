import {
  PLUGIN_CONFIG_SCHEMA_TYPE,
  PLUGIN_CONFIG_SCHEMA_VERSION,
  PLUGIN_REJECTION_CODES,
} from '../constants.ts';
import { isPlainObject } from '../../services/validation.ts';
import { cloneSerializable } from '../../services/serialization.ts';
import { createRegistryDictionary } from './dictionary.ts';

type AnyRecord = Record<string, any>;
type RegistryError = { code: string; message: string; [key: string]: any };

function pushError(errors: RegistryError[], code: string, message: string): void {
  errors.push({ code, message });
}

export function validateManifestConfigSchema(manifest: AnyRecord, errors: RegistryError[]): void {
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

function validateObject(
  value: unknown,
  schema: AnyRecord,
  pathLabel: string,
  errors: RegistryError[],
): void {
  if (!isPlainObject(value)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel} must be an object`);
    return;
  }
  const properties = isPlainObject(schema.properties) ? schema.properties : createRegistryDictionary();
  for (const requiredKey of Array.isArray(schema.required) ? schema.required : []) {
    if (typeof requiredKey === 'string' && !Object.prototype.hasOwnProperty.call(value, requiredKey)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel}.${requiredKey} is required`);
    }
  }
  for (const [key, childValue] of Object.entries(value as AnyRecord)) {
    if (Object.prototype.hasOwnProperty.call(properties, key) && isPlainObject(properties[key])) {
      validateJsonSchemaValue(childValue, properties[key], `${pathLabel}.${key}`, errors);
    } else if (schema.additionalProperties === false) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel}.${key} is not allowed by configSchema`);
    } else if (isPlainObject(schema.additionalProperties)) {
      validateJsonSchemaValue(childValue, schema.additionalProperties, `${pathLabel}.${key}`, errors);
    }
  }
}

function validateArray(
  value: unknown,
  schema: AnyRecord,
  pathLabel: string,
  errors: RegistryError[],
): void {
  if (!Array.isArray(value)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel} must be an array`);
    return;
  }
  if (!isPlainObject(schema.items)) return;
  value.forEach((entry, index) => validateJsonSchemaValue(entry, schema.items, `${pathLabel}[${index}]`, errors));
}

function validatePrimitive(
  value: unknown,
  schemaType: unknown,
  pathLabel: string,
  errors: RegistryError[],
): void {
  const invalid = (
    (schemaType === 'string' && typeof value !== 'string')
    || (schemaType === 'number' && (typeof value !== 'number' || !Number.isFinite(value)))
    || (schemaType === 'integer' && !Number.isInteger(value))
    || (schemaType === 'boolean' && typeof value !== 'boolean')
    || (schemaType === 'null' && value !== null)
  );
  if (invalid) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel} must be ${String(schemaType)}`);
  }
}

function validateJsonSchemaValue(
  value: unknown,
  schema: AnyRecord,
  pathLabel: string,
  errors: RegistryError[],
): void {
  if (!isPlainObject(schema)) return;
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => Object.is(entry, value))) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `${pathLabel} must be one of: ${schema.enum.map((entry) => JSON.stringify(entry)).join(', ')}`);
    return;
  }
  if (schema.type === 'object') return validateObject(value, schema, pathLabel, errors);
  if (schema.type === 'array') return validateArray(value, schema, pathLabel, errors);
  validatePrimitive(value, schema.type, pathLabel, errors);
}

function validConfigSchema(manifest: AnyRecord): boolean {
  return isPlainObject(manifest.configSchema)
    && manifest.configSchema.schemaType === PLUGIN_CONFIG_SCHEMA_TYPE
    && manifest.configSchema.schemaVersion === PLUGIN_CONFIG_SCHEMA_VERSION
    && isPlainObject(manifest.configSchema.schema);
}

export function resolveModuleConfig(
  moduleId: string,
  moduleConfig: unknown,
  manifest: AnyRecord,
  errors: RegistryError[],
): AnyRecord {
  const rawConfig = moduleConfig === undefined ? createRegistryDictionary() : moduleConfig;
  if (!isPlainObject(rawConfig)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.modules.${moduleId}.config must be an object`);
    return createRegistryDictionary();
  }
  if (!validConfigSchema(manifest)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `Module '${moduleId}' cannot validate config because its configSchema is invalid`);
    return createRegistryDictionary();
  }
  const defaults = isPlainObject(manifest.configSchema.defaults)
    ? cloneSerializable(manifest.configSchema.defaults)
    : createRegistryDictionary();
  const clonedRawConfig = cloneSerializable(rawConfig);
  if (!isPlainObject(clonedRawConfig)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.modules.${moduleId}.config could not be cloned into an object`);
    return createRegistryDictionary();
  }
  const resolved = { ...defaults, ...clonedRawConfig };
  validateJsonSchemaValue(resolved, manifest.configSchema.schema, `config.plugins.modules.${moduleId}.config`, errors);
  return resolved;
}
