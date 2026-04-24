import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';

const _asyncContext = new AsyncLocalStorage();

export function setActiveContext(ctx) {
  _asyncContext.enterWith(ctx);
}

export function clearActiveContext() {
  _asyncContext.enterWith(null);
}

export function getActiveContext() {
  return _asyncContext.getStore() || null;
}

function writeEntry(ctx, entry) {
  const line = JSON.stringify(entry) + '\n';
  const targets = [];
  if (ctx._pipelineLogPath) targets.push(ctx._pipelineLogPath);
  if (ctx._runPipelineLogPath) targets.push(ctx._runPipelineLogPath);
  if (!targets.length && ctx.config?._runLogDir) targets.push(path.join(ctx.config._runLogDir, 'pipeline.jsonl'));
  for (const target of targets) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, line);
    } catch { /* non-critical */ }
  }
}

export function createLogger(ctx) {
  return {
    log(level, msg, data = null) {
      const entry = {
        ts: new Date().toISOString(),
        level,
        run_id: ctx.runId,
        ...(ctx._logModule && { module: ctx._logModule }),
        ...(ctx._logPhase && { phase: ctx._logPhase }),
        msg,
        ...(data !== null && { data }),
      };
      console.error(JSON.stringify(entry));
      writeEntry(ctx, entry);
      if (level === 'ERROR' && ctx.stats.errors.length < 50) {
        ctx.stats.errors.push({ ts: entry.ts, msg, ...(ctx._logModule && { module: ctx._logModule }) });
      }
    },
    setModule(moduleId) { ctx._logModule = moduleId; },
    setPhase(phase) { ctx._logPhase = phase; },
    clearScope() { ctx._logModule = null; ctx._logPhase = null; },
  };
}

// Initializes log file descriptors on a context — belongs in logger, not in services
export function initContextLogging(ctx, pipelineLogFd, runPipelineLogFd = null) {
  ctx._pipelineLogFd = pipelineLogFd;
  ctx._runPipelineLogFd = runPipelineLogFd;
  ctx._pipelineLogPath = pipelineLogFd?.path || null;
  ctx._runPipelineLogPath = runPipelineLogFd?.path || null;
  ctx._logFd = pipelineLogFd;
  ctx._runLogFd = runPipelineLogFd;
}

// Delegates to active context from AsyncLocalStorage; falls back to stderr when no context is active
export function log(level, msg, data = null) {
  const ctx = _asyncContext.getStore();
  if (!ctx) {
    // No active context — write to stderr only
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...(data !== null && { data }),
    };
    console.error(JSON.stringify(entry));
    return;
  }
  const entry = {
    ts: new Date().toISOString(),
    level,
    run_id: ctx.runId,
    ...(ctx._logModule && { module: ctx._logModule }),
    ...(ctx._logPhase && { phase: ctx._logPhase }),
    msg,
    ...(data !== null && { data }),
  };
  console.error(JSON.stringify(entry));
  writeEntry(ctx, entry);
  if (level === 'ERROR' && ctx.stats.errors.length < 50) {
    ctx.stats.errors.push({ ts: entry.ts, msg, ...(ctx._logModule && { module: ctx._logModule }) });
  }
}
