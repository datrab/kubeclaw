import { cloneSerializable, sanitizeForJson } from './serialization.ts';
import { limitEgressText, sanitizeTelemetryPayload, summarizeStructuredValue } from '../egress.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
export { cloneSerializable };

function sanitizeDiagnosticPayload(value) {
  if (value === undefined) return undefined;
  return sanitizeTelemetryPayload(sanitizeForJson(value));
}

function buildDiagnosticSummary(value, label) {
  if (value === undefined) return null;
  return summarizeStructuredValue(sanitizeDiagnosticPayload(value), label);
}

function sanitizeDiagnosticObject(value) {
  if (selectTruthyValue(() => (!value), () => (typeof value !== 'object'))) return undefined;
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
    ? validationErrors.map((entry) => limitEgressText(String(entry), 500))
    : [limitEgressText(String(selectTruthyValue(() => (validationErrors), () => ('missing_contract_validation_error'))), 500)];
  const ids = sanitizeDiagnosticObject(input?.ids);
  const refs = sanitizeDiagnosticObject(input?.refs);
  return {
    schemaVersion: 'v1',
    diagnosticType: 'plugin_contract_invalid',
    severity: 'error',
    retryable: false,
    summary: limitEgressText(selectDefinedValue(() => (message), () => (`${selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (label), () => (moduleId))), () => (stageId))), () => ('Plugin'))} returned invalid result`)), 500),
    label,
    stageId,
    hookFamily: hookFamilyAuthority(hookFamily, stageId, producerKind),
    moduleId,
    producerKind,
    producerType,
    validationErrors: normalizedErrors,
    ids,
    refs,
    invocation: sanitizeDiagnosticObject(invocation),
    rawResultSummary: buildDiagnosticSummary(rawResult, 'rawResult'),
    coercedResultSummary: buildDiagnosticSummary(coercedResult, 'coercedResult'),
  };
}

function hookFamilyAuthority(hookFamily: string | null | undefined, stageId: string | null | undefined, producerKind: string | null | undefined): string {
  if (hookFamily) return hookFamily;
  return inferHookFamily(stageId, producerKind);
}

export function createContractInvalidError(message, options = {}) {
  const safeMessage = limitEgressText(String(selectDefinedValue(() => (message), () => ('Plugin returned invalid result'))), 500);
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
  return selectTruthyValue(() => (error?.contractInvalid === true), () => (error?.code === 'PLUGIN_CONTRACT_INVALID'));
}

export function getContractInvalidDiagnostic(error) {
  if (!isContractInvalidError(error)) return null;
  return cloneSerializable(selectTruthyValue(() => (error?.diagnostics), () => (null)));
}
