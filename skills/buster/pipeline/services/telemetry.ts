// ═══════════════════════════════════════════════════════════════
// Telemetry — Buster Event Emission to Redis Stream
// ═══════════════════════════════════════════════════════════════
//
// Fire-and-forget telemetry for the Buster Pipeline and suites.
// Events are published to the canonical run-scoped pipeline stream so
// downstream consumers can reconstruct one ordered timeline per run.

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

import {
  TELEMETRY_SEQ_TTL_SECONDS,
  TELEMETRY_STREAM_MAXLEN,
  getTelemetrySeqKey,
  getTelemetryStreamKey,
  createRedisClient,
  loadRedisCtor,
} from '../telemetry.ts';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { sanitizeTelemetryPayload } from '../redaction.ts';
import {
  assertTelemetryEventPayload,
  buildPluginTelemetryPayload,
} from './telemetry/payload-schema.ts';

declare const process: {
  stderr: { write(text: string): void };
};

type AnyRecord = Record<string, any>;

interface ErrorLike {
  message?: string;
  validationErrors?: unknown[];
}

interface TelemetryOptions extends AnyRecord {
  project?: unknown;
  run_id?: unknown;
  module_id?: string | null;
  emitter?: string | null;
  log_dir?: string | null;
  pipeline_log_path?: string | null;
  pipeline_run_log_path?: string | null;
  attempt?: unknown;
  dispatch_id?: string | null;
  session_key?: string | null;
  gate_id?: string | null;
  gate_type?: string | null;
  enabled?: boolean | undefined;
}

interface TelemetryIdentity {
  ok: boolean;
  project: string | null;
  runId: string | null;
  streamKey: string | null;
  seqKey: string | null;
  error: Error | null;
}

interface RedisMulti {
  xadd(...args: unknown[]): RedisMulti;
  expire(...args: unknown[]): RedisMulti;
  exec(): Promise<unknown>;
}

interface RedisClient {
  incr(key: string | null): Promise<number>;
  multi(): RedisMulti;
  quit(): Promise<unknown>;
  on(event: string, listener: (error: unknown) => void): void;
}

interface TelemetryHealth {
  redis?: AnyRecord;
}

export interface BusterTelemetryContext extends AnyRecord {
  redis: RedisClient | null;
  streamKey: string | null;
  seqKey: string | null;
  project: string;
  runId: string;
  moduleId: string;
  emitter: string;
  logDir: string | null;
  pipelineLogPath: string | null;
  pipelineRunLogPath: string | null;
  attempt: unknown;
  dispatchId: string | null;
  sessionKey: string | null;
  gateId: string | null;
  gateType: string | null;
  _health: TelemetryHealth;
}

function asTelemetryContext(ctx: unknown): BusterTelemetryContext | null {
  return ctx && typeof ctx === 'object' ? ctx as BusterTelemetryContext : null;
}

interface ContextOverrides {
  identity?: TelemetryIdentity;
  redis?: RedisClient | null;
  health?: TelemetryHealth;
}

function errorMessage(error: unknown, fallback = 'unknown'): string {
  return error && typeof error === 'object' && typeof (error as ErrorLike).message === 'string'
    ? (error as ErrorLike).message as string
    : String(error || fallback);
}

function reportBusterTelemetryIncident(ctxOrOpts: TelemetryOptions | BusterTelemetryContext = {}, classification: string, error: unknown, message: string, options: AnyRecord = {}): void {
  reportClassifiedNonBlockingError({
    reporter: 'buster-telemetry',
    classification,
    incidentKey: buildNonBlockingIncidentKey(
      'buster-telemetry',
      ctxOrOpts?.project || 'unknown',
      ctxOrOpts?.runId || ctxOrOpts?.run_id || 'unknown',
      ctxOrOpts?.moduleId || ctxOrOpts?.module_id || 'global',
      classification,
      options.scope || 'global'
    ),
    message,
    error,
    level: options.level || 'DEBUG',
    fallback: (_level: string, line: string) => process.stderr.write(`${line}\n`),
  });
}

