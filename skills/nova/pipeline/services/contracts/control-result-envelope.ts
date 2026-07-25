import { createContractInvalidError } from '../contract-diagnostics.ts';

type UnknownRecord = Record<string, any>;

export interface ControlResultNormalizeOptions {
  producerType?: string | null | undefined;
  label?: string | null;
  stageId?: string;
  coerce?: (value: unknown) => UnknownRecord;
  moduleId?: string | null;
  input?: unknown;
  invocation?: unknown;
}

export function coerceControlResultOrThrow(rawResult: unknown, {
  coerce,
  messagePrefix,
  diagnostics,
}: {
  coerce: (value: unknown) => UnknownRecord;
  messagePrefix: string;
  diagnostics: Record<string, unknown>;
}): UnknownRecord {
  try {
    return coerce(rawResult);
  } catch (error: any) {
    const validationErrors = [error instanceof Error && error.message ? error.message : 'coercion failed'];
    throw createContractInvalidError(`${messagePrefix}: ${validationErrors.join('; ')}`, {
      ...diagnostics,
      validationErrors,
      rawResult,
    });
  }
}

export function isPlainControlResult(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isTypedControlResult(
  result: unknown,
  producerKind: string,
  producerType: string | null | undefined,
  allowAnyProducerType: any = false,
): result is UnknownRecord {
  if (!isPlainControlResult(result)) return false;
  const producerMatches = allowAnyProducerType && !producerType
    ? typeof result.producerType === 'string'
    : result.producerType === producerType;
  return result.schemaVersion === 'v1'
    && result.producerKind === producerKind
    && producerMatches
    && typeof result.nextAction === 'string';
}

export function validateControlResultEnvelope(result: unknown, {
  producerKind,
  producerType,
  stageId,
  allowedNextActions,
  producerTypeOptional = false,
}: {
  producerKind: string;
  producerType?: string | null;
  stageId: string;
  allowedNextActions: readonly string[];
  producerTypeOptional?: boolean;
}): { errors: string[]; controlResult: UnknownRecord | null } {
  const errors: string[] = [];
  if (!isPlainControlResult(result)) {
    return { errors: ['result must be an object'], controlResult: null };
  }
  if (result.schemaVersion !== 'v1') errors.push("schemaVersion must be 'v1'");
  if (result.producerKind !== producerKind) errors.push(`producerKind must be '${producerKind}'`);
  if ((!producerTypeOptional || producerType) && result.producerType !== producerType) {
    errors.push(`producerType must be '${producerType}'`);
  }
  if (!allowedNextActions.includes(result.nextAction)) {
    const formatted = allowedNextActions.map((value: any) => `'${value}'`).join(', ').replace(/, ([^,]+)$/, ', or $1');
    errors.push(`nextAction must be ${formatted} for ${stageId}`);
  }
  return { errors, controlResult: result };
}
