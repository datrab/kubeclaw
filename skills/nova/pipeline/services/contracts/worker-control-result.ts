import { createContractInvalidError } from '../contract-diagnostics.ts';
import { cloneSerializable as cloneSerializableValue } from '../serialization.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
import {
  coerceControlResultOrThrow,
  type ControlResultNormalizeOptions,
  isTypedControlResult,
  validateControlResultEnvelope,
} from './control-result-envelope.ts';
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

function workerOutcomeClassText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

export function isTypedWorkerControlResult(
  result: unknown,
  producerType: string | null | undefined
): result is UnknownRecord {
  return isTypedControlResult(result, 'worker', producerType);
}

export function coerceTypedWorkerControlResult(result: unknown, { producerType }: { producerType?: string | null | undefined } = {}): UnknownRecord {
  if (isTypedWorkerControlResult(result, selectDefinedValue(() => (producerType), () => (null)))) return result;
  throw new Error(`worker:${selectTruthyValue(() => (producerType), () => ('missing_producer_type'))} plugin output must be a typed worker control result; compatibility-shaped backend results are not accepted at the worker boundary`);
}

function validateTypedWorkerMetadata(
  typedWorker: UnknownRecord | null,
  errors: string[]
) {
  if (!typedWorker) {
    errors.push('diagnostics.typed.worker must be an object');
    return;
  }
  if (typedWorker.schemaVersion !== 'v1') {
    errors.push("diagnostics.typed.worker.schemaVersion must be 'v1'");
  }
  if (!CANONICAL_OUTCOME_CLASSES.has(
    workerOutcomeClassText(typedWorker.outcomeClass)
  )) {
    errors.push(
      'diagnostics.typed.worker.outcomeClass must be a canonical pipeline step outcome'
    );
  }
}

export function validateTypedWorkerControlResult(result: unknown, {
  producerType,
  stageId = `worker:${selectTruthyValue(() => (producerType), () => ('missing_producer_type'))}`,
  allowedNextActions = ['pass', 'retry', 'request_fix', 'block'],
}: {
  producerType?: string | null | undefined;
  stageId?: string;
  allowedNextActions?: readonly string[];
} = {}): string[] {
  const { errors, controlResult } = validateControlResultEnvelope(result, {
    producerKind: 'worker',
    ...(producerType !== undefined ? { producerType } : {}),
    stageId,
    allowedNextActions,
  });
  if (!controlResult) return errors;
  const diagnostics = isPlainObject(controlResult.diagnostics) ? controlResult.diagnostics : null;
  const typed = isPlainObject(diagnostics?.typed) ? diagnostics.typed : null;
  const typedWorker = isPlainObject(typed?.worker) ? typed.worker : null;
  if (!diagnostics) errors.push('diagnostics must be an object');
  if (!typed) errors.push('diagnostics.typed must be an object');
  validateTypedWorkerMetadata(typedWorker, errors);
  return errors;
}

export function normalizeTypedWorkerControlResult(rawResult: unknown, {
  producerType,
  label,
  stageId = `worker:${selectTruthyValue(() => (producerType), () => ('missing_producer_type'))}`,
  coerce,
  moduleId = null,
  input = null,
  invocation = null,
}: ControlResultNormalizeOptions = {}): UnknownRecord {
  if (typeof coerce !== 'function') {
    throw createContractInvalidError(`${label} worker missing explicit control result coercer`, {
      label,
      stageId,
      hookFamily: 'worker.execute',
      moduleId,
      producerKind: 'worker',
      producerType,
      validationErrors: ['coerce must be provided by the worker composition boundary'],
      rawResult,
      input,
      invocation,
    });
  }
  const controlResult = coerceControlResultOrThrow(rawResult, {
    coerce,
    messagePrefix: `${label} worker returned invalid control result`,
    diagnostics: {
      label,
      stageId,
      hookFamily: 'worker.execute',
      moduleId,
      producerKind: 'worker',
      producerType,
      input,
      invocation,
    },
  });
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
