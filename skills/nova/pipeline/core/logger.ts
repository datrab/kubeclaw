// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { AsyncLocalStorage } from 'async_hooks';
import { sanitizeJsonEgress } from '../egress.ts';
import { emitPipelineLogAppendWarning } from '../services/system-io-warning.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type PipelineLogContext = {
  runId?: string;
  config?: Record<string, unknown>;
  stats: { errors: Array<Record<string, unknown>> };
  _pipelineLogFd?: { path?: string } | null;
  _runPipelineLogFd?: { path?: string } | null;
  _pipelineLogPath?: string | null;
  _runPipelineLogPath?: string | null;
  _logFd?: { path?: string } | null;
  _runLogFd?: { path?: string } | null;
  _logModule?: string | null;
  _logPhase?: string | null;
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
    } catch (error) {
      emitPipelineLogAppendWarning(ctx.config, target, error, {
        module_id: selectTruthyValue(() => (selectTruthyValue(() => (safeEntry.work_id), () => (ctx._logModule))), () => (null)),
        path_role: target === ctx._runPipelineLogPath ? 'run_pipeline_jsonl' : 'pipeline_jsonl',
      });
    }
  }
}

export function createLogger(ctx: PipelineLogContext) {
  return {
    log(level: string, msg: string, data: unknown = null) {
      const entry: LogEntry = {
        schema_version: 'runtime_log.v1', timestamp: new Date().toISOString(), level: level.toLowerCase() === 'step' || level.toLowerCase() === 'ok' ? 'info' : level.toLowerCase(), component: 'nova/pipeline',
        ...(ctx.runId && { run_id: ctx.runId }),
        ...(ctx._logModule && { work_id: ctx._logModule, work_type: 'module' }),
        ...(ctx._logPhase && { phase: ctx._logPhase }),
        message: msg,
        ...(data !== null && { data }),
      };
      const safeEntry = sanitizeJsonEgress(entry, 'log_entry') as LogEntry;
      console.error(JSON.stringify(safeEntry));
      writeEntry(ctx, safeEntry);
      if (level === 'ERROR' && ctx.stats.errors.length < 50) {
        ctx.stats.errors.push({ timestamp: safeEntry.timestamp, message: safeEntry.message, ...(ctx._logModule && { work_id: ctx._logModule }) });
      }
    },
    setModule(moduleId: string | null) { ctx._logModule = moduleId; },
    setPhase(phase: string | null) { ctx._logPhase = phase; },
    clearScope() { ctx._logModule = null; ctx._logPhase = null; },
  };
}

// Initializes log file descriptors on a context — belongs in logger, not in services
export function initContextLogging(
  ctx: PipelineLogContext,
  pipelineLogFd: { path?: string } | null,
  runPipelineLogFd: { path?: string } | null = null,
) {
  ctx._pipelineLogFd = pipelineLogFd;
  ctx._runPipelineLogFd = runPipelineLogFd;
  ctx._pipelineLogPath = selectTruthyValue(() => (pipelineLogFd?.path), () => (null));
  ctx._runPipelineLogPath = selectTruthyValue(() => (runPipelineLogFd?.path), () => (null));
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
  const entry: LogEntry = {
    schema_version: 'runtime_log.v1', timestamp: new Date().toISOString(), level: level.toLowerCase() === 'step' || level.toLowerCase() === 'ok' ? 'info' : level.toLowerCase(), component: 'nova/pipeline',
    ...(ctx.runId && { run_id: ctx.runId }),
    ...(ctx._logModule && { work_id: ctx._logModule, work_type: 'module' }),
    ...(ctx._logPhase && { phase: ctx._logPhase }),
    message: msg,
    ...(data !== null && { data }),
  };
  const safeEntry = sanitizeJsonEgress(entry, 'log_entry') as LogEntry;
  console.error(JSON.stringify(safeEntry));
  writeEntry(ctx, safeEntry);
  if (level === 'ERROR' && ctx.stats.errors.length < 50) {
    ctx.stats.errors.push({ timestamp: safeEntry.timestamp, message: safeEntry.message, ...(ctx._logModule && { work_id: ctx._logModule }) });
  }
}
