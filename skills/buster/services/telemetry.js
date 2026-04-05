// ═══════════════════════════════════════════════════════════════
// Telemetry — Buster Event Emission to Redis Stream
// ═══════════════════════════════════════════════════════════════
//
// Fire-and-forget telemetry for the buster orchestrator and suites.
// Every event is published to a per-task Redis stream so ClawDeck
// can consume real-time progress without polling status.json.
//
// Each task gets its own TelemetryContext with a dedicated Redis
// connection and monotonic sequence counter. Telemetry failures
// are always swallowed — they must never block or crash buster.
//
// Stream key format: buster:telemetry:<project>:<module>
// (or override via opts.streamKey)
//
// Event envelope on the stream:
//   { type, seq, ts, project, module, run_id, data: { ...payload } }

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ── Context ──────────────────────────────────────────────────────

/**
 * Create a per-task telemetry context.
 *
 * Establishes a dedicated Redis connection with aggressive timeouts
 * and silent error swallowing. Returns null if telemetry is disabled
 * or the Redis package is unavailable.
 *
 * @param {object} opts
 * @param {string}  opts.project         - Project name (e.g. "kubecommand")
 * @param {string}  opts.module          - Module ID (e.g. "02-api")
 * @param {string}  opts.runId           - Run ID for event correlation
 * @param {string}  [opts.streamKey]     - Override stream key (default: buster:telemetry:<project>:<module>)
 * @param {string}  [opts.redisHost]     - Redis host (default: REDIS_HOST env)
 * @param {number}  [opts.redisPort]     - Redis port (default: REDIS_PORT env or 6379)
 * @param {string}  [opts.redisPassword] - Redis password (default: REDIS_PASSWORD env)
 * @param {boolean} [opts.enabled]       - Explicit enable flag (default: true if REDIS_HOST is set)
 * @returns {object|null} TelemetryContext, or null if disabled
 */
export function createTelemetryContext(opts = {}) {
  const {
    project,
    module: moduleId,
    runId,
    streamKey,
    redisHost     = process.env.REDIS_HOST || 'redis-master.kubeclaw.svc.cluster.local',
    redisPort     = parseInt(process.env.REDIS_PORT || '6379', 10),
    redisPassword = process.env.REDIS_PASSWORD || undefined,
    enabled,
  } = opts;

  // Default: enabled when REDIS_HOST is explicitly configured
  const shouldEnable = (enabled !== undefined) ? enabled : !!(process.env.REDIS_HOST);
  if (!shouldEnable) return null;

  let redis = null;
  try {
    const Redis = require('ioredis');
    redis = new Redis({
      host:                redisHost,
      port:                redisPort,
      password:            redisPassword,
      retryStrategy:       (times) => (times > 2 ? null : Math.min(times * 200, 1000)),
      maxRetriesPerRequest: 1,
      connectTimeout:      3000,
      commandTimeout:      3000,
      lazyConnect:         true,
      enableReadyCheck:    false,
    });
    redis.on('error', () => {}); // swallow all Redis errors silently
  } catch {
    // ioredis not installed or failed to init — degrade gracefully
    return null;
  }

  const key = streamKey || `buster:telemetry:${project}:${moduleId}`;

  return {
    redis,
    streamKey:  key,
    project:    project    || '',
    module:     moduleId   || '',
    runId:      runId      || '',
    _seq:       0,
  };
}

// ── Emission ─────────────────────────────────────────────────────

/**
 * Fire-and-forget event emission.
 *
 * ctx can be null — emitEvent() becomes a no-op in that case, so callers
 * never need to null-check before calling.
 *
 * Automatically appends: seq, ts, project, module, run_id to every event.
 * Event-specific fields go into the `data` envelope key.
 *
 * @param {object|null} ctx  - TelemetryContext from createTelemetryContext()
 * @param {string}      type - Event type (e.g. "buster.suite_completed")
 * @param {object}      data - Event-specific payload fields
 */
export async function emitEvent(ctx, type, data = {}) {
  if (!ctx || !ctx.redis) return;
  try {
    const seq   = ++ctx._seq;
    const event = {
      type,
      seq,
      ts:      new Date().toISOString(),
      project: ctx.project,
      module:  ctx.module,
      run_id:  ctx.runId,
      data,
    };
    await ctx.redis.xadd(
      ctx.streamKey,
      'MAXLEN', '~', '5000',
      '*',
      'data', JSON.stringify(event),
    );
  } catch {
    // Fire-and-forget — swallow all errors
  }
}

// ── Cleanup ───────────────────────────────────────────────────────

/**
 * Disconnect the telemetry Redis client for this context.
 * Safe to call when ctx is null or Redis is already disconnected.
 *
 * @param {object|null} ctx
 */
export async function closeTelemetry(ctx) {
  if (!ctx || !ctx.redis) return;
  try {
    await ctx.redis.quit();
  } catch {
    // Non-critical
  }
}
