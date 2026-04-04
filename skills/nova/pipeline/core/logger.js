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
      if (ctx._logFd) {
        try { ctx._logFd.write(JSON.stringify(entry) + '\n'); } catch { /* non-critical */ }
      }
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
export function initContextLogging(ctx, pipelineLogFd) {
  ctx._pipelineLogFd = pipelineLogFd;
  ctx._logFd = pipelineLogFd;
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
  if (ctx._logFd) {
    try { ctx._logFd.write(JSON.stringify(entry) + '\n'); } catch { /* non-critical */ }
  } else if (ctx.config?._runLogDir) {
    // Fallback: direct append to run-scoped pipeline.jsonl when no stream is open
    try { fs.appendFileSync(path.join(ctx.config._runLogDir, 'pipeline.jsonl'), JSON.stringify(entry) + '\n'); } catch { /* non-critical */ }
  }
  if (level === 'ERROR' && ctx.stats.errors.length < 50) {
    ctx.stats.errors.push({ ts: entry.ts, msg, ...(ctx._logModule && { module: ctx._logModule }) });
  }
}
