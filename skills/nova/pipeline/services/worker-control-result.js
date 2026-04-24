export function cloneSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function buildTypedWorkerControlResult({
  producerType,
  nextAction,
  issueType,
  summary,
  metadata = {},
  findings = [],
  backendKind = null,
  dispatchRef = null,
  typedMetadata = {},
} = {}) {
  const diagnostics = {
    summary,
    metadata,
    typed: {
      worker: {
        schemaVersion: 'v1',
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

export function isTypedWorkerControlResult(result, producerType) {
  return result?.schemaVersion === 'v1'
    && result?.producerKind === 'worker'
    && result?.producerType === producerType
    && typeof result?.nextAction === 'string';
}

export function coerceTypedWorkerControlResult(result, { producerType, build } = {}) {
  if (isTypedWorkerControlResult(result, producerType)) return result;
  return build();
}

export function extractTypedWorkerLegacyResult(result, { producerType, buildFallbackLegacyResult } = {}) {
  if (!isTypedWorkerControlResult(result, producerType)) return result;

  const metadata = result?.diagnostics?.metadata || result?.diagnostics?.typed?.worker?.metadata || {};
  if (metadata?.legacy_result && typeof metadata.legacy_result === 'object') {
    return metadata.legacy_result;
  }

  return buildFallbackLegacyResult({ metadata, result });
}

export function validateTypedWorkerControlResult(result, {
  producerType,
  stageId = `worker:${producerType || 'unknown'}`,
  allowedNextActions = ['pass', 'retry', 'request_fix', 'block'],
} = {}) {
  const errors = [];
  if (!result || typeof result !== 'object') {
    errors.push('result must be an object');
    return errors;
  }
  if (result.schemaVersion !== 'v1') errors.push("schemaVersion must be 'v1'");
  if (result.producerKind !== 'worker') errors.push("producerKind must be 'worker'");
  if (result.producerType !== producerType) errors.push(`producerType must be '${producerType}'`);
  if (!allowedNextActions.includes(result.nextAction)) {
    errors.push(`nextAction must be ${allowedNextActions.map((value) => `'${value}'`).join(', ').replace(/, ([^,]+)$/, ', or $1')} for ${stageId}`);
  }
  return errors;
}

export function normalizeTypedWorkerControlResult(rawResult, {
  producerType,
  label,
  stageId = `worker:${producerType || 'unknown'}`,
  coerce,
} = {}) {
  const controlResult = coerce(rawResult);
  const errors = validateTypedWorkerControlResult(controlResult, { producerType, stageId });
  if (errors.length > 0) {
    throw new Error(`${label} worker returned invalid control result: ${errors.join('; ')}`);
  }
  return controlResult;
}
