import { validateGateRemediationControlResult } from '../remediation-handoff.ts';
import { createContractInvalidError } from '../contract-diagnostics.ts';
import { cloneSerializable as cloneSerializableValue } from '../serialization.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
import { coerceControlResultOrThrow } from './control-result-envelope.ts';
import {
  validateGateActionSemantics,
  validateGateEvidenceAuthority,
} from './gate-control-result-validation.ts';
export { validateGateEvidenceAuthority } from './gate-control-result-validation.ts';
type UnknownRecord = Record<string, any>;
type ExtraValidate = ((result: UnknownRecord) => string[] | undefined | null) | null;

interface GateNormalizeOptions {
  gateType?: string | null | undefined;
  producerType?: string | null | undefined;
  label?: string | null | undefined;
  allowedNextActions?: readonly string[];
  stageId?: string;
  coerce?: ((value: unknown) => UnknownRecord) | undefined;
  extraValidate?: ExtraValidate;
  moduleId?: string | null;
  input?: unknown;
  invocation?: unknown;
}

export const GATE_CONTROL_ACTIONS = Object.freeze({
  PASS: 'pass',
  REQUEST_FIX: 'request_fix',
  WAIT: 'wait',
  BLOCK: 'block',
});

export const GATE_CONTROL_NEXT_ACTIONS: readonly string[] = Object.freeze(Object.values(GATE_CONTROL_ACTIONS));
export const REMEDIABLE_GATE_CONTROL_NEXT_ACTIONS: readonly string[] = Object.freeze([
  GATE_CONTROL_ACTIONS.PASS,
  GATE_CONTROL_ACTIONS.REQUEST_FIX,
  GATE_CONTROL_ACTIONS.BLOCK,
]);

export function cloneSerializable(value: unknown): any {
  return cloneSerializableValue(value);
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value : [];
}

