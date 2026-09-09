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
const validate = ajv.compile({ $ref: `${contract.$id}#/$defs/pluginManifest` });

export interface ReferencedSchemaValidator {
  readonly validate: (value: unknown) => void;
  readonly resolve: (value: unknown) => unknown;
}
export type ReferencedSchemaValidators = ReadonlyMap<string, ReferencedSchemaValidator>;

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

// Each referenced document owns its $id namespace. Validators retain the exact
// schema bytes read at build time, and live only as long as their snapshot.
export function validateReferencedSchema(source: string, schemaPath: string): ReferencedSchemaValidator {
  try {
    const value = JSON.parse(source) as object;
    const compile = (useDefaults: boolean): AjvValidator => {
      const instance = new AjvConstructor({ allErrors: true, strict: true, useDefaults });
      installFormats(instance);
      instance.addSchema(contract);
      return instance.compile(value);
    };
    const validator = compile(false);
    const defaultsValidator = compile(true);
    const check = (compiled: AjvValidator, input: unknown): void => {
      if (!compiled(input)) {
        throw new RegistryError('REGISTRY_RESULT_INVALID', `Value failed schema ${schemaPath}`, {
          schemaPath, errors: compiled.errors ?? [],
        });
      }
    };
    return Object.freeze({
      validate: (input: unknown): void => check(validator, input),
      resolve: (input: unknown): unknown => {
        const resolved = structuredClone(input);
        check(defaultsValidator, resolved);
        return resolved;
      },
    });
  } catch (error) {
    throw new RegistryError('REGISTRY_MANIFEST_INVALID', `Invalid JSON Schema in ${schemaPath}`, {
      schemaPath, cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function referencedValidator(schemaPath: string, schemas: ReferencedSchemaValidators): ReferencedSchemaValidator {
  const validator = schemas.get(schemaPath);
  if (!validator) throw new Error(`REGISTRY_SCHEMA_NOT_COMPILED:${schemaPath}`);
  return validator;
}

export function resolveReferencedValue(schemaPath: string, value: unknown, schemas: ReferencedSchemaValidators): unknown {
  return referencedValidator(schemaPath, schemas).resolve(value);
}

export function validateReferencedValue(schemaPath: string, value: unknown, schemas: ReferencedSchemaValidators): void {
  referencedValidator(schemaPath, schemas).validate(value);
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
