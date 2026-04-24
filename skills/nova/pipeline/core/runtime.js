import fs from 'fs';
import path from 'path';
import { getActiveContext } from './logger.js';

const FALLBACK_RUN_CONTEXT = {
  runId: createRunId(),
  stats: createRunStats(),
};

// Backward-compatible live bindings used by older imports.
export let RUN_ID = FALLBACK_RUN_CONTEXT.runId;
export let _runStats = FALLBACK_RUN_CONTEXT.stats;

export function setRunState({ runId = createRunId(), stats = createRunStats() } = {}) {
  FALLBACK_RUN_CONTEXT.runId = runId;
  FALLBACK_RUN_CONTEXT.stats = stats;
  RUN_ID = runId;
  _runStats = stats;
  return { runId: RUN_ID, stats: _runStats };
}

export function createRunId() {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createRunStats(startedAt = new Date().toISOString()) {
  return {
    started_at: startedAt,
    modules_completed: [],
    modules_failed: [],
    modules_blocked: [],
    gates_completed: [],
    gates_failed: [],
    total_forge_attempts: 0,
    total_buster_attempts: 0,
    total_echo_reviews: 0,
    errors: [],
    discord_notifications_sent: 0,
    git_pull_failures: 0,
    git_push_failures: 0,
    config_validation_issues: [],
  };
}

export function bindRunContext(config, ctx) {
  if (!config || !ctx) return ctx;
  config._runId = ctx.runId;
  config.run_id = ctx.runId;
  config._runStats = ctx.stats;
  setRunState({ runId: ctx.runId, stats: ctx.stats });
  return ctx;
}

export function resolveRunContext(config = null) {
  const active = getActiveContext();
  if (active?.runId && active?.stats) {
    return {
      runId: active.runId,
      stats: active.stats,
      context: active,
      config: active.config || config || null,
    };
  }

  if (config?._runId && config?._runStats) {
    return {
      runId: config._runId,
      stats: config._runStats,
      context: null,
      config,
    };
  }

  return {
    runId: FALLBACK_RUN_CONTEXT.runId,
    stats: FALLBACK_RUN_CONTEXT.stats,
    context: null,
    config,
  };
}

export function getRunId(config = null) {
  return resolveRunContext(config).runId;
}

export function getRunStats(config = null) {
  return resolveRunContext(config).stats;
}

export function getRunState(config = null) {
  const { runId, stats } = resolveRunContext(config);
  return { runId, stats };
}

export function isoNow(value = new Date()) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date(value || Date.now()).toISOString();
}

export function createOpaqueId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEffectReceipt({
  accepted = true,
  requestId = createOpaqueId('req'),
  recordedAt = isoNow(),
  dedupeKey = undefined,
} = {}) {
  return {
    accepted,
    requestId,
    recordedAt,
    ...(dedupeKey !== undefined ? { dedupeKey } : {}),
  };
}

// Returns the run-scoped log directory: .swarm/logs/pipeline/runs/<run_id>/
// Requires config._logDir to be set (call after initLogDir).
export function runLogDir(config) {
  const runId = getRunId(config);
  return path.join(config._logDir, 'pipeline', 'runs', runId);
}

// Print a JSON result to stdout.
export function output(result) {
  console.log(JSON.stringify(result, null, 2));
}

// Load a progress.json file referenced by config.paths.progress_file.
export function loadProgress(config) {
  const p = config.paths.progress_file;
  if (!fs.existsSync(p)) throw new Error(`Progress file not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
