import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { PluginManifest } from '@kubeclaw/plugin-sdk';
import { RegistryError } from './errors.ts';

interface AjvValidator {
  (value: unknown): boolean;
  errors?: unknown[] | null;
}

interface AjvInstance {
  addSchema(schema: object): void;
  compile(schema: object): AjvValidator;
}

const schemaUrl = new URL(
  '../../contracts/plugin-system/v2/plugin-system-v2.schema.json',
  import.meta.url,
);
const contract = JSON.parse(fs.readFileSync(schemaUrl, 'utf8')) as {
  $id: string;
  [key: string]: unknown;
};
const AjvConstructor = Ajv2020 as unknown as new (options: {
  allErrors: boolean;
  strict: boolean;
  useDefaults?: boolean;
}) => AjvInstance;
const installFormats = addFormats as unknown as (instance: AjvInstance) => AjvInstance;
const ajv = new AjvConstructor({ allErrors: true, strict: true });
installFormats(ajv);
ajv.addSchema(contract);
const defaultsAjv = new AjvConstructor({ allErrors: true, strict: true, useDefaults: true });
installFormats(defaultsAjv);
defaultsAjv.addSchema(contract);
const validate = ajv.compile({ $ref: `${contract.$id}#/$defs/pluginManifest` });
const referencedValidators = new Map<string, AjvValidator>();
const referencedDefaultValidators = new Map<string, AjvValidator>();
const contractValidators = new Map<string, AjvValidator>();

export function parsePluginManifest(source: string, manifestPath: string): PluginManifest {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new RegistryError('REGISTRY_MANIFEST_INVALID', `Invalid JSON in ${manifestPath}`, {
      manifestPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!validate(value)) {
    throw new RegistryError('REGISTRY_MANIFEST_INVALID', `Invalid v2 plugin manifest ${manifestPath}`, {
      manifestPath,
      errors: validate.errors ?? [],
    });
  }
  return value as PluginManifest;
}

export function validateReferencedSchema(source: string, schemaPath: string): void {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new RegistryError('REGISTRY_MANIFEST_INVALID', `Invalid JSON Schema in ${schemaPath}`, {
      schemaPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    referencedValidators.set(schemaPath, ajv.compile(value as object));
    referencedDefaultValidators.set(schemaPath, defaultsAjv.compile(value as object));
  } catch (error) {
    throw new RegistryError('REGISTRY_MANIFEST_INVALID', `Invalid JSON Schema in ${schemaPath}`, {
      schemaPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export function resolveReferencedValue(schemaPath: string, value: unknown): unknown {
  const validateValue = referencedDefaultValidators.get(schemaPath);
  if (!validateValue) throw new Error(`REGISTRY_SCHEMA_NOT_COMPILED:${schemaPath}`);
  const resolved = structuredClone(value);
  if (!validateValue(resolved)) {
    throw new RegistryError('REGISTRY_RESULT_INVALID', `Value failed schema ${schemaPath}`, {
      schemaPath,
      errors: validateValue.errors ?? [],
    });
  }
  return resolved;
}

export function validateReferencedValue(schemaPath: string, value: unknown): void {
  const validateValue = referencedValidators.get(schemaPath);
  if (!validateValue) throw new Error(`REGISTRY_SCHEMA_NOT_COMPILED:${schemaPath}`);
  if (!validateValue(value)) {
    throw new RegistryError('REGISTRY_RESULT_INVALID', `Value failed schema ${schemaPath}`, {
      schemaPath,
      errors: validateValue.errors ?? [],
    });
  }
}

export function validateContractValue(definition: string, value: unknown): void {
  let validator = contractValidators.get(definition);
  if (!validator) {
    validator = ajv.compile({ $ref: `${contract.$id}#/$defs/${definition}` });
    contractValidators.set(definition, validator);
  }
  if (!validator(value)) {
    throw new RegistryError('REGISTRY_RESULT_INVALID', `Value failed canonical contract ${definition}`, {
      definition,
      errors: validator.errors ?? [],
    });
  }
}
