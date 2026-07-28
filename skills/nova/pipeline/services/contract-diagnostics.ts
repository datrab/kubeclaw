import { cloneSerializable, sanitizeForJson } from './serialization.ts';
import { limitEgressText, sanitizeTelemetryPayload, summarizeStructuredValue } from '../egress.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
;

function sanitizeDiagnosticPayload(value: any) {
  if (value === undefined) return undefined;
  return sanitizeTelemetryPayload(sanitizeForJson(value));
}

function buildDiagnosticSummary(value: any, label: any) {
  if (value === undefined) return null;
  return summarizeStructuredValue(sanitizeDiagnosticPayload(value), label);
}

function sanitizeDiagnosticObject(value: any) {
  if (selectTruthyValue(() => (!value), () => (typeof value !== 'object'))) return undefined;
  return cloneSerializable(sanitizeDiagnosticPayload(value));
}

function inferHookFamily(stageId: any = null, producerKind: any = null) {
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

function normalizedValidationErrors(validationErrors: unknown): string[] {
  const entries = Array.isArray(validationErrors) ? validationErrors : [validationErrors ?? 'missing_contract_validation_error'];
  return entries.map((entry) => limitEgressText(String(entry), 500));
}

function diagnosticLabel(label: unknown, moduleId: unknown, stageId: unknown): string {
  for (const candidate of [label, moduleId, stageId]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return 'Plugin';
}

function diagnosticContext(input: any): Record<string, unknown> {
  return {
    ids: sanitizeDiagnosticObject(input?.ids),
    refs: sanitizeDiagnosticObject(input?.refs),
  };
}

function buildContractInvalidDiagnostic({
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
}: any = {}) {
  const normalizedErrors = normalizedValidationErrors(validationErrors);
  const context = diagnosticContext(input);
  return {
    schemaVersion: 'v1',
    diagnosticType: 'plugin_contract_invalid',
    severity: 'error',
    retryable: false,
    summary: limitEgressText(message ?? `${diagnosticLabel(label, moduleId, stageId)} returned invalid result`, 500),
    label,
    stageId,
    hookFamily: hookFamilyAuthority(hookFamily, stageId, producerKind),
    moduleId,
    producerKind,
    producerType,
    validationErrors: normalizedErrors,
    ids: context.ids,
    refs: context.refs,
    invocation: sanitizeDiagnosticObject(invocation),
    rawResultSummary: buildDiagnosticSummary(rawResult, 'rawResult'),
    coercedResultSummary: buildDiagnosticSummary(coercedResult, 'coercedResult'),
  };
}

function hookFamilyAuthority(hookFamily: string | null | undefined, stageId: string | null | undefined, producerKind: string | null | undefined): string {
  if (hookFamily) return hookFamily;
  return inferHookFamily(stageId, producerKind) ?? 'unknown';
}

export function createContractInvalidError(message: any, options: any = {}) {
  const safeMessage = limitEgressText(String(selectDefinedValue(() => (message), () => ('Plugin returned invalid result'))), 500);
  const diagnostic = buildContractInvalidDiagnostic({ ...options, message: safeMessage });
  const error = new Error(safeMessage) as Error & {
    code: string;
    contractInvalid: boolean;
    diagnostics: Record<string, unknown>;
    validationErrors: string[];
  };
  error.name = 'PluginContractInvalidError';
  error.code = 'PLUGIN_CONTRACT_INVALID';
  error.contractInvalid = true;
  error.diagnostics = diagnostic;
  error.validationErrors = [...diagnostic.validationErrors];
  return error;
}

export function isContractInvalidError(error: any) {
  return selectTruthyValue(() => (error?.contractInvalid === true), () => (error?.code === 'PLUGIN_CONTRACT_INVALID'));
}

export function getContractInvalidDiagnostic(error: any) {
  if (!isContractInvalidError(error)) return null;
  return cloneSerializable(selectTruthyValue(() => (error?.diagnostics), () => (null)));
}
