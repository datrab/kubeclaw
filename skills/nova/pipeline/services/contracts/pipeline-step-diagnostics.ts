import { cloneSerializable } from '../serialization.ts';

type UnknownRecord = Record<string, any>;

function objectRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function firstArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

export function buildStepDiagnostics(input: UnknownRecord): UnknownRecord {
  const diagnostics = objectRecord(input.diagnostics);
  const controlResult = objectRecord(input.controlResult);
  const controlDiagnostics = objectRecord(controlResult.diagnostics);
  const typed: UnknownRecord = { ...cloneSerializable(objectRecord(diagnostics.typed)) };
  if (Object.keys(controlResult).length) typed.controlResult = cloneSerializable(controlResult);
  if (input.remediation) typed.remediation = cloneSerializable(input.remediation);
  if (input.wait) typed.wait = cloneSerializable(input.wait);
  const result: UnknownRecord = {
    summary: firstText(input.reason, input.summary, diagnostics.summary, controlDiagnostics.summary),
    findings: cloneSerializable(firstArray(diagnostics.findings, controlDiagnostics.findings)),
    metadata: cloneSerializable(objectRecord(diagnostics.metadata)),
    typed,
  };
  if (diagnostics.contract_invalid === true) result.contract_invalid = true;
  if (diagnostics.contract_diagnostic) result.contract_diagnostic = cloneSerializable(diagnostics.contract_diagnostic);
  return result;
}