function normalizeTelemetryIdentityPart(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function resolveTelemetryStreamIdentity(opts: TelemetryOptions = {}): TelemetryIdentity {
  const project = normalizeTelemetryIdentityPart(opts.project);
  const runId = normalizeTelemetryIdentityPart(opts.run_id);
  if (!project || !runId) {
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

export function resolveTelemetryStreamKey(opts: TelemetryOptions = {}): string | null {
  const identity = resolveTelemetryStreamIdentity(opts);
  return identity.streamKey;
}

function buildEnvelope(ctx: BusterTelemetryContext, type: string, data: AnyRecord = {}, seq: number | null): AnyRecord {
  const payload = data || {};
  const hasModuleId = Object.prototype.hasOwnProperty.call(payload, 'module_id');
  return {
    ...payload,
    v: 1,
    type,
    ts: new Date().toISOString(),
    project: ctx.project,
    run_id: ctx.runId,
    seq,
    source: 'buster',
    emitter: ctx.emitter,
    module_id: hasModuleId ? payload.module_id : (payload?.gate_id ? null : (ctx.moduleId ?? null)),
    attempt: payload.attempt ?? ctx.attempt ?? null,
    dispatch_id: payload.dispatch_id ?? ctx.dispatchId ?? null,
    session_key: payload.session_key ?? ctx.sessionKey ?? null,
  };
}

function buildBusterFallbackCorrelation(ctx: Partial<BusterTelemetryContext> = {}, data: AnyRecord = {}): AnyRecord {
  const gateId = data.gate_id ?? ctx.gateId ?? null;
  return {
    module_id: Object.prototype.hasOwnProperty.call(data || {}, 'module_id')
      ? data.module_id
      : (gateId ? null : (ctx.moduleId || null)),
    gate_id: gateId,
    gate_type: gateId ? (data.gate_type ?? ctx.gateType ?? null) : undefined,
    attempt: data.attempt ?? ctx.attempt ?? null,
    dispatch_id: data.dispatch_id ?? ctx.dispatchId ?? null,
    session_key: data.session_key ?? ctx.sessionKey ?? null,
  };
}

function appendFallbackEvent(ctx: BusterTelemetryContext, type: string, data: AnyRecord = {}): void {
  const targets: string[] = [];
  if (ctx?.logDir) targets.push(path.join(ctx.logDir, 'telemetry-fallback.jsonl'));
  if (ctx?.pipelineLogPath) targets.push(path.join(path.dirname(ctx.pipelineLogPath), 'buster-telemetry-fallback.jsonl'));
  if (ctx?.pipelineRunLogPath) targets.push(path.join(path.dirname(ctx.pipelineRunLogPath), 'buster-telemetry-fallback.jsonl'));
  const uniqueTargets = [...new Set(targets)];
  if (!uniqueTargets.length) return;
  try {
    const record = {
      v: 1,
      type,
      ts: new Date().toISOString(),
      project: ctx.project,
      run_id: ctx.runId,
      source: 'buster',
      emitter: ctx.emitter,
      artifact_fallback: true,
      ...buildBusterFallbackCorrelation(ctx, data),
      ...sanitizeTelemetryPayload(data || {}),
    };
    for (const target of uniqueTargets) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, JSON.stringify(record) + '\n');
    }
  } catch (error) {
    reportBusterTelemetryIncident(ctx, 'fallback_artifact_write_failed', error, 'Buster telemetry fallback artifact write failed', {
      scope: type || 'unknown',
    });
  }
}

function appendPipelineArtifactEvent(ctx: BusterTelemetryContext, event: AnyRecord | null): void {
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

function createContext(opts: TelemetryOptions = {}, overrides: ContextOverrides = {}): BusterTelemetryContext {
  const identity = overrides.identity || resolveTelemetryStreamIdentity(opts);
  return {
    redis: identity.ok ? (overrides.redis ?? null) : null,
    streamKey: identity.streamKey,
    seqKey: identity.seqKey,
    project: identity.project || '',
    runId: identity.runId || '',
    moduleId: opts.module_id || '',
    emitter: opts.emitter || 'buster/pipeline/services/telemetry',
    logDir: opts.log_dir || null,
    pipelineLogPath: opts.pipeline_log_path || null,
    pipelineRunLogPath: opts.pipeline_run_log_path || null,
    attempt: opts.attempt ?? null,
    dispatchId: opts.dispatch_id ?? null,
    sessionKey: opts.session_key ?? null,
    gateId: opts.gate_id ?? null,
    gateType: opts.gate_type ?? null,
    _health: overrides.health || {
      redis: identity.ok
        ? { degraded: false, degradedAt: null }
        : {
            degraded: false,
            degradedAt: null,
            unavailable: true,
            reason: 'missing_identity',
            detail: identity.error?.message || 'Buster telemetry stream identity missing',
          },
    },
  };
}

function recordTelemetryPayloadInvalid(ctx: BusterTelemetryContext, type: string, error: unknown): void {
  const errorLike = error && typeof error === 'object' ? error as ErrorLike : null;
  const payload = {
    component: 'telemetry_spine',
    surface: 'core_emit',
    reason: 'telemetry_payload_invalid',
    detail: errorLike?.message || 'telemetry payload validation failed',
    module_id: ctx?.gateId ? null : (ctx?.moduleId || null),
    gate_id: ctx?.gateId || null,
    gate_type: ctx?.gateId ? (ctx?.gateType ?? null) : undefined,
    attempt: ctx?.attempt ?? null,
    dispatch_id: ctx?.dispatchId ?? null,
    session_key: ctx?.sessionKey ?? null,
    impacted_event_type: type || null,
    validation_errors: Array.isArray(errorLike?.validationErrors) ? errorLike.validationErrors : [],
    degraded_at: new Date().toISOString(),
  };
  appendFallbackEvent(ctx, 'observability.degraded', payload);
  const sanitizedPayload = sanitizeTelemetryPayload(payload || {});
  appendPipelineArtifactEvent(ctx, buildEnvelope(ctx, 'observability.degraded', {
    ...sanitizedPayload,
    artifact_fallback: true,
  }, null));
}

function markTelemetryDegradedOnce(ctx: BusterTelemetryContext | null, type: string, detail: unknown): void {
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
  const redisHealth = ctx._health.redis || {};
  const payload = {
    component: 'telemetry',
    surface: 'redis_stream',
    reason: 'redis_emit_failed',
    detail: redisHealth.detail,
    module_id: ctx.gateId ? null : (ctx.moduleId || null),
    gate_id: ctx.gateId || null,
    gate_type: ctx.gateId ? (ctx.gateType ?? null) : undefined,
    attempt: ctx.attempt ?? null,
    dispatch_id: ctx.dispatchId ?? null,
    session_key: ctx.sessionKey ?? null,
    impacted_event_type: type || null,
    stream_key: ctx.streamKey || null,
    degraded_at: degradedAt,
  };
  appendFallbackEvent(ctx, 'observability.degraded', payload);
  const sanitizedPayload = sanitizeTelemetryPayload(payload || {});
  appendPipelineArtifactEvent(ctx, buildEnvelope(ctx, 'observability.degraded', {
    ...sanitizedPayload,
    artifact_fallback: true,
  }, null));
}

async function emitRestoredIfNeeded(ctx: BusterTelemetryContext): Promise<void> {
  const redisHealth = ctx?._health?.redis;
  if (!redisHealth?.degraded || redisHealth.restoring || !ctx?.redis) return;
  const degradedAt = redisHealth.degradedAt || null;
  const degradedDetail = redisHealth.detail;
  ctx._health.redis = { ...redisHealth, restoring: true };
  const restoredAt = new Date().toISOString();
  const payload = {
    component: 'telemetry',
    surface: 'redis_stream',
    reason: 'redis_emit_failed',
    detail: 'redis telemetry emission restored',
    module_id: ctx.gateId ? null : (ctx.moduleId || null),
    gate_id: ctx.gateId || null,
    gate_type: ctx.gateId ? (ctx.gateType ?? null) : undefined,
    attempt: ctx.attempt ?? null,
    dispatch_id: ctx.dispatchId ?? null,
    session_key: ctx.sessionKey ?? null,
    stream_key: ctx.streamKey || null,
    degraded_at: degradedAt,
    restored_at: restoredAt,
    restored_after_ms: degradedAt ? Math.max(0, Date.now() - new Date(degradedAt).getTime()) : null,
  };
  appendFallbackEvent(ctx, 'observability.restored', payload);
  try {
    const seq = await ctx.redis.incr(ctx.seqKey);
    const event = buildEnvelope(ctx, 'observability.restored', sanitizeTelemetryPayload(payload), seq);
    appendPipelineArtifactEvent(ctx, event);
    await ctx.redis
      .multi()
      .xadd(ctx.streamKey, 'MAXLEN', '~', String(TELEMETRY_STREAM_MAXLEN), '*', 'data', JSON.stringify(event))
      .expire(ctx.seqKey, TELEMETRY_SEQ_TTL_SECONDS)
      .exec();
    ctx._health.redis = { degraded: false, degradedAt: null };
  } catch (error) {
    ctx._health.redis = {
      ...(ctx._health.redis || {}),
      degraded: true,
      degradedAt,
      detail: degradedDetail || ctx._health.redis?.detail || 'redis telemetry emission failed',
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
  if (telemetryCtx?._health?.redis?.disabled) return;
  try {
    assertTelemetryEventPayload(type, data || {});
  } catch (error) {
    // KEEP_TYPED_POLICY: schema drift records degraded evidence and never
    // emits invalid telemetry stream events.
    reportBusterTelemetryIncident(telemetryCtx, 'telemetry_payload_invalid', error, `Buster telemetry payload invalid for '${type}'`, {
      scope: type || 'unknown',
    });
    recordTelemetryPayloadInvalid(telemetryCtx, type, error);
    return { event: null, validationError: errorMessage(error) };
  }
  if (!telemetryCtx.redis) {
    markTelemetryDegradedOnce(telemetryCtx, type, telemetryCtx?._health?.redis?.detail || 'redis client unavailable');
    return;
  }
  try {
    const seq = await telemetryCtx.redis.incr(telemetryCtx.seqKey);
    const event = buildEnvelope(telemetryCtx, type, sanitizeTelemetryPayload(data || {}), seq);
    appendPipelineArtifactEvent(telemetryCtx, event);
    await telemetryCtx.redis
      .multi()
      .xadd(telemetryCtx.streamKey, 'MAXLEN', '~', String(TELEMETRY_STREAM_MAXLEN), '*', 'data', JSON.stringify(event))
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
