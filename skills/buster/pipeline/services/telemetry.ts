import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Telemetry — Buster Event Emission to Redis Stream
// ═══════════════════════════════════════════════════════════════
//
// Fire-and-forget telemetry for the Buster Pipeline and suites.
// Events are published to the canonical run-scoped pipeline stream so
// downstream consumers can reconstruct one ordered timeline per run.

import {
  TELEMETRY_SEQ_TTL_SECONDS,
  requireTelemetryStreamMaxLen,
  requireTelemetryStreamMaxLenFromConfig,
  getTelemetrySeqKey,
  getTelemetryStreamKey,
  createRedisClient,
  loadRedisCtor,
} from '../telemetry.ts';
import { sanitizeTelemetryPayload } from '../egress.ts';
import { loadBusterPlatformConfig } from './runtime-policy.ts';
import { assertTelemetryEventPayload, buildPluginTelemetryPayload } from './telemetry/payload-schema.ts';
import { appendPipelineArtifactEvent, appendQuarantinedEvent, buildTelemetryEnvelope as buildEnvelope } from './telemetry-artifacts.ts';
import { errorMessage, reportBusterTelemetryIncident } from './telemetry-incidents.ts';
import type { BusterTelemetryContext, ContextOverrides, RedisClient, TelemetryHealth, TelemetryIdentity, TelemetryOptions, TelemetryRecord as AnyRecord } from './telemetry-contracts.ts';
export type { BusterTelemetryContext } from './telemetry-contracts.ts';

interface ErrorLike { message?: string; validationErrors?: unknown[] }
function asTelemetryContext(ctx: unknown): BusterTelemetryContext | null {
  return ctx && typeof ctx === 'object' ? ctx as BusterTelemetryContext : null;
}

function resolveTelemetryStreamMaxLen(opts: TelemetryOptions = {}): number {
  if (opts.streamMaxLen !== undefined) {
    return requireTelemetryStreamMaxLen(opts.streamMaxLen, 'telemetry.streamMaxLen');
  }
  return requireTelemetryStreamMaxLenFromConfig(loadBusterPlatformConfig());
}

function telemetryIdentityAuthority(opts: TelemetryOptions, overrides: ContextOverrides): ReturnType<typeof resolveTelemetryStreamIdentity> {
  if (overrides.identity !== undefined && overrides.identity !== null) return overrides.identity as ReturnType<typeof resolveTelemetryStreamIdentity>;
  return resolveTelemetryStreamIdentity(opts);
}

function telemetryHealthAuthority(identity: ReturnType<typeof resolveTelemetryStreamIdentity>, overrides: ContextOverrides): TelemetryHealth {
  if (overrides.health !== undefined && overrides.health !== null) return overrides.health;
  return {
    redis: identity.ok
      ? { degraded: false, degradedAt: null }
      : {
          degraded: false,
          degradedAt: null,
          unavailable: true,
          reason: 'missing_identity',
          detail: selectDefinedValue(() => (identity.error?.message), () => ('Buster telemetry stream identity missing')),
        },
  };
}

function normalizeTelemetryIdentityPart(value: unknown): string | null {
  const normalized = value == null ? '' : String(value).trim();
  return selectTruthyValue(() => (normalized), () => (null));
}

function resolveTelemetryStreamIdentity(opts: TelemetryOptions = {}): TelemetryIdentity {
  const project = normalizeTelemetryIdentityPart(opts.project);
  const runId = normalizeTelemetryIdentityPart(opts.run_id);
  if (selectTruthyValue(() => (!project), () => (!runId))) {
    return {
      ok: false,
      project,
      runId,
      streamKey: null,
      seqKey: null,
      error: new Error('Buster telemetry stream emission requires non-empty project and run_id'),
    };
  }
  return {
    ok: true,
    project,
    runId,
    streamKey: getTelemetryStreamKey(project, runId),
    seqKey: getTelemetrySeqKey(project, runId),
    error: null,
  };
}

function resolveTelemetryStreamKey(opts: TelemetryOptions = {}): string | null {
  const identity = resolveTelemetryStreamIdentity(opts);
  return identity.streamKey;
}

