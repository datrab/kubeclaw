import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// pipeline/services/runtime-diagnostics.ts — sanitized process diagnostic helpers
// Owns non-blocking diagnostics for malformed tasks and process/runtime health.

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { join } from 'path';
import { sanitizeNonBlockingErrorDetail } from '../noncritical-reporting.ts';
import { normalizeRequiredIdentity } from './task-validation.ts';

declare const process: {
  env: Record<string, string | undefined>;
  stderr: { write(text: string): void };
};

declare const console: {
  warn(...args: unknown[]): void;
};

type JsonObject = Record<string, unknown>;

interface ErrorLike {
  message?: unknown;
  code?: unknown;
}

interface BusterProcessDiagnosticInput {
  reason?: string | null | undefined;
  detail?: unknown;
  component?: string;
  surface?: string;
  projectHint?: unknown;
  ts?: string;
}

export interface BusterProcessDiagnosticRecord extends JsonObject {
  v: 1;
  type: 'observability.degraded';
  ts: string;
  source: 'buster';
  emitter: 'buster/buster-pipeline';
  diagnostic_only: true;
  scope: 'process';
  component: string;
  surface: string;
  reason: string;
  detail: string | null;
  agent_type: 'buster';
  project_hint: unknown;
  degraded_at: string;
}

function asErrorLike(value: unknown): ErrorLike | null {
  return value && typeof value === 'object' ? value as ErrorLike : null;
}

function normalizeDiagnosticDetail(errorOrDetail: unknown): string | null {
  // KEEP_TYPED_POLICY: diagnostics accept arbitrary thrown/detail values but
  // normalize them through the shared sanitizer before persistence or stderr.
  if (selectTruthyValue(() => (errorOrDetail === undefined), () => (errorOrDetail === null))) return null;
  if (typeof errorOrDetail === 'string') return sanitizeNonBlockingErrorDetail(errorOrDetail);
  const errorLike = asErrorLike(errorOrDetail);
  if (errorLike?.message) return sanitizeNonBlockingErrorDetail(errorLike.message);
  try {
    return sanitizeNonBlockingErrorDetail(JSON.stringify(errorOrDetail));
  } catch (_error) {
    return sanitizeNonBlockingErrorDetail(String(errorOrDetail));
  }
}

export function sanitizeBusterRuntimeDetail(value: unknown, maxChars = 1200): string {
  return sanitizeNonBlockingErrorDetail(value, maxChars);
}

export function safeErrorMessage(error: unknown, fallback = 'missing_error_detail'): string {
  const errorLike = asErrorLike(error);
  const raw = errorMessageAuthority(errorLike, error, fallback);
  return sanitizeBusterRuntimeDetail(raw);
}

function errorMessageAuthority(errorLike: Record<string, unknown> | null, error: unknown, fallback: string): unknown {
  if (errorLike?.message) return errorLike.message;
  if (errorLike?.code) return errorLike.code;
  if (error) return String(error);
  return fallback;
}

function envStringOrNull(name: string): string | null {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function buildBusterProcessDiagnosticRecord({
  reason,
  detail,
  component = 'buster_gateway_health',
  surface = 'gateway',
  projectHint = envStringOrNull('BUSTER_PROJECT'),
  ts = new Date().toISOString(),
}: BusterProcessDiagnosticInput = {}): BusterProcessDiagnosticRecord {
  // KEEP_TYPED_POLICY: process-level diagnostics may use the typed BUSTER_PROJECT
  // environment hint when no task payload context exists yet.
  return {
    v: 1,
    type: 'observability.degraded',
    ts,
    source: 'buster',
    emitter: 'buster/buster-pipeline',
    diagnostic_only: true,
    scope: 'process',
    component,
    surface,
    reason: selectDefinedValue(() => (reason), () => ('gateway_unavailable')),
    detail: normalizeDiagnosticDetail(detail),
    agent_type: 'buster',
    project_hint: normalizeRequiredIdentity(projectHint),
    degraded_at: ts,
  };
}

export function appendMalformedTaskArtifact(record: JsonObject = {}): void {
  try {
    const logDir = join('.swarm', 'logs', 'buster');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(join(logDir, 'malformed-tasks.jsonl'), `${JSON.stringify({
      ts: new Date().toISOString(),
      component: 'buster_pipeline',
      event: 'malformed_task_rejected',
      ...record,
    })}\n`);
  } catch (error) {
    try {
      process.stderr.write(`[BUSTER-DIAGNOSTIC] malformed task artifact write failed: ${safeErrorMessage(error)}\n`);
    } catch (_stderrError) {
      // KEEP_TYPED_POLICY: diagnostic artifact writes must never block
      // poison-message acknowledgement.
    }
  }
}

export function appendBusterProcessDiagnostic(record: JsonObject = {}): void {
  try {
    const logDir = join('.swarm', 'logs', 'buster');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(join(logDir, 'process-health.jsonl'), `${JSON.stringify(record)}\n`);
  } catch (error) {
    try {
      process.stderr.write(`[BUSTER-DIAGNOSTIC] process diagnostic write failed: ${safeErrorMessage(error)}\n`);
    } catch (_stderrError) {
      // KEEP_TYPED_POLICY: process diagnostics must never block shutdown/cleanup.
    }
  }
}

export function reportBusterRuntimeDiagnostic({ reason, detail, component = 'buster_runtime', surface = 'runtime' }: BusterProcessDiagnosticInput = {}): BusterProcessDiagnosticRecord {
  const record = buildBusterProcessDiagnosticRecord({ reason, detail, component, surface });
  appendBusterProcessDiagnostic(record);
  console.warn(`[DIAGNOSTIC] ${component}/${surface}: ${selectTruthyValue(() => (reason), () => ('missing_diagnostic_reason'))}${record.detail ? ` — ${record.detail}` : ''}`);
  return record;
}
