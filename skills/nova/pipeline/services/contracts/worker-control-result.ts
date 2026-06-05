import { createContractInvalidError } from '../contract-diagnostics.ts';
import { cloneSerializable as cloneSerializableValue } from '../serialization.ts';

type UnknownRecord = Record<string, any>;

const CANONICAL_OUTCOME_CLASSES = new Set([
  'passed',
  'fix_requested',
  'waiting',
  'retrying',
  'needs_nova',
  'blocked',
  'error',
  'timeout',
  'rate_limited',
]);

export function cloneSerializable(value: unknown): any {
  return cloneSerializableValue(value);
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function buildTypedWorkerControlResult({
  producerType,
  nextAction,
  issueType,
  summary,
  outcomeClass,
  metadata = {},
  findings = [],
  backendKind = null,
  dispatchRef = null,
  typedMetadata = {},
}: UnknownRecord = {}): UnknownRecord {
  const diagnostics: UnknownRecord = {
    summary,
    metadata,
    typed: {
      worker: {
        schemaVersion: 'v1',
        outcomeClass,
        backendKind,
        dispatchRef,
        metadata: typedMetadata,
      },
    },
  };
  if (Array.isArray(findings) && findings.length > 0) diagnostics.findings = findings;

  return {
    schemaVersion: 'v1',
    producerKind: 'worker',
    producerType,
    nextAction,
    ...(issueType ? { issueType } : {}),
    diagnostics,
  };
}

export function isTypedWorkerControlResult(result: unknown, producerType: string | null): result is UnknownRecord {
  return isPlainObject(result)
    && result?.schemaVersion === 'v1'
    && result?.producerKind === 'worker'
    && result?.producerType === producerType
    && typeof result?.nextAction === 'string';
}

export function coerceTypedWorkerControlResult(result: unknown, { producerType }: { producerType?: string | null | undefined } = {}): UnknownRecord {
  if (isTypedWorkerControlResult(result, producerType ?? null)) return result;
  throw new Error(`worker:${producerType || 'unknown'} plugin output must be a typed worker control result; compatibility-shaped backend results are not accepted at the worker boundary`);
}

export function validateTypedWorkerControlResult(result: unknown, {
  producerType,
  stageId = `worker:${producerType || 'unknown'}`,
  allowedNextActions = ['pass', 'retry', 'request_fix', 'block'],
}: {
  producerType?: string | null | undefined;
  stageId?: string;
  allowedNextActions?: readonly string[];
} = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(result)) {
    errors.push('result must be an object');
    return errors;
  }
  if (result.schemaVersion !== 'v1') errors.push("schemaVersion must be 'v1'");
  if (result.producerKind !== 'worker') errors.push("producerKind must be 'worker'");
  if (result.producerType !== producerType) errors.push(`producerType must be '${producerType}'`);
  if (!allowedNextActions.includes(result.nextAction)) {
    errors.push(`nextAction must be ${allowedNextActions.map((value) => `'${value}'`).join(', ').replace(/, ([^,]+)$/, ', or $1')} for ${stageId}`);
  }
  const diagnostics = isPlainObject(result.diagnostics) ? result.diagnostics : null;
  const typed = isPlainObject(diagnostics?.typed) ? diagnostics.typed : null;
  const typedWorker = isPlainObject(typed?.worker) ? typed.worker : null;
  if (!diagnostics) errors.push('diagnostics must be an object');
  if (!typed) errors.push('diagnostics.typed must be an object');
  if (!typedWorker) errors.push('diagnostics.typed.worker must be an object');
  else {
    if (typedWorker.schemaVersion !== 'v1') errors.push("diagnostics.typed.worker.schemaVersion must be 'v1'");
    if (!CANONICAL_OUTCOME_CLASSES.has(String(typedWorker.outcomeClass || '').trim())) {
      errors.push('diagnostics.typed.worker.outcomeClass must be a canonical pipeline step outcome');
    }
  }
  return errors;
}

export function normalizeTypedWorkerControlResult(rawResult: unknown, {
  producerType,
  label,
  stageId = `worker:${producerType || 'unknown'}`,
  coerce,
  moduleId = null,
  input = null,
  invocation = null,
}: {
  producerType?: string | null | undefined;
  label?: string | null;
  stageId?: string;
  coerce?: (value: unknown) => UnknownRecord;
  moduleId?: string | null;
  input?: unknown;
  invocation?: unknown;
} = {}): UnknownRecord {
  const coerceControl = coerce || ((value: unknown) => coerceTypedWorkerControlResult(value, { producerType }));
  let controlResult: UnknownRecord;
  try {
    controlResult = coerceControl(rawResult);
  } catch (error) {
    const validationErrors = [error instanceof Error && error.message ? error.message : 'coercion failed'];
    throw createContractInvalidError(`${label} worker returned invalid control result: ${validationErrors.join('; ')}`, {
      label,
      stageId,
      hookFamily: 'worker.execute',
      moduleId,
      producerKind: 'worker',
      producerType,
      validationErrors,
      rawResult,
      input,
      invocation,
    });
  }
  const errors = validateTypedWorkerControlResult(controlResult, { producerType, stageId });
  if (errors.length > 0) {
    throw createContractInvalidError(`${label} worker returned invalid control result: ${errors.join('; ')}`, {
      label,
      stageId,
      hookFamily: 'worker.execute',
      moduleId,
      producerKind: 'worker',
      producerType,
      validationErrors: errors,
      rawResult,
      coercedResult: controlResult,
      input,
      invocation,
    });
  }
  return controlResult;
}
