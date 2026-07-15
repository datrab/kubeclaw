// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
import { getActiveContext } from './logger.ts';
import { sanitizeJsonEgress } from '../egress.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type RunStats = ReturnType<typeof createRunStats>;
type RunContextLike = {
  runId?: string | null;
  stats?: RunStats | null;
  config?: Record<string, any> | null;
};
type ConfigProjection = Record<string, any> | null;

export function createRunId() {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createRunStats(startedAt = new Date().toISOString()) {
  return {
    started_at: startedAt,
    modules_completed: [] as any[],
    modules_failed: [] as any[],
    modules_blocked: [] as any[],
    gates_completed: [] as any[],
    gates_failed: [] as any[],
    total_forge_attempts: 0,
    total_buster_attempts: 0,
    total_echo_reviews: 0,
    errors: [] as any[],
    discord_notifications_sent: 0,
    git_pull_failures: 0,
    git_push_failures: 0,
    config_validation_issues: [] as any[],
  };
}

export function bindRunContext(config: Record<string, any> | null, ctx: RunContextLike | null) {
  if (selectTruthyValue(() => (!config), () => (!ctx))) return ctx;
  config._runId = ctx.runId;
  config.run_id = ctx.runId;
  config._runStats = ctx.stats;
  return ctx;
}

function resolveContextInput(input: RunContextLike | null = null) {
  if (input?.runId && input?.stats) {
    return {
      runId: input.runId,
      stats: input.stats,
      context: input,
      config: selectTruthyValue(() => (input.config), () => (null)),
    };
  }
  return null;
}

function resolveConfigProjection(config: ConfigProjection = null) {
  if (!config) return null;
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (config._runId), () => (config.run_id))), () => (null));
  const stats = selectTruthyValue(() => (config._runStats), () => (null));
  if (!runId && !stats) return null;
  if (!runId) throw new Error('run context is missing run id; pass PipelineContext or bind config._runId/run_id');
  if (!stats) throw new Error('run context is missing stats; pass PipelineContext or bind config._runStats');
  return {
    runId,
    stats,
    context: null,
    config,
  };
}

export function resolveRunContext(config: RunContextLike | ConfigProjection = null) {
  const explicitContext = resolveContextInput(config as RunContextLike | null);
  if (explicitContext) return explicitContext;

  const configProjection = resolveConfigProjection(config as ConfigProjection);
  if (configProjection) return configProjection;

  const active = getActiveContext();
  if (active?.runId && active?.stats) {
    return {
      runId: active.runId,
      stats: active.stats,
      context: active,
      config: selectTruthyValue(() => (selectTruthyValue(() => (active.config), () => (config))), () => (null)),
    };
  }

  throw new Error('run context is unavailable; pass PipelineContext/run-bound config or set an active context');
}

export function getRunId(config: RunContextLike | ConfigProjection = null) {
  const directRunId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => ((config as any)?.runId), () => ((config as any)?._runId))), () => ((config as any)?.run_id))), () => (null));
  if (directRunId) return directRunId;
  const active = getActiveContext();
  if (active?.runId) return active.runId;
  return null;
}

export function getRunStats(config: RunContextLike | ConfigProjection = null) {
  return resolveRunContext(config).stats;
}

export function getOptionalRunStats(config: RunContextLike | ConfigProjection = null) {
  try {
    return resolveRunContext(config).stats;
  } catch (_error) {
    return null;
  }
}

export function getRunState(config: RunContextLike | ConfigProjection = null) {
  const { runId, stats } = resolveRunContext(config);
  return { runId, stats };
}

export function isoNow(value: any = new Date()) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date(timestampAuthority(value)).toISOString();
}

function timestampAuthority(value) {
  if (value) return value;
  return Date.now();
}

export function createOpaqueId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEffectReceipt({
  accepted = true,
  requestId = createOpaqueId('req'),
  recordedAt = isoNow(),
  dedupeKey = undefined,
}: {
  accepted?: boolean;
  requestId?: string;
  recordedAt?: string;
  dedupeKey?: string;
} = {}) {
  return {
    accepted,
    requestId,
    recordedAt,
    ...(dedupeKey !== undefined ? { dedupeKey } : {}),
  };
}

// Print a JSON result to stdout.
export function output(result: unknown) {
  console.log(JSON.stringify(sanitizeJsonEgress(result as any, 'stdout_result'), null, 2));
}

// Load a progress.json file referenced by config.paths.progress_file.
export function loadProgress(config: Record<string, any>) {
  const p = config.paths.progress_file;
  if (!fs.existsSync(p)) throw new Error(`Progress file not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