function createContext(opts: TelemetryOptions = {}, overrides: ContextOverrides = {}): BusterTelemetryContext {
  const identity = telemetryIdentityAuthority(opts, overrides);
  const redis = identity.ok && overrides.redis ? overrides.redis : null;
  const stringOrNull = (value: unknown): string | null => typeof value === 'string' && value ? value : null;
  return {
    redis,
    streamKey: identity.streamKey,
    seqKey: identity.seqKey,
    project: stringOrNull(identity.project) || '',
    runId: stringOrNull(identity.runId) || '',
    moduleId: typeof opts.module_id === 'string' ? opts.module_id : '',
    emitter: typeof opts.emitter === 'string' && opts.emitter.trim() ? opts.emitter : 'buster/pipeline/services/telemetry',
    logDir: stringOrNull(opts.log_dir),
    pipelineLogPath: stringOrNull(opts.pipeline_log_path),
    pipelineRunLogPath: stringOrNull(opts.pipeline_run_log_path),
    attempt: selectDefinedValue(() => (opts.attempt), () => (null)),
    dispatchId: stringOrNull(opts.dispatch_id),
    sessionKey: stringOrNull(opts.session_key),
    gateId: stringOrNull(opts.gate_id),
    gateType: stringOrNull(opts.gate_type),
    streamMaxLen: resolveTelemetryStreamMaxLen(opts),
    _health: telemetryHealthAuthority(identity, overrides),
  };
}

