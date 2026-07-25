import { validateGateRemediationControlResult } from '../remediation-handoff.ts';
import { createContractInvalidError } from '../contract-diagnostics.ts';
import { cloneSerializable as cloneSerializableValue } from '../serialization.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
import { coerceControlResultOrThrow } from './control-result-envelope.ts';
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

const CANONICAL_GATE_RUN_STATUSES = new Set(['PASS', 'FAIL', 'WAIT', 'TIMED_OUT']);
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
const GATE_PRODUCER_TYPE = 'gate';

export function cloneSerializable(value: unknown): any {
  return cloneSerializableValue(value);
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value : [];
}

function textValue(value: unknown): string {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  return String(value).trim();
}

function producerLabel(result: UnknownRecord): string {
  return selectTruthyValue(() => (textValue(result.producerType)), () => (GATE_PRODUCER_TYPE));
}

function formatAllowedNextActions(actions: readonly string[] = []): string {
  return actions
    .map((value: any) => `'${value}'`)
    .join(', ')
    .replace(/, ([^,]+)$/, ', or $1');
}

function normalizeGateStatus(value: unknown): string {
  return textValue(value).toUpperCase();
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateGateActionSemantics(result: UnknownRecord, errors: string[]): void {
  const diagnostics = isPlainObject(result?.diagnostics) ? result.diagnostics : null;
  const metadata = isPlainObject(diagnostics?.metadata) ? diagnostics.metadata : {};
  const typed = isPlainObject(diagnostics?.typed) ? diagnostics.typed : null;
  const typedGate = isPlainObject(typed?.gate) ? typed.gate : null;
  const gateStatus = normalizeGateStatus(typedGate?.gateRunStatus);
  const summary = typeof diagnostics?.summary === 'string' ? diagnostics.summary.trim() : '';

  if (!diagnostics) {
    errors.push('diagnostics must be an object');
    return;
  }
  if (!summary) errors.push('diagnostics.summary must be a non-empty string');
  if (!Array.isArray(diagnostics.findings)) errors.push('diagnostics.findings must be an array');
  if (!isPlainObject(diagnostics.metadata)) errors.push('diagnostics.metadata must be an object');
  if (!typed) errors.push('diagnostics.typed must be an object');
  if (!typedGate) errors.push('diagnostics.typed.gate must be an object');
  else {
    if (typedGate.schemaVersion !== 'v1') errors.push("diagnostics.typed.gate.schemaVersion must be 'v1'");
    if (gateStatus && !CANONICAL_GATE_RUN_STATUSES.has(gateStatus)) {
      errors.push("diagnostics.typed.gate.gateRunStatus must be PASS, FAIL, WAIT, or TIMED_OUT");
    }
    if (!CANONICAL_OUTCOME_CLASSES.has(textValue(typedGate.outcomeClass))) {
      errors.push('diagnostics.typed.gate.outcomeClass must be a canonical pipeline step outcome');
    }
  }

  if (result.nextAction === GATE_CONTROL_ACTIONS.PASS) {
    if (gateStatus === 'FAIL') {
      errors.push(`pass for ${producerLabel(result)} cannot report failing gateRunStatus '${gateStatus}'`);
    }
    if (gateStatus === 'TIMED_OUT' && metadata.continued !== true) {
      errors.push('pass with gateRunStatus TIMED_OUT requires diagnostics.metadata.continued=true');
    }
  }

  if (selectTruthyValue(() => (result.nextAction === GATE_CONTROL_ACTIONS.BLOCK), () => (result.nextAction === GATE_CONTROL_ACTIONS.REQUEST_FIX))) {
    if (selectTruthyValue(() => (gateStatus === 'PASS'), () => ((gateStatus === 'TIMED_OUT' && metadata.continued === true)))) {
      errors.push(`${result.nextAction} for ${producerLabel(result)} cannot report passing gateRunStatus '${gateStatus}'`);
    }
  }

  if (result.nextAction === GATE_CONTROL_ACTIONS.WAIT) {
    const wait = typed?.wait;
    if (!isPlainObject(wait)) {
      errors.push('wait action requires diagnostics.typed.wait');
    } else {
      if (wait.schemaVersion !== 'v1') errors.push("diagnostics.typed.wait.schemaVersion must be 'v1'");
      if (selectTruthyValue(() => (!wait.waitKind), () => (typeof wait.waitKind !== 'string'))) errors.push('diagnostics.typed.wait.waitKind must be a non-empty string');
      if (selectTruthyValue(() => (!wait.status), () => (typeof wait.status !== 'string'))) errors.push('diagnostics.typed.wait.status must be a non-empty string');
    }
    if (gateStatus && gateStatus !== 'WAIT') {
      errors.push(`wait for ${producerLabel(result)} cannot report terminal gateRunStatus '${gateStatus}'`);
    }
  }
}

function readMetadataValue(metadata: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (metadata[key] !== undefined && metadata[key] !== null && String(metadata[key]).trim() !== '') {
      return metadata[key];
    }
  }
  return null;
}

