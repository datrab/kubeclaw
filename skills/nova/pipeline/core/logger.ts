import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { sanitizeJsonEgress } from '../egress.ts';
import { emitPipelineLogAppendWarning } from '../services/system-io-warning.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type PipelineLogContext = {
  runId?: string;
  config?: Record<string, unknown> | null;
  pluginRegistry?: unknown;
  runtimeOverrides?: unknown;
  stats?: Record<string, any>;
  _pipelineLogFd?: { path?: string | Buffer } | null;
  _runPipelineLogFd?: { path?: string | Buffer } | null;
  _pipelineLogPath?: string | null;
  _runPipelineLogPath?: string | null;
  _logFd?: { path?: string | Buffer } | null;
  _runLogFd?: { path?: string | Buffer } | null;
  _logModule?: string | null;
  _logPhase?: string | null;
  _runtimeLogSequence?: number;
};
type LogEntry = Record<string, unknown> & {
  schema_version: 'runtime_log.v1';
  timestamp: string;
  level: string;
  component: string;
  message: string;
  run_id?: string;
  work_id?: string | null;
  work_type?: string | null;
  phase?: string | null;
  data?: unknown;
};

const _asyncContext = new AsyncLocalStorage<PipelineLogContext | null>();

export function setActiveContext(ctx: PipelineLogContext) {
  _asyncContext.enterWith(ctx);
}

export function clearActiveContext() {
  _asyncContext.enterWith(null);
}

export function getActiveContext() {
  return selectTruthyValue(() => (_asyncContext.getStore()), () => (null));
}

export function runWithActiveContext<T>(ctx: PipelineLogContext, fn: () => T): T {
  return _asyncContext.run(ctx, fn);
}

function writeEntry(ctx: PipelineLogContext, entry: LogEntry) {
  const safeEntry = sanitizeJsonEgress(entry, 'log_entry') as LogEntry;
  const line = JSON.stringify(safeEntry) + '\n';
  const targets: string[] = [];
  if (ctx._pipelineLogPath) targets.push(ctx._pipelineLogPath);
  if (ctx._runPipelineLogPath) targets.push(ctx._runPipelineLogPath);
  for (const target of targets) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, line);
    } catch (error: any) {
      emitPipelineLogAppendWarning(ctx.config, target, error, {
        module_id: selectTruthyValue(() => (selectTruthyValue(() => (safeEntry.work_id), () => (ctx._logModule))), () => (null)),
        path_role: target === ctx._runPipelineLogPath ? 'run_pipeline_jsonl' : 'pipeline_jsonl',
      });
    }
  }
  appendRuntimeLogEntry(ctx, safeEntry);
  const emitCanonical = ctx.config?._emitCanonicalEvidence;
  if (typeof emitCanonical === 'function') {
    ctx._runtimeLogSequence = (ctx._runtimeLogSequence ?? 0) + 1;
    void Promise.resolve(emitCanonical('runtime.log', {
      level: safeEntry.level,
      component: safeEntry.component,
      message: safeEntry.message,
      module_id: safeEntry.work_id ?? null,
      error_class: null,
      reason_code: null,
    }, { sourceEventId: `runtime-log/${safeEntry.timestamp}/${safeEntry.component}/${safeEntry.work_id ?? 'run'}/${ctx._runtimeLogSequence}` }));
  }
}

function appendRuntimeLogEntry(ctx: PipelineLogContext, entry: LogEntry): void {
  if (!ctx._runPipelineLogPath) return;
  const runtimeLogPath = path.join(path.dirname(ctx._runPipelineLogPath), 'runtime-logs.jsonl');
  const runtimeEntry = {
    schema_version: 'runtime_log.v1',
    timestamp: entry.timestamp,
    level: entry.level,
    component: entry.component,
    message: entry.message,
    project: typeof ctx.config?.project === 'string' ? ctx.config.project : null,
    run_id: ctx.runId ?? null,
    work_id: entry.work_id ?? null,
    error_class: null,
    reason_code: null,
  };
  try {
    fs.appendFileSync(runtimeLogPath, JSON.stringify(runtimeEntry) + '\n');
  } catch (error: any) {
    emitPipelineLogAppendWarning(ctx.config, runtimeLogPath, error, {
      module_id: entry.work_id ?? ctx._logModule,
      path_role: 'run_runtime_logs_jsonl',
    });
  }
}

export function createLogger(ctx: PipelineLogContext) {
  return {
    log(level: string, msg: string, data: unknown = null) {
      emitScopedLogEntry(ctx, level, msg, data);
    },
    setModule(moduleId: string | null) { ctx._logModule = moduleId; },
    setPhase(phase: string | null) { ctx._logPhase = phase; },
    clearScope() { ctx._logModule = null; ctx._logPhase = null; },
  };
}

function buildScopedLogEntry(ctx: PipelineLogContext, level: string, msg: string, data: unknown): LogEntry {
  const normalizedLevel = level.toLowerCase();
  return {
    schema_version: 'runtime_log.v1',
    timestamp: new Date().toISOString(),
    level: normalizedLevel === 'step' || normalizedLevel === 'ok' ? 'info' : normalizedLevel,
    component: 'nova/pipeline',
    ...(ctx.runId && { run_id: ctx.runId }),
    ...(ctx._logModule && { work_id: ctx._logModule, work_type: 'module' }),
    ...(ctx._logPhase && { phase: ctx._logPhase }),
    message: msg,
    ...(data !== null && { data }),
  };
}

function emitScopedLogEntry(ctx: PipelineLogContext, level: string, msg: string, data: unknown): void {
  const safeEntry = sanitizeJsonEgress(buildScopedLogEntry(ctx, level, msg, data), 'log_entry') as LogEntry;
  console.error(JSON.stringify(safeEntry));
  writeEntry(ctx, safeEntry);
  const errors = Array.isArray(ctx.stats?.errors) ? ctx.stats.errors : null;
  if (level === 'ERROR' && errors && errors.length < 50) {
    errors.push({ timestamp: safeEntry.timestamp, message: safeEntry.message, ...(ctx._logModule && { work_id: ctx._logModule }) });
  }
}

// Initializes log file descriptors on a context — belongs in logger, not in services
export function initContextLogging(
  ctx: PipelineLogContext,
  pipelineLogFd: { path?: string | Buffer } | null,
  runPipelineLogFd: { path?: string | Buffer } | null = null,
) {
  ctx._pipelineLogFd = pipelineLogFd;
  ctx._runPipelineLogFd = runPipelineLogFd;
  ctx._pipelineLogPath = selectTruthyValue(() => (String(pipelineLogFd?.path ?? "")), () => (null));
  ctx._runPipelineLogPath = selectTruthyValue(() => (String(runPipelineLogFd?.path ?? "")), () => (null));
  ctx._logFd = pipelineLogFd;
  ctx._runLogFd = runPipelineLogFd;
}

// Delegates to active context from AsyncLocalStorage; falls back to stderr when no context is active
export function log(level: string, msg: string, data: unknown = null) {
  const ctx = _asyncContext.getStore();
  if (!ctx) {
    // No active context — write to stderr only
    const entry: LogEntry = {
      schema_version: 'runtime_log.v1', timestamp: new Date().toISOString(), level: level.toLowerCase() === 'step' || level.toLowerCase() === 'ok' ? 'info' : level.toLowerCase(), component: 'nova/pipeline', message: msg,
      ...(data !== null && { data }),
    };
    console.error(JSON.stringify(sanitizeJsonEgress(entry, 'log_entry')));
    return;
  }
  emitScopedLogEntry(ctx, level, msg, data);
}