function recordTelemetryPayloadInvalid(ctx: BusterTelemetryContext, type: string, error: unknown): void {
  const errorLike = error && typeof error === 'object' ? error as ErrorLike : null;
  const payload = {
    component: 'telemetry_spine',
    surface: 'core_emit',
    reason: 'telemetry_payload_invalid',
    detail: selectDefinedValue(() => (errorLike?.message), () => ('telemetry payload validation failed')),
    module_id: ctx?.gateId ? null : (selectDefinedValue(() => (ctx?.moduleId), () => (null))),
    gate_id: selectDefinedValue(() => (ctx?.gateId), () => (null)),
    gate_type: ctx?.gateId ? (selectDefinedValue(() => (ctx?.gateType), () => (null))) : undefined,
    attempt: selectDefinedValue(() => (ctx?.attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (ctx?.dispatchId), () => (null)),
    session_key: selectDefinedValue(() => (ctx?.sessionKey), () => (null)),
    impacted_event_type: selectTruthyValue(() => (type), () => (null)),
    validation_errors: Array.isArray(errorLike?.validationErrors) ? errorLike.validationErrors : [],
    degraded_at: new Date().toISOString(),
  };
  appendQuarantinedEvent(ctx, 'observability.degraded', payload);
  const sanitizedPayload = sanitizeTelemetryPayload(payload);
  appendPipelineArtifactEvent(ctx, buildEnvelope(ctx, 'observability.degraded', {
    ...sanitizedPayload,
  }, null));
}

function markTelemetryDegradedOnce(ctx: BusterTelemetryContext | null, type: string, detail: unknown): void {
  if (!ctx || ctx._health.redis.degraded) return;
  const degradedAt = new Date().toISOString();
  ctx._health = {
    ...(selectDefinedValue(() => (ctx._health), () => ({}))),
    redis: {
      ...(selectDefinedValue(() => (ctx._health?.redis), () => ({}))),
      degraded: true,
      degradedAt,
      detail: selectDefinedValue(() => (selectDefinedValue(() => (detail), () => (ctx._health?.redis?.detail))), () => ('redis telemetry emission failed')),
    },
  };
  const redisHealth = ctx._health.redis;
  const payload = {
    component: 'telemetry',
    surface: 'redis_stream',
    reason: 'redis_emit_failed',
    detail: redisHealth.detail,
    module_id: ctx.gateId ? null : (selectDefinedValue(() => (ctx.moduleId), () => (null))),
    gate_id: selectDefinedValue(() => (ctx.gateId), () => (null)),
    gate_type: ctx.gateId ? (selectDefinedValue(() => (ctx.gateType), () => (null))) : undefined,
    attempt: selectDefinedValue(() => (ctx.attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (ctx.dispatchId), () => (null)),
    session_key: selectDefinedValue(() => (ctx.sessionKey), () => (null)),
    impacted_event_type: type ? type : null,
    stream_key: selectDefinedValue(() => (ctx.streamKey), () => (null)),
    degraded_at: degradedAt,
  };
  appendQuarantinedEvent(ctx, 'observability.degraded', payload);
  const sanitizedPayload = sanitizeTelemetryPayload(payload);
  appendPipelineArtifactEvent(ctx, buildEnvelope(ctx, 'observability.degraded', {
    ...sanitizedPayload,
  }, null));
}

async function emitRestoredIfNeeded(ctx: BusterTelemetryContext): Promise<void> {
  const redisHealth = ctx._health.redis;
  if (!redisHealth.degraded || redisHealth.restoring || !ctx.redis) return;
  const degradedAt = selectTruthyValue(() => (redisHealth.degradedAt), () => (null));
  const degradedDetail = redisHealth.detail;
  ctx._health.redis = { ...redisHealth, restoring: true };
  const restoredAt = new Date().toISOString();
  const payload = {
    component: 'telemetry',
    surface: 'redis_stream',
    reason: 'redis_emit_failed',
    detail: 'redis telemetry emission restored',
    module_id: ctx.gateId ? null : (selectDefinedValue(() => (ctx.moduleId), () => (null))),
    gate_id: selectDefinedValue(() => (ctx.gateId), () => (null)),
    gate_type: ctx.gateId ? (selectDefinedValue(() => (ctx.gateType), () => (null))) : undefined,
    attempt: selectDefinedValue(() => (ctx.attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (ctx.dispatchId), () => (null)),
    session_key: selectDefinedValue(() => (ctx.sessionKey), () => (null)),
    stream_key: selectDefinedValue(() => (ctx.streamKey), () => (null)),
    degraded_at: degradedAt,
    restored_at: restoredAt,
    restored_after_ms: degradedAt ? Math.max(0, Date.now() - new Date(degradedAt).getTime()) : null,
  };
  appendQuarantinedEvent(ctx, 'observability.restored', payload);
  try {
    const seq = await ctx.redis.incr(ctx.seqKey);
    const event = buildEnvelope(ctx, 'observability.restored', sanitizeTelemetryPayload(payload), seq);
    appendPipelineArtifactEvent(ctx, event);
    await ctx.redis
      .multi()
      .xadd(ctx.streamKey, 'MAXLEN', '~', String(ctx.streamMaxLen), '*', 'data', JSON.stringify(event))
      .expire(ctx.seqKey, TELEMETRY_SEQ_TTL_SECONDS)
      .exec();
    ctx._health.redis = { degraded: false, degradedAt: null };
  } catch (error) {
    ctx._health.redis = {
      ...(selectDefinedValue(() => (ctx._health.redis), () => ({}))),
      degraded: true,
      degradedAt,
      detail: selectDefinedValue(() => (selectDefinedValue(() => (degradedDetail), () => (ctx._health.redis?.detail))), () => ('redis telemetry emission failed')),
      restoring: false,
    };
    reportBusterTelemetryIncident(ctx, 'restored_backfill_failed', error, 'Buster telemetry restore backfill failed; keeping artifact-only signal', {
      scope: 'observability.restored',
    });
  }
}

export function createTelemetryContext(opts: TelemetryOptions = {}): BusterTelemetryContext {
  const { enabled } = opts;

  const shouldEnable = enabled !== undefined ? enabled : true;
  const identity = resolveTelemetryStreamIdentity(opts);
  // KEEP_TYPED_POLICY: telemetry absence/degradation must not block Buster
  // orchestration. Disabled or weak identity creates a typed no-Redis context
  // that later emits degradation evidence instead of throwing.
  if (!shouldEnable) {
    return createContext(opts, {
      identity,
      redis: null,
      health: {
        redis: {
          disabled: true,
          degraded: false,
          degradedAt: null,
          detail: 'telemetry intentionally disabled',
        },
      },
    });
  }
  if (!identity.ok) {
    return createContext(opts, { identity });
  }

  try {
    const Redis = loadRedisCtor();
    const redis = createRedisClient(Redis, opts as any, {
      retryStrategy: (times: number) => (times > 2 ? null : Math.min(times * 200, 1000)),
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 3000,
      lazyConnect: true,
      enableReadyCheck: false,
    });
    const telemetryRedis = redis as RedisClient;
    telemetryRedis.on('error', (error: unknown) => {
      reportBusterTelemetryIncident(opts, 'redis_client_runtime_error', error, 'Buster telemetry Redis client emitted a non-blocking runtime error');
    });
    return createContext(opts, { identity, redis: telemetryRedis });
  } catch (err) {
    reportBusterTelemetryIncident(opts, 'redis_client_init_failed', err, 'Buster telemetry Redis client initialization failed');
    return createContext(opts, {
      identity,
      redis: null,
      health: {
        redis: {
          degraded: false,
          degradedAt: null,
          detail: errorMessage(err, 'redis client unavailable'),
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
export async function emitEvent(ctx: unknown, type: string, data: AnyRecord = {}): Promise<AnyRecord | void> {
  const telemetryCtx = asTelemetryContext(ctx);
  if (!telemetryCtx || !type) return;
  if (telemetryCtx._health.redis.disabled) return;
  try {
    const { project, run_id: runId, source, emitter, producer, ...payload } = data;
    assertTelemetryEventPayload(type, payload);
  } catch (error) {
    // KEEP_TYPED_POLICY: schema drift records degraded evidence and never
    // emits invalid telemetry stream events.
    reportBusterTelemetryIncident(telemetryCtx, 'telemetry_payload_invalid', error, `Buster telemetry payload invalid for '${type}'`, {
      scope: type,
    });
    recordTelemetryPayloadInvalid(telemetryCtx, type, error);
    return { event: null, validationError: errorMessage(error) };
  }
  if (!telemetryCtx.redis) {
    markTelemetryDegradedOnce(telemetryCtx, type, selectDefinedValue(() => (telemetryCtx?._health?.redis?.detail), () => ('redis client unavailable')));
    return;
  }
  try {
    const seq = await telemetryCtx.redis.incr(telemetryCtx.seqKey);
    const event = buildEnvelope(telemetryCtx, type, sanitizeTelemetryPayload(data), seq);
    appendPipelineArtifactEvent(telemetryCtx, event);
    await telemetryCtx.redis
      .multi()
      .xadd(telemetryCtx.streamKey, 'MAXLEN', '~', String(telemetryCtx.streamMaxLen), '*', 'data', JSON.stringify(event))
      .expire(telemetryCtx.seqKey, TELEMETRY_SEQ_TTL_SECONDS)
      .exec();
    await emitRestoredIfNeeded(telemetryCtx);
  } catch (err) {
    markTelemetryDegradedOnce(telemetryCtx, type, errorMessage(err, 'redis telemetry emission failed'));
    // KEEP_TYPED_POLICY: Redis telemetry is fire-and-forget and must never
    // block orchestration; degraded/restored evidence captures transport loss.
  }
}

export function emitPluginEvent(ctx: unknown, pluginEvent: string, data: AnyRecord = {}): Promise<AnyRecord | void> {
  return emitEvent(ctx, 'plugin.event', buildPluginTelemetryPayload('buster', pluginEvent, data));
}

export async function closeTelemetry(ctx: unknown): Promise<void> {
  const telemetryCtx = asTelemetryContext(ctx);
  if (!telemetryCtx || !telemetryCtx.redis) return;
  try {
    await telemetryCtx.redis.quit();
  } catch (error) {
    // KEEP_TYPED_POLICY: telemetry shutdown failures are diagnostic-only and
    // must not alter task terminal results.
    reportBusterTelemetryIncident(telemetryCtx, 'redis_close_failed', error, 'Buster telemetry Redis client close failed');
  }
}
