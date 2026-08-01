import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
// ═══════════════════════════════════════════════════════════════
// Buster Logger — Structured JSON dual-write (stdout + JSONL file)
// ═══════════════════════════════════════════════════════════════
//
// Provides per-task structured logging with sync file writes.
// Each log entry contains: ts, level, tag, msg, module, step,
// task_type, and optional data fields.
//
// Usage:
//   const logger = createLogger({ logPath, module, taskType });
//   logger.step('pre-cleanup');
//   logger.info('RESOURCE', 'Cleanup started');
//   logger.warn('GIT', 'No commit hash provided');
//   logger.error('SPAWN', 'Failed to spawn session', { err: e.message });
//   logger.flush(); // no-op — writes are synchronous

import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError, sanitizeNonBlockingErrorDetail } from '../noncritical-reporting.js';

declare const process: {
  stderr: { write(text: string): void };
};

declare const console: {
  log(...args: unknown[]): void;
};

type JsonObject = Record<string, unknown>;

interface ErrorLike {
  code?: unknown;
  message?: unknown;
}

interface LoggerOptions {
  logPath?: string | null;
  module?: string | null;
  taskType?: string | null;
  gateId?: string | null;
  attempt?: unknown;
  dispatchId?: string | null;
  sessionKey?: string | null;
  emitTelemetry?: (type: string, payload: JsonObject) => unknown;
}

export interface Logger {
  info(tag: string, msg: string, data?: JsonObject): void;
  warn(tag: string, msg: string, data?: JsonObject): void;
  error(tag: string, msg: string, data?: JsonObject): void;
  step(stepName: string): void;
  flush(): void;
}

interface LoggerState {
  currentStep: string;
  degraded: boolean;
  degradedReason: string | null;
}

export function writeBusterRuntimeLog(
  level: 'info' | 'warn' | 'error',
  component: string,
  message: string,
  data?: JsonObject,
): void {
  const logger = createLogger({ taskType: component });
  logger[level](component.toUpperCase(), message, data);
}

function asErrorLike(value: unknown): ErrorLike | null {
  return value && typeof value === 'object' ? value as ErrorLike : null;
}

const SECRET_KEY_RE = /(?:token|secret|password|authorization|api[_-]?key|cookie|oauth)/i;

function sanitizeLoggerValue(value: unknown, key = ''): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    return SECRET_KEY_RE.test(key)
      ? sanitizeNonBlockingErrorDetail(`${key}=${value}`)
      : sanitizeNonBlockingErrorDetail(value);
  }
  if (selectTruthyValue(() => (typeof value === 'number'), () => (typeof value === 'boolean'))) {
    return SECRET_KEY_RE.test(key)
      ? sanitizeNonBlockingErrorDetail(`${key}=${value}`)
      : value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeLoggerValue(item, key));
  if (typeof value === 'object') {
    const out: JsonObject = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = sanitizeLoggerValue(childValue, childKey);
    }
    return out;
  }
  return sanitizeNonBlockingErrorDetail(String(value));
}

function sanitizeLogPath(logPath: unknown): string | null {
  return logPath ? sanitizeNonBlockingErrorDetail(logPath, 500) : null;
}

