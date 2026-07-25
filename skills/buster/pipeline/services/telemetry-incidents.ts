import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import type { BusterTelemetryContext, TelemetryOptions, TelemetryRecord } from './telemetry-contracts.ts';

declare const process: { stderr: { write(text: string): void } };
const MISSING_AUTHORITY = 'not_emitted';
const NO_MODULE = 'not_applicable';
function textOr(value: unknown, absent: string): string { return value ? String(value) : absent; }

export function errorMessage(error: unknown, fallback = 'missing_error_detail'): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && (error as TelemetryRecord).message) return String((error as TelemetryRecord).message);
  return error ? String(error) : fallback;
}

function isContext(value: unknown): value is BusterTelemetryContext {
  return Boolean(value && typeof value === 'object' && 'runId' in value && 'moduleId' in value);
}

function identity(value: TelemetryOptions | BusterTelemetryContext): { project: string; runId: string; moduleId: string } {
  if (isContext(value)) return { project: textOr(value.project, MISSING_AUTHORITY), runId: textOr(value.runId, MISSING_AUTHORITY), moduleId: textOr(value.moduleId, NO_MODULE) };
  return { project: value.project ? String(value.project) : MISSING_AUTHORITY, runId: value.run_id ? String(value.run_id) : MISSING_AUTHORITY, moduleId: value.module_id ? String(value.module_id) : NO_MODULE };
}

export function reportBusterTelemetryIncident(context: TelemetryOptions | BusterTelemetryContext = {}, classification: string, error: unknown, message: string, options: TelemetryRecord = {}): void {
  const current = identity(context);
  reportClassifiedNonBlockingError({
    reporter: 'buster-telemetry', classification,
    incidentKey: buildNonBlockingIncidentKey('buster-telemetry', current.project, current.runId, current.moduleId, classification, textOr(options.scope, 'scope_global')),
    message, error, includeErrorDetail: options.includeErrorDetail !== false,
    level: typeof options.level === 'string' && options.level.trim() ? options.level : 'WARN',
    fallback: (_level: string, line: string) => process.stderr.write(`${line}\n`),
  });
}
