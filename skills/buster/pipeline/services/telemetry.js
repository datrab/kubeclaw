// ═══════════════════════════════════════════════════════════════
// Telemetry — Buster Event Emission to Redis Stream
// ═══════════════════════════════════════════════════════════════
//
// Fire-and-forget telemetry for the Buster Pipeline and suites.
// Events are published to the canonical run-scoped pipeline stream so
// downstream consumers can reconstruct one ordered timeline per run.

import fs from 'fs';
import path from 'path';

import {
  TELEMETRY_SEQ_TTL_SECONDS,
  getTelemetrySeqKey,
  getTelemetryStreamKey,
  loadRedisCtor,
} from '../../../common/pipeline/telemetry.js';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../../../common/pipeline/noncritical-reporting.js';
import { sanitizeTelemetryPayload } from '../../../common/pipeline/redaction.js';

const DEFAULT_STREAM_MAXLEN = 5000;

function reportBusterTelemetryIncident(ctxOrOpts = {}, classification, error, message, options = {}) {
  reportClassifiedNonBlockingError({
    reporter: 'buster-telemetry',
    classification,
    incidentKey: buildNonBlockingIncidentKey(
      'buster-telemetry',
      ctxOrOpts?.project || 'unknown',
      ctxOrOpts?.runId || ctxOrOpts?.run_id || 'unknown',
      ctxOrOpts?.moduleId || ctxOrOpts?.module || 'global',
      classification,
      options.scope || 'global'
    ),
    message,
    error,
    level: options.level || 'DEBUG',
    fallback: (_level, line) => process.stderr.write(`${line}\n`),
  });
}

function normalizeStreamKey(_legacyStreamKey, project, runId) {
  return getTelemetryStreamKey(project, runId);
}

export function resolveTelemetryStreamKey(opts = {}) {
  const project = opts.project || '';
  const runId = opts.runId || opts.run_id || '';
  return normalizeStreamKey(opts.streamKey || opts.stream_key || null, project, runId);
}

function buildEnvelope(ctx, type, data = {}, seq) {
  return {
    v: 1,
    type,
    ts: new Date().toISOString(),
    project: ctx.project,
    run_id: ctx.runId,
    seq,
    source: 'buster',
    emitter: ctx.emitter,
    module_id: data.module_id ?? ctx.moduleId ?? null,
    attempt: data.attempt ?? ctx.attempt ?? null,
    dispatch_id: data.dispatch_id ?? ctx.dispatchId ?? null,
    session_key: data.session_key ?? ctx.sessionKey ?? null,
    ...data,
  };
}

function appendFallbackEvent(ctx, type, data = {}) {
  if (!ctx?.logDir) return;
  try {
    fs.mkdirSync(ctx.logDir, { recursive: true });
    const record = {
      v: 1,
      type,
      ts: new Date().toISOString(),
      project: ctx.project,
      run_id: ctx.runId,
      source: 'buster',
      emitter: ctx.emitter,
      ...sanitizeTelemetryPayload(data || {}),
    };
    fs.appendFileSync(path.join(ctx.logDir, 'telemetry-fallback.jsonl'), JSON.stringify(record) + '\n');
  } catch (error) {
    reportBusterTelemetryIncident(ctx, 'fallback_artifact_write_failed', error, 'Buster telemetry fallback artifact write failed', {
      scope: type || 'unknown',
    });
  }
}

function appendPipelineArtifactEvent(ctx, event) {
  const targets = [ctx?.pipelineLogPath, ctx?.pipelineRunLogPath].filter(Boolean);
  if (!targets.length || !event) return;
  try {
    for (const target of targets) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, JSON.stringify(event) + '\n');
    }
  } catch (error) {
    reportBusterTelemetryIncident(ctx, 'pipeline_artifact_write_failed', error, 'Buster telemetry pipeline artifact mirror write failed', {
      scope: event?.type || 'unknown',
    });
  }
}

function createContext(opts = {}, overrides = {}) {
  const resolvedModuleId = opts.moduleId || opts.module || '';
  return {
    redis: overrides.redis ?? null,
    streamKey: resolveTelemetryStreamKey({ project: opts.project, runId: opts.runId, streamKey: opts.streamKey }),
    seqKey: getTelemetrySeqKey(opts.project, opts.runId),
    project: opts.project || '',
    runId: opts.runId || '',
    moduleId: resolvedModuleId,
    emitter: opts.emitter || 'buster/pipeline/services/telemetry',
    logDir: opts.logDir || null,
    pipelineLogPath: opts.pipelineLogPath || null,
    pipelineRunLogPath: opts.pipelineRunLogPath || null,
    attempt: opts.attempt ?? null,
    dispatchId: opts.dispatchId ?? null,
    sessionKey: opts.sessionKey ?? null,
    _health: overrides.health || { redis: { degraded: false, degradedAt: null } },
  };
}

function markTelemetryDegradedOnce(ctx, type, detail) {
  if (!ctx || ctx._health?.redis?.degraded) return;
  const degradedAt = new Date().toISOString();
  ctx._health = {
    ...(ctx._health || {}),
    redis: {
      ...(ctx._health?.redis || {}),
      degraded: true,
      degradedAt,
      detail: detail || ctx._health?.redis?.detail || 'redis telemetry emission failed',
    },
  };
  appendFallbackEvent(ctx, 'observability.degraded', {
    component: 'telemetry',
    surface: 'redis_stream',
    reason: 'redis_emit_failed',
    detail: ctx._health.redis.detail,
    module_id: ctx.moduleId || null,
    impacted_event_type: type || null,
    stream_key: ctx.streamKey || null,
    degraded_at: degradedAt,
  });
}