function buildLoggerDegradedPayload(opts: LoggerOptions = {}, classification: string, error: unknown): JsonObject {
  const errorLike = asErrorLike(error);
  return {
    component: 'buster_logger',
    surface: 'jsonl_file',
    reason: classification,
    detail: sanitizeNonBlockingErrorDetail(`Buster logger ${classification}: ${selectTruthyValue(() => (selectTruthyValue(() => (errorLike?.code), () => (errorLike?.message))), () => ('missing_logger_error_detail'))}; target=${selectTruthyValue(() => (sanitizeLogPath(opts.logPath)), () => ('stdout'))}`),
    module_id: selectTruthyValue(() => (opts.module), () => (null)),
    gate_id: selectTruthyValue(() => (opts.gateId), () => (null)),
    attempt: selectDefinedValue(() => (opts.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (opts.dispatchId), () => (null)),
    session_key: selectTruthyValue(() => (opts.sessionKey), () => (null)),
    degraded_at: new Date().toISOString(),
  };
}

/**
 * Create a structured logger that writes JSON entries to stdout and a JSONL file.
 *
 * Log directory is created once on construction (not per entry).
 * File writes use appendFileSync — no buffering, no async I/O in the hot path.
 *
 * @param {object} opts
 * @param {string} [opts.logPath]    - Absolute or relative path to JSONL output file.
 *                                     If omitted, writes to stdout only.
 * @param {string} [opts.module]     - Module identifier (e.g. "06-observability-alignment")
 * @param {string} [opts.taskType]   - Task type (e.g. "module_test")
 * @returns {Logger}
 */
export function createLogger(opts: LoggerOptions = {}): Logger {
  const logPath = opts.logPath;
  const mod = opts.module || '';
  const taskType = opts.taskType || '';
  const state: LoggerState = { currentStep: '', degraded: false, degradedReason: null };

  const reportLoggerIncident = (classification: string, error: unknown, message: string, level = 'WARN'): void => {
    // KEEP_TYPED_POLICY: file logging is observability only. JSONL mkdir/append
    // failures report degraded evidence and continue with stdout; telemetry
    // hooks are optional and must not recurse or fail logging.
    if (!state.degraded && typeof opts.emitTelemetry === 'function') {
      state.degraded = true;
      state.degradedReason = classification;
      try {
        opts.emitTelemetry('observability.degraded', buildLoggerDegradedPayload(opts, classification, error));
      } catch (telemetryError) {
        process.stderr.write(`[buster-logger] degraded telemetry emit failed: ${sanitizeNonBlockingErrorDetail(selectTruthyValue(() => (asErrorLike(telemetryError)?.message), () => ('missing_telemetry_error_detail')))}\n`);
      }
    }
    reportClassifiedNonBlockingError({
      reporter: 'buster-logger',
      classification,
      incidentKey: buildNonBlockingIncidentKey('buster-logger', selectTruthyValue(() => (logPath), () => ('stdout_stream')), selectTruthyValue(() => (mod), () => ('scope_global')), selectTruthyValue(() => (taskType), () => ('scope_global')), classification),
      message,
      error,
      level,
      fallback: (_reportedLevel: string, line: string) => process.stderr.write(`${line}\n`),
    });
  };

  initializeLogPath(logPath, reportLoggerIncident);

  function write(level: string, tag: string, msg: string, data?: JsonObject): void {
    const entry = buildLogEntry({ opts, state, level, tag, msg, data: data || {}, mod, taskType });
    console.log(JSON.stringify(entry));
    appendLogEntry(logPath, entry, opts, state, mod, reportLoggerIncident);
  }

  return {
    /**
     * Log an INFO entry.
     * @param {string} tag   - Short category label (e.g. "RESOURCE", "GIT")
     * @param {string} msg   - Human-readable message
     * @param {object} [data] - Optional structured payload
     */
    info(tag: string, msg: string, data?: JsonObject)  { write('INFO',  tag, msg, data); },

    /**
     * Log a WARN entry.
     */
    warn(tag: string, msg: string, data?: JsonObject)  { write('WARN',  tag, msg, data); },

    /**
     * Log an ERROR entry.
     */
    error(tag: string, msg: string, data?: JsonObject) { write('ERROR', tag, msg, data); },

    /**
     * Set the current step label and emit a STEP log entry.
     * All subsequent entries will include this step name.
     *
     * @param {string} stepName - Step identifier (e.g. "pre-cleanup", "git-sync")
     */
    step(stepName: string) {
      state.currentStep = stepName;
      write('STEP', 'STEP', stepName);
    },

    /**
     * No-op. Writes are synchronous — no buffer to flush.
     */
    flush() {},
  };
}

function initializeLogPath(logPath: string | null | undefined, report: (classification: string, error: unknown, message: string) => void): void {
  if (!logPath) return;
  try {
    mkdirSync(dirname(logPath), { recursive: true });
  } catch (error) {
    report('log_directory_create_failed', error, 'Buster logger output directory creation failed; continuing with stdout only');
  }
}

function buildLogEntry(input: { opts: LoggerOptions; state: LoggerState; level: string; tag: string; msg: string; data?: JsonObject; mod: string; taskType: string }): JsonObject {
  const { opts, state, level, tag, msg, data, mod, taskType } = input;
  const entry: JsonObject = {
    schema_version: 'runtime_log.v1', timestamp: new Date().toISOString(),
    level: level.toLowerCase() === 'step' ? 'info' : level.toLowerCase(), component: 'buster/pipeline', tag, message: msg,
    work_id: mod ? mod : (opts.gateId ?? null), work_type: opts.gateId ? 'gate' : mod ? 'module' : null,
    attempt: selectDefinedValue(() => (opts.attempt), () => (null)), dispatch_id: opts.dispatchId || null,
    session_id: opts.sessionKey || null, step: state.currentStep, task_type: taskType,
  };
  if (data && Object.keys(data).length > 0) entry.data = sanitizeLoggerValue(data);
  return entry;
}

function appendLogEntry(logPath: string | null | undefined, entry: JsonObject, opts: LoggerOptions, state: LoggerState, mod: string, report: (classification: string, error: unknown, message: string) => void): void {
  if (!logPath) return;
  try {
    appendLogLine(logPath, `${JSON.stringify(entry)}\n`);
    emitLoggerRestored(opts, state, mod);
  } catch (error) {
    report('log_file_append_failed', error, 'Buster logger file append failed; continuing with stdout only');
    process.stderr.write(`[logger] appendFileSync failed: ${logPath}\n`);
  }
}

function appendLogLine(logPath: string, line: string): void {
  try {
    appendFileSync(logPath, line);
  } catch (_appendError) {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, line);
  }
}

function emitLoggerRestored(opts: LoggerOptions, state: LoggerState, mod: string): void {
  if (!state.degraded || typeof opts.emitTelemetry !== 'function') return;
  state.degraded = false;
  const reason = state.degradedReason || 'missing_logger_degraded_reason';
  state.degradedReason = null;
  try {
    opts.emitTelemetry('observability.restored', {
      component: 'buster_logger', surface: 'jsonl_file', reason, detail: 'Buster logger file append restored',
      module_id: mod || null, gate_id: opts.gateId || null, attempt: opts.attempt ?? null,
      dispatch_id: opts.dispatchId || null, session_key: opts.sessionKey || null, restored_at: new Date().toISOString(),
    });
  } catch (error) {
    process.stderr.write(`[buster-logger] restored telemetry emit failed: ${sanitizeNonBlockingErrorDetail(asErrorLike(error)?.message || 'missing_telemetry_error_detail')}\n`);
  }
}
