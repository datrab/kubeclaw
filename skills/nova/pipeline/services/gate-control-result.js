import { validateGateRemediationControlResult } from './remediation-handoff.js';

export function cloneSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
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
} = {}) {
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
      },
    },
  };
}

export function isTypedGateControlResult(result, producerType) {
  return result?.schemaVersion === 'v1'
    && result?.producerKind === 'gate'
    && result?.producerType === producerType
    && typeof result?.nextAction === 'string';
}

export function coerceTypedGateControlResult(result, { producerType, build } = {}) {
  if (isTypedGateControlResult(result, producerType)) return result;
  return build();
}

export function extractTypedGateLegacyResult(result, gateId, gate, { producerType, buildFallbackLegacyResult } = {}) {
  if (!isTypedGateControlResult(result, producerType)) return result;

  const metadata = result?.diagnostics?.metadata || result?.diagnostics?.typed?.gate?.metadata || {};
  if (metadata?.legacy_result && typeof metadata.legacy_result === 'object') {
    return metadata.legacy_result;
  }

  return buildFallbackLegacyResult({ metadata, result, gateId, gate });
}

export function validateTypedGateControlResult(result, {
  producerType,
  allowedNextActions = [],
  stageId = `gate:${producerType || 'unknown'}`,
  extraValidate = null,
} = {}) {
  const errors = [];
  if (!result || typeof result !== 'object') {
    errors.push('result must be an object');
    return errors;
  }
  if (result.schemaVersion !== 'v1') errors.push("schemaVersion must be 'v1'");
  if (result.producerKind !== 'gate') errors.push("producerKind must be 'gate'");
  if (result.producerType !== producerType) errors.push(`producerType must be '${producerType}'`);
  if (!allowedNextActions.includes(result.nextAction)) {
    errors.push(`nextAction must be ${allowedNextActions.map((value) => `'${value}'`).join(', ').replace(/, ([^,]+)$/, ', or $1')} for ${stageId}`);
  }
  if (typeof extraValidate === 'function') {
    errors.push(...(extraValidate(result) || []));
  }
  return errors;
}

export function normalizeTypedGateControlResult(rawResult, {
  producerType,
  label,
  allowedNextActions = [],
  stageId = `gate:${producerType || 'unknown'}`,
  coerce,
  extraValidate = null,
} = {}) {
  const controlResult = coerce(rawResult);
  const errors = validateTypedGateControlResult(controlResult, {
    producerType,
    allowedNextActions,
    stageId,
    extraValidate,
  });
  if (errors.length > 0) {
    throw new Error(`${label} gate returned invalid control result: ${errors.join('; ')}`);
  }
  return controlResult;
}

export function validateRemediableTypedGateControlResult(result, producerType) {
  const errors = validateTypedGateControlResult(result, {
    producerType,
    allowedNextActions: ['pass', 'request_fix', 'block'],
    stageId: `gate:${producerType}`,
  });
  errors.push(...validateGateRemediationControlResult(result, `gate:${producerType}`));
  if (result?.nextAction === 'request_fix' && result?.issueType !== 'code') {
    errors.push(`request_fix for gate:${producerType} must use issueType 'code'`);
  }
  return errors;
}

export function normalizeRemediableTypedGateControlResult(rawResult, { producerType, label, coerce } = {}) {
  const controlResult = coerce(rawResult);
  const errors = validateRemediableTypedGateControlResult(controlResult, producerType);
  if (errors.length > 0) {
    throw new Error(`${label} gate returned invalid control result: ${errors.join('; ')}`);
  }
  return controlResult;
}