function formatAllowedNextActions(actions: readonly string[] = []): string {
  return actions
    .map((value: any) => `'${value}'`)
    .join(', ')
    .replace(/, ([^,]+)$/, ', or $1');
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function buildTypedGateControlResult({
  producerType,
  nextAction,
  issueType,
  summary,
  findings = [],
  metadata = {},
  gateRunStatus = null,
  outcomeClass = null,
  recommendation = null,
  metrics = {},
  wait = null,
  rateLimit = null,
}: UnknownRecord = {}): UnknownRecord {
  return {
    schemaVersion: 'v1',
    producerKind: 'gate',
    producerType,
    nextAction,
    ...(issueType ? { issueType } : {}),
    diagnostics: {
      summary,
      findings,
      metadata,
      typed: {
        gate: {
          schemaVersion: 'v1',
          gateRunStatus,
          outcomeClass,
          recommendation,
          metrics,
        },
        ...(wait ? { wait: cloneSerializable(wait) } : {}),
        ...(rateLimit ? { rateLimit: cloneSerializable(rateLimit) } : {}),
      },
    },
  };
}

export function isGateControlResult(result: unknown, gateType: string | null = null): result is UnknownRecord {
  return isPlainObject(result)
    && result.schemaVersion === 'v1'
    && result.producerKind === 'gate'
    && typeof result.producerType === 'string'
    && (selectTruthyValue(() => (!gateType), () => (result.producerType === gateType)))
    && typeof result.nextAction === 'string';
}

export function isTypedGateControlResult(result: unknown, producerType: string | null | undefined): result is UnknownRecord {
  return isGateControlResult(result, producerType);
}

export function coerceTypedGateControlResult(result: unknown, { producerType }: { producerType?: string | null | undefined } = {}): UnknownRecord {
  if (isTypedGateControlResult(result, producerType)) return result;
  throw new Error(`gate:${selectDefinedValue(() => (producerType), () => ('missing_producer_type'))} plugin output must be a typed gate control result; compatibility-shaped results are not accepted at the plugin boundary`);
}

export function validateGateControlResult(result: unknown, {
  gateType,
  allowedNextActions = GATE_CONTROL_NEXT_ACTIONS,
  stageId = `gate:${selectDefinedValue(() => (gateType), () => ('missing_gate_type'))}`,
  extraValidate = null,
}: GateNormalizeOptions = {}): string[] {
  const errors: any[] = [];
  if (selectTruthyValue(() => (!result), () => (typeof result !== 'object'))) {
    errors.push('result must be an object');
    return errors;
  }
  const controlResult = result as UnknownRecord;
  if (controlResult.schemaVersion !== 'v1') errors.push("schemaVersion must be 'v1'");
  if (controlResult.producerKind !== 'gate') errors.push("producerKind must be 'gate'");
  if (typeof gateType !== 'string' || !gateType.trim()) {
    errors.push('gateType must be a non-empty string');
  } else if (controlResult.producerType !== gateType) {
    errors.push(`producerType must be '${gateType}'`);
  }
  if (!Array.isArray(allowedNextActions) || allowedNextActions.length === 0) {
    errors.push(`allowedNextActions must be non-empty for ${stageId}`);
    return errors;
  }
  if (!allowedNextActions.includes(controlResult.nextAction)) {
    errors.push(`nextAction must be ${formatAllowedNextActions(allowedNextActions)} for ${stageId}`);
  }
  validateGateActionSemantics(controlResult, errors);
  if (typeof extraValidate === 'function') {
    errors.push(...arrayValue(extraValidate(controlResult)));
  }
  return errors;
}

export function normalizeGateControlResult(rawResult: unknown, {
  gateType,
  label,
  allowedNextActions = GATE_CONTROL_NEXT_ACTIONS,
  stageId = `gate:${selectDefinedValue(() => (gateType), () => ('missing_gate_type'))}`,
  coerce = (value: unknown) => coerceTypedGateControlResult(value, { producerType: gateType }),
  extraValidate = null,
  moduleId = null,
  input = null,
  invocation = null,
}: GateNormalizeOptions = {}): UnknownRecord {
  const controlResult = coerceControlResultOrThrow(rawResult, {
    coerce,
    messagePrefix: `${label} gate returned invalid control result`,
    diagnostics: {
      label,
      stageId,
      hookFamily: 'gate.execute',
      moduleId,
      producerKind: 'gate',
      producerType: gateType,
      input,
      invocation,
    },
  });
  const errors = validateGateControlResult(controlResult, {
    gateType,
    allowedNextActions,
    stageId,
    extraValidate,
  });
  if (errors.length > 0) {
    throw createContractInvalidError(`${label} gate returned invalid control result: ${errors.join('; ')}`, {
      label,
      stageId,
      hookFamily: 'gate.execute',
      moduleId,
      producerKind: 'gate',
      producerType: gateType,
      validationErrors: errors,
      rawResult,
      coercedResult: controlResult,
      input,
      invocation,
    });
  }
  return controlResult;
}

export function validateTypedGateControlResult(result: unknown, {
  producerType,
  allowedNextActions = [],
  stageId = `gate:${selectDefinedValue(() => (producerType), () => ('missing_producer_type'))}`,
  extraValidate = null,
}: GateNormalizeOptions = {}): string[] {
  return validateGateControlResult(result, {
    gateType: producerType,
    allowedNextActions,
    stageId,
    extraValidate,
  });
}

export function normalizeTypedGateControlResult(rawResult: unknown, {
  producerType,
  label,
  allowedNextActions = [],
  stageId = `gate:${selectDefinedValue(() => (producerType), () => ('missing_producer_type'))}`,
  coerce,
  extraValidate = null,
  moduleId = null,
  input = null,
  invocation = null,
}: GateNormalizeOptions = {}): UnknownRecord {
  return normalizeGateControlResult(rawResult, {
    gateType: producerType,
    label,
    allowedNextActions,
    stageId,
    coerce,
    extraValidate,
    moduleId,
    input,
    invocation,
  });
}

export function validateRemediableTypedGateControlResult(result: UnknownRecord, producerType: string | null | undefined): string[] {
  const errors = validateTypedGateControlResult(result, {
    producerType,
    allowedNextActions: REMEDIABLE_GATE_CONTROL_NEXT_ACTIONS,
    stageId: `gate:${producerType}`,
  });
  errors.push(...validateGateRemediationControlResult(result, `gate:${producerType}`));
  if (result?.nextAction === GATE_CONTROL_ACTIONS.REQUEST_FIX && result?.issueType !== 'code') {
    errors.push(`request_fix for gate:${producerType} must use issueType 'code'`);
  }
  return errors;
}

export function normalizeRemediableTypedGateControlResult(rawResult: unknown, {
  producerType,
  label,
  stageId = `gate:${producerType}`,
  moduleId = null,
  input = null,
  invocation = null,
  coerce = (value: unknown) => coerceTypedGateControlResult(value, { producerType }),
}: GateNormalizeOptions = {}): UnknownRecord {
  const controlResult = coerceControlResultOrThrow(rawResult, {
    coerce,
    messagePrefix: `${label} gate returned invalid control result`,
    diagnostics: {
      label,
      stageId,
      hookFamily: 'gate.execute',
      moduleId,
      producerKind: 'gate',
      producerType,
      input,
      invocation,
    },
  });
  const errors = validateRemediableTypedGateControlResult(controlResult, producerType);
  if (errors.length > 0) {
    throw createContractInvalidError(`${label} gate returned invalid control result: ${errors.join('; ')}`, {
      label,
      stageId,
      hookFamily: 'gate.execute',
      moduleId,
      producerKind: 'gate',
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