function valuesMatch(expected: unknown, actual: unknown): boolean {
  if (expected === undefined) return true;
  if (expected === null) return true;
  if (expected === '') return true;
  return actual !== undefined && actual !== null && String(actual) === String(expected);
}

function isMissingEvidenceValue(value: unknown): boolean {
  if (value === undefined) return true;
  if (value === null) return true;
  return value === '';
}

export function validateGateEvidenceAuthority(result: unknown, {
  expectedRunId = null,
  expectedGateId = null,
  expectedGateType = null,
  expectedAttempt = null,
  expectedDispatchId = null,
  requireDispatchId = false,
}: UnknownRecord = {}): string[] {
  const errors: string[] = [];
  if (!isPlainObject(result)) return ['gate evidence result must be an object'];

  const diagnostics = isPlainObject(result?.diagnostics) ? result.diagnostics : {};
  const metadata = isPlainObject(diagnostics?.metadata) ? diagnostics.metadata : {};
  const remediation = isPlainObject(diagnostics?.typed?.remediation) ? diagnostics.typed.remediation : null;
  const evidence = gateEvidenceAuthority(remediation, metadata);
  const remediationCorrelation = isPlainObject(remediation?.correlation) ? remediation.correlation : {};

  const runId = readMetadataValue(evidence, ['runId', 'run_id']);
  const gateId = readMetadataValue(evidence, ['gateId', 'gate_id']);
  const gateType = readMetadataValue(evidence, ['gateType', 'gate_type']);
  const attempt = readMetadataValue(evidence, ['attempt']);
  const dispatchId = dispatchIdAuthority(evidence, remediationCorrelation);

  if (!runId) errors.push('gate evidence must include run_id');
  if (!gateId) errors.push('gate evidence must include gate_id');
  if (!gateType) errors.push('gate evidence must include gate_type');
  if (attempt === null) errors.push('gate evidence must include attempt');
  if (requireDispatchId && !dispatchId) errors.push('gate evidence must include dispatch_id');

  if (!valuesMatch(expectedRunId, runId)) errors.push('gate evidence run_id does not match expected run');
  if (!valuesMatch(expectedGateId, gateId)) errors.push('gate evidence gate_id does not match expected gate');
  if (!valuesMatch(expectedGateType, gateType)) errors.push('gate evidence gate_type does not match expected gate type');
  if (!valuesMatch(expectedAttempt, attempt)) errors.push('gate evidence attempt does not match expected attempt');
  if (!valuesMatch(expectedDispatchId, dispatchId)) errors.push('gate evidence dispatch_id does not match expected dispatch');

  const pathEvidence = readMetadataValue(metadata, ['path', 'output_file', 'evidence_path', 'request_artifact_path']);
  const hasPathEvidence = Boolean(pathEvidence);
  if (hasPathEvidence && [runId, gateId, attempt].some(isMissingEvidenceValue)) {
    errors.push('gate evidence path is diagnostic only without run/gate/attempt identity');
  }

  return errors;
}

function gateEvidenceAuthority(remediation: UnknownRecord | null, metadata: UnknownRecord): UnknownRecord {
  if (remediation !== null) return remediation;
  return metadata;
}

function dispatchIdAuthority(evidence: UnknownRecord, remediationCorrelation: UnknownRecord): unknown {
  const evidenceDispatchId = readMetadataValue(evidence, ['dispatchId', 'dispatch_id']);
  if (evidenceDispatchId !== null && evidenceDispatchId !== undefined) return evidenceDispatchId;
  return readMetadataValue(remediationCorrelation, ['dispatchId', 'dispatch_id']);
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
  if (selectTruthyValue(() => (typeof gateType !== 'string'), () => (!gateType.trim()))) {
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