async function emitRestoredIfNeeded(ctx) {
  if (!ctx?._health?.redis?.degraded || !ctx?.redis) return;
  const degradedAt = ctx._health.redis.degradedAt || null;
  const restoredAt = new Date().toISOString();
  const payload = {
    component: 'telemetry',
    surface: 'redis_stream',
    reason: 'redis_emit_failed',
    detail: 'redis telemetry emission restored',
    module_id: ctx.moduleId || null,
    stream_key: ctx.streamKey || null,
    degraded_at: degradedAt,
    restored_at: restoredAt,
    restored_after_ms: degradedAt ? Math.max(0, Date.now() - new Date(degradedAt).getTime()) : null,
  };
  ctx._health.redis = { degraded: false, degradedAt: null };
  appendFallbackEvent(ctx, 'observability.restored', payload);
  try {
    const seq = await ctx.redis.incr(ctx.seqKey);
    const event = buildEnvelope(ctx, 'observability.restored', sanitizeTelemetryPayload(payload), seq);
    appendPipelineArtifactEvent(ctx, event);
    await ctx.redis
      .multi()
      .xadd(ctx.streamKey, 'MAXLEN', '~', String(DEFAULT_STREAM_MAXLEN), '*', 'data', JSON.stringify(event))
      .expire(ctx.seqKey, TELEMETRY_SEQ_TTL_SECONDS)
      .exec();
  } catch (error) {
    reportBusterTelemetryIncident(ctx, 'restored_backfill_failed', error, 'Buster telemetry restore backfill failed; keeping artifact-only signal', {
      scope: 'observability.restored',
    });
  }
}

/**
 * Create a per-run telemetry context.
 *
 * @param {object} opts
 * @param {string} opts.project
 * @param {string} opts.module
 * @param {string} [opts.moduleId]
 * @param {string} opts.runId
 * @param {string} [opts.streamKey] Legacy compatibility hint. The value does not rename the stream.
 * @param {string} [opts.redisHost]
 * @param {number} [opts.redisPort]
 * @param {string} [opts.redisPassword]
 * @param {boolean} [opts.enabled]
 * @param {string} [opts.emitter]
 * @param {string} [opts.logDir]
 * @returns {object|null}
 */
export function createTelemetryContext(opts = {}) {
  const {
    redisHost = process.env.REDIS_HOST || 'redis-master.kubeclaw.svc.cluster.local',
    redisPort = parseInt(process.env.REDIS_PORT || '6379', 10),
    redisPassword = process.env.REDIS_PASSWORD || undefined,
    enabled,
  } = opts;

  const shouldEnable = enabled !== undefined ? enabled : !!process.env.REDIS_HOST;
  if (!shouldEnable) return null;

  try {
    const Redis = loadRedisCtor();
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      retryStrategy: (times) => (times > 2 ? null : Math.min(times * 200, 1000)),
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 3000,
      lazyConnect: true,
      enableReadyCheck: false,
    });
    redis.on('error', (error) => {
      reportBusterTelemetryIncident(opts, 'redis_client_runtime_error', error, 'Buster telemetry Redis client emitted a non-blocking runtime error');
    });
    return createContext(opts, { redis });
  } catch (err) {
    reportBusterTelemetryIncident(opts, 'redis_client_init_failed', err, 'Buster telemetry Redis client initialization failed');
    return createContext(opts, {
      redis: null,
      health: {
        redis: {
          degraded: false,
          degradedAt: null,
          detail: err?.message || 'redis client unavailable',
          unavailable: true,
        },
      },
    });
  }
}

/**
 * Fire-and-forget event emission.
 *
 * @param {object|null} ctx
 * @param {string} type
 * @param {object} data
 */
export async function emitEvent(ctx, type, data = {}) {
  if (!ctx || !type) return;
  if (!ctx.redis) {
    markTelemetryDegradedOnce(ctx, type, ctx?._health?.redis?.detail || 'redis client unavailable');
    return;
  }
  try {
    const seq = await ctx.redis.incr(ctx.seqKey);
    const event = buildEnvelope(ctx, type, sanitizeTelemetryPayload(data || {}), seq);
    appendPipelineArtifactEvent(ctx, event);
    await ctx.redis
      .multi()
      .xadd(ctx.streamKey, 'MAXLEN', '~', String(DEFAULT_STREAM_MAXLEN), '*', 'data', JSON.stringify(event))
      .expire(ctx.seqKey, TELEMETRY_SEQ_TTL_SECONDS)
      .exec();
    await emitRestoredIfNeeded(ctx);
  } catch (err) {
    markTelemetryDegradedOnce(ctx, type, err?.message || 'redis telemetry emission failed');
    // Fire-and-forget — telemetry must never block orchestration.
  }
}

export async function closeTelemetry(ctx) {
  if (!ctx || !ctx.redis) return;
  try {
    await ctx.redis.quit();
  } catch (error) {
    reportBusterTelemetryIncident(ctx, 'redis_close_failed', error, 'Buster telemetry Redis client close failed');
  }
}
