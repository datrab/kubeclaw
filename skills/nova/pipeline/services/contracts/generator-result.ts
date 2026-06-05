import { createContractInvalidError } from '../contract-diagnostics.ts';

type UnknownRecord = Record<string, unknown>;

export interface GeneratorArtifactRef extends UnknownRecord {
  type: string;
  path: string;
}

export interface GeneratorResult extends UnknownRecord {
  schemaVersion: 'v1';
  producerKind: 'generator';
  producerType: string;
  outputs: UnknownRecord;
  artifacts?: GeneratorArtifactRef[];
  diagnostics?: UnknownRecord;
}

interface GeneratorResultOptions {
  producerType?: string | null;
  stageId?: string;
}

interface NormalizeGeneratorResultOptions extends GeneratorResultOptions {
  label?: string | null;
  moduleId?: string | null;
  input?: unknown;
  invocation?: unknown;
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatExpectedProducerType(producerType: string | null = null): string {
  return producerType ? `generator:${producerType}` : 'generator';
}

export function buildGeneratorArtifactRef(
  type: string,
  artifactPath: string | null | undefined,
  extras: UnknownRecord = {},
): GeneratorArtifactRef | null {
  if (!artifactPath) return null;
  return {
    type,
    path: artifactPath,
    ...extras,
  } as GeneratorArtifactRef;
}

export function buildGeneratorResult(
  producerType: string,
  { artifacts = [], outputs = {}, diagnostics = {} }: {
    artifacts?: Array<GeneratorArtifactRef | null | undefined | false>;
    outputs?: UnknownRecord;
    diagnostics?: UnknownRecord | null;
  } = {},
): GeneratorResult {
  const result: GeneratorResult = {
    schemaVersion: 'v1',
    producerKind: 'generator',
    producerType,
    outputs,
  };
  const filteredArtifacts = artifacts.filter(Boolean) as GeneratorArtifactRef[];
  if (filteredArtifacts.length) result.artifacts = filteredArtifacts;
  if (diagnostics && Object.keys(diagnostics).length) result.diagnostics = diagnostics;
  return result;
}

export function isGeneratorResult(result: unknown, producerType: string | null = null): result is GeneratorResult {
  return isPlainObject(result)
    && result.schemaVersion === 'v1'
    && result.producerKind === 'generator'
    && (producerType ? result.producerType === producerType : isNonEmptyString(result.producerType))
    && isPlainObject(result.outputs);
}

export function coerceGeneratorResult(
  result: unknown,
  { producerType = null }: GeneratorResultOptions = {},
): GeneratorResult {
  if (isGeneratorResult(result, producerType)) return result;
  throw new Error(`${formatExpectedProducerType(producerType)} plugin output must be a typed generator result; only schemaVersion 'v1' with producerKind 'generator' is accepted`);
}

export function validateGeneratorArtifactRef(ref: unknown, pathPrefix = 'artifacts[]'): string[] {
  const errors: string[] = [];
  if (!isPlainObject(ref)) {
    errors.push(`${pathPrefix} must be an object`);
    return errors;
  }
  if (!isNonEmptyString(ref.type)) errors.push(`${pathPrefix}.type must be a non-empty string`);
  if (!isNonEmptyString(ref.path)) errors.push(`${pathPrefix}.path must be a non-empty string`);
  return errors;
}

export function validateGeneratorResult(result: unknown, {
  producerType = null,
  stageId = `generator:${producerType || 'unknown'}`,
}: GeneratorResultOptions = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(result)) {
    errors.push('result must be an object');
    return errors;
  }
  if (result.schemaVersion !== 'v1') errors.push("schemaVersion must be 'v1'");
  if (result.producerKind !== 'generator') errors.push("producerKind must be 'generator'");
  if (!isNonEmptyString(result.producerType)) errors.push('producerType must be a non-empty string');
  if (producerType && result.producerType !== producerType) errors.push(`producerType must be '${producerType}' for ${stageId}`);
  if (!isPlainObject(result.outputs)) errors.push('outputs must be an object');
  if (result.artifacts !== undefined) {
    if (!Array.isArray(result.artifacts)) {
      errors.push('artifacts must be an array when present');
    } else {
      result.artifacts.forEach((artifact, index) => {
        errors.push(...validateGeneratorArtifactRef(artifact, `artifacts[${index}]`));
      });
    }
  }
  if (result.diagnostics !== undefined && !isPlainObject(result.diagnostics)) {
    errors.push('diagnostics must be an object when present');
  }
  return errors;
}

export function normalizeGeneratorResult(rawResult: unknown, {
  producerType = null,
  label = null,
  stageId = `generator:${producerType || 'unknown'}`,
  moduleId = null,
  input = null,
  invocation = null,
}: NormalizeGeneratorResultOptions = {}): GeneratorResult {
  let generatorResult: GeneratorResult;
  try {
    generatorResult = coerceGeneratorResult(rawResult, { producerType });
  } catch (error) {
    const validationErrors = [error instanceof Error && error.message ? error.message : 'coercion failed'];
    throw createContractInvalidError(`${label || stageId} generator returned invalid result: ${validationErrors.join('; ')}`, {
      label: label || stageId,
      stageId,
      hookFamily: 'generator.run',
      producerKind: 'generator',
      producerType,
      validationErrors,
      moduleId,
      rawResult,
      input,
      invocation,
    });
  }
  const errors = validateGeneratorResult(generatorResult, { producerType, stageId });
  if (errors.length > 0) {
    throw createContractInvalidError(`${label || stageId} generator returned invalid result: ${errors.join('; ')}`, {
      label: label || stageId,
      stageId,
      hookFamily: 'generator.run',
      producerKind: 'generator',
      producerType,
      validationErrors: errors,
      moduleId,
      rawResult,
      coercedResult: generatorResult,
      input,
      invocation,
    });
  }
  return generatorResult;
}
