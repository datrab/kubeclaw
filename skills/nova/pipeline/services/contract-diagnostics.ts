import { cloneSerializable, sanitizeForJson } from './serialization.ts';
import { redactSecrets, sanitizeTelemetryPayload, summarizeStructuredValue } from '../redaction.ts';

export { cloneSerializable };

function sanitizeDiagnosticPayload(value) {
  if (value === undefined) return undefined;
  return sanitizeTelemetryPayload(sanitizeForJson(value));
}

function buildRedactedDiagnosticSummary(value, label) {
  if (value === undefined) return null;
  return summarizeStructuredValue(sanitizeDiagnosticPayload(value), label);
}

function sanitizeDiagnosticObject(value) {
  if (!value || typeof value !== 'object') return undefined;
  return cloneSerializable(sanitizeDiagnosticPayload(value));
}

export function inferHookFamily(stageId = null, producerKind = null) {
  if (typeof stageId === 'string') {
    if (stageId.startsWith('worker:')) return 'worker.execute';
    if (stageId.startsWith('gate:')) return 'gate.execute';
    if (stageId.startsWith('validator:')) return 'validator.run';
    if (stageId.startsWith('generator:')) return 'generator.run';
  }
  if (producerKind === 'worker') return 'worker.execute';
  if (producerKind === 'gate') return 'gate.execute';
  if (producerKind === 'validator') return 'validator.run';
  if (producerKind === 'generator') return 'generator.run';
  return null;
}

export function buildContractInvalidDiagnostic({
  label = null,
  stageId = null,
  hookFamily = null,
  moduleId = null,
  producerKind = null,
  producerType = null,
  validationErrors = [],
  rawResult = undefined,
  coercedResult = undefined,
  input = null,
  invocation = null,
  message = null,
} = {}) {
  const normalizedErrors = Array.isArray(validationErrors)
    ? validationErrors.map((entry) => redactSecrets(String(entry), 500))
    : [redactSecrets(String(validationErrors || 'unknown contract validation error'), 500)];
  const ids = sanitizeDiagnosticObject(input?.ids);
  const refs = sanitizeDiagnosticObject(input?.refs);
  return {
    schemaVersion: 'v1',
    diagnosticType: 'plugin_contract_invalid',
    severity: 'error',
    retryable: false,
    summary: redactSecrets(message || `${label || moduleId || stageId || 'Plugin'} returned invalid result`, 500),
    label,
    stageId,
    hookFamily: hookFamily || inferHookFamily(stageId, producerKind),
    moduleId,
    producerKind,
    producerType,
    validationErrors: normalizedErrors,
    ids,
    refs,
    invocation: sanitizeDiagnosticObject(invocation),
    rawResultSummary: buildRedactedDiagnosticSummary(rawResult, 'rawResult'),
    coercedResultSummary: buildRedactedDiagnosticSummary(coercedResult, 'coercedResult'),
  };
}

export function createContractInvalidError(message, options = {}) {
  const safeMessage = redactSecrets(String(message || 'Plugin returned invalid result'), 500);
  const diagnostic = buildContractInvalidDiagnostic({ ...options, message: safeMessage });
  const error = new Error(safeMessage);
  error.name = 'PluginContractInvalidError';
  error.code = 'PLUGIN_CONTRACT_INVALID';
  error.contractInvalid = true;
  error.diagnostics = diagnostic;
  error.validationErrors = [...diagnostic.validationErrors];
  return error;
}

export function isContractInvalidError(error) {
  return error?.contractInvalid === true || error?.code === 'PLUGIN_CONTRACT_INVALID';
}

export function getContractInvalidDiagnostic(error) {
  if (!isContractInvalidError(error)) return null;
  return cloneSerializable(error?.diagnostics || null);
}
