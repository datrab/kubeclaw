import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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
  requireTelemetryStreamMaxLen,
  requireTelemetryStreamMaxLenFromConfig,
  getTelemetrySeqKey,
  getTelemetryStreamKey,
  createRedisClient,
  loadRedisCtor,
} from '../telemetry.ts';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { sanitizeTelemetryPayload } from '../egress.ts';
import { buildCanonicalEnvelope, redactProhibitedSecrets, sha256 } from '../observability-contract.ts';
import { loadBusterPlatformConfig } from './runtime-policy.ts';
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
  streamMaxLen?: number | undefined;
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
  streamMaxLen: number;
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

const INCIDENT_KEY_MISSING_AUTHORITY = 'not_emitted';
const INCIDENT_KEY_NO_MODULE = 'not_applicable';

function errorMessage(error: unknown, fallback = 'missing_error_detail'): string {
  if (error && typeof error === 'object' && typeof (error as ErrorLike).message === 'string') {
    return (error as ErrorLike).message as string;
  }
  if (error !== undefined && error !== null && error !== '') return String(error);
  return fallback;
}

function resolveTelemetryStreamMaxLen(opts: TelemetryOptions = {}): number {
  if (opts.streamMaxLen !== undefined) {
    return requireTelemetryStreamMaxLen(opts.streamMaxLen, 'telemetry.streamMaxLen');
  }
  return requireTelemetryStreamMaxLenFromConfig(loadBusterPlatformConfig());
}

function isBusterTelemetryContext(value: unknown): value is BusterTelemetryContext {
  return Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'runId'));
}

function incidentProject(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : INCIDENT_KEY_MISSING_AUTHORITY;
}

function incidentRunId(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : INCIDENT_KEY_MISSING_AUTHORITY;
}

function incidentModuleId(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : INCIDENT_KEY_NO_MODULE;
}

function incidentIdentity(ctxOrOpts: TelemetryOptions | BusterTelemetryContext = {}): { project: string; runId: string; moduleId: string } {
  if (isBusterTelemetryContext(ctxOrOpts)) {
    return {
      project: incidentProject(ctxOrOpts.project),
      runId: incidentRunId(ctxOrOpts.runId),
      moduleId: incidentModuleId(ctxOrOpts.moduleId),
    };
  }
  return {
    project: ctxOrOpts.project ? String(ctxOrOpts.project) : INCIDENT_KEY_MISSING_AUTHORITY,
    runId: ctxOrOpts.run_id ? String(ctxOrOpts.run_id) : INCIDENT_KEY_MISSING_AUTHORITY,
    moduleId: ctxOrOpts.module_id ? String(ctxOrOpts.module_id) : INCIDENT_KEY_NO_MODULE,
  };
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

function reportBusterTelemetryIncident(ctxOrOpts: TelemetryOptions | BusterTelemetryContext = {}, classification: string, error: unknown, message: string, options: AnyRecord = {}): void {
  const identity = incidentIdentity(ctxOrOpts);
  reportClassifiedNonBlockingError({
    reporter: 'buster-telemetry',
    classification,
    incidentKey: buildNonBlockingIncidentKey(
      'buster-telemetry',
      identity.project,
      identity.runId,
      identity.moduleId,
      classification,
      typeof options.scope === 'string' && options.scope.trim() ? options.scope : 'missing_scope'
    ),
    message,
    error,
    level: typeof options.level === 'string' && options.level.trim() ? options.level : 'DEBUG',
    fallback: (_level: string, line: string) => process.stderr.write(`${line}\n`),
  });
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

export function resolveTelemetryStreamKey(opts: TelemetryOptions = {}): string | null {
  const identity = resolveTelemetryStreamIdentity(opts);
  return identity.streamKey;
}

function buildEnvelope(ctx: BusterTelemetryContext, type: string, data: AnyRecord = {}, seq: number | null): AnyRecord {
  const payload = data;
  const hasModuleId = Object.prototype.hasOwnProperty.call(payload, 'module_id');
  const normalizedPayload = {
    ...payload,
    module_id: hasModuleId ? payload.module_id : (payload?.gate_id ? null : (selectDefinedValue(() => (ctx.moduleId), () => (null)))),
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (payload.attempt), () => (ctx.attempt))), () => (null)),
    dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (payload.dispatch_id), () => (ctx.dispatchId))), () => (null)),
    session_key: selectDefinedValue(() => (selectDefinedValue(() => (payload.session_key), () => (ctx.sessionKey))), () => (null)),
  };
  delete normalizedPayload.project;
  delete normalizedPayload.run_id;
  delete normalizedPayload.source;
  delete normalizedPayload.emitter;
  if (seq == null) return { schema_version:'quarantined_payload.v1', quarantined_at:new Date().toISOString(), reason_code:'TRANSPORT_UNAVAILABLE', intended_type_sha256:sha256(type), project:ctx.project, run_id:ctx.runId, producer:ctx.emitter, original_sha256:sha256(JSON.stringify(normalizedPayload)), payload:redactProhibitedSecrets(normalizedPayload) };
  const gateId = normalizedPayload.gate_id || ctx.gateId || null;
  const workId = gateId || normalizedPayload.module_id || ctx.runId;
  return buildCanonicalEnvelope({ type, payload:normalizedPayload, seq, identity:{project:ctx.project,run_id:ctx.runId,work_id:workId,work_type:gateId?'gate':normalizedPayload.module_id?'module':'pipeline',gate_id:gateId,attempt:normalizedPayload.attempt,dispatch_id:normalizedPayload.dispatch_id,session_id:normalizedPayload.session_key,agent_id:null,model_call_id:normalizedPayload.model_call_id,tool_call_id:normalizedPayload.tool_call_id,source:'buster',producer:ctx.emitter} });
}

function buildBusterQuarantineCorrelation(ctx: Partial<BusterTelemetryContext> = {}, data: AnyRecord = {}): AnyRecord {
  const gateId = selectDefinedValue(() => (selectDefinedValue(() => (data.gate_id), () => (ctx.gateId))), () => (null));
  return {
    module_id: Object.prototype.hasOwnProperty.call(data, 'module_id')
      ? data.module_id
      : (gateId ? null : (selectDefinedValue(() => (ctx.moduleId), () => (null)))),
    gate_id: gateId,
    gate_type: gateId ? (selectDefinedValue(() => (selectDefinedValue(() => (data.gate_type), () => (ctx.gateType))), () => (null))) : undefined,
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (data.attempt), () => (ctx.attempt))), () => (null)),
    dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (data.dispatch_id), () => (ctx.dispatchId))), () => (null)),
    session_key: selectDefinedValue(() => (selectDefinedValue(() => (data.session_key), () => (ctx.sessionKey))), () => (null)),
  };
}

function appendQuarantinedEvent(ctx: BusterTelemetryContext, type: string, data: AnyRecord = {}): void {
  const targets: string[] = [];
  if (ctx?.logDir) targets.push(path.join(ctx.logDir, 'quarantine.jsonl'));
  if (ctx?.pipelineLogPath) targets.push(path.join(path.dirname(ctx.pipelineLogPath), 'quarantine.jsonl'));
  if (ctx?.pipelineRunLogPath) targets.push(path.join(path.dirname(ctx.pipelineRunLogPath), 'quarantine.jsonl'));
  const uniqueTargets = [...new Set(targets)];
  if (!uniqueTargets.length) return;
  try {
    const payload={...buildBusterQuarantineCorrelation(ctx,data),...sanitizeTelemetryPayload(data)};
    const serialized=JSON.stringify(payload);
    const record = { schema_version:'quarantined_payload.v1', quarantined_at:new Date().toISOString(), reason_code:'REDIS_TELEMETRY_UNAVAILABLE', intended_type_sha256:sha256(type), project:ctx.project, run_id:ctx.runId, producer:ctx.emitter, original_byte_length:new TextEncoder().encode(serialized).byteLength, original_sha256:sha256(serialized), payload:redactProhibitedSecrets(payload) };
    for (const target of uniqueTargets) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, JSON.stringify(record) + '\n');
    }
  } catch (error) {
    reportBusterTelemetryIncident(ctx, 'quarantine_write_failed', error, 'Buster telemetry quarantine write failed', {
      scope: type,
    });
  }
}

function appendPipelineArtifactEvent(ctx: BusterTelemetryContext, event: AnyRecord | null): void {
  const targets = [ctx?.pipelineLogPath, ctx?.pipelineRunLogPath].filter(Boolean);
  if (selectTruthyValue(() => (!targets.length), () => (!event))) return;
  try {
    for (const target of targets) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, JSON.stringify(event) + '\n');
    }
  } catch (error) {
    reportBusterTelemetryIncident(ctx, 'pipeline_artifact_write_failed', error, 'Buster telemetry pipeline artifact mirror write failed', {
      scope: selectTruthyValue(() => (event?.type), () => ('missing_event_type')),
    });
  }
}

function createContext(opts: TelemetryOptions = {}, overrides: ContextOverrides = {}): BusterTelemetryContext {
  const identity = telemetryIdentityAuthority(opts, overrides);
  return {
    redis: identity.ok ? (selectDefinedValue(() => (overrides.redis), () => (null))) : null,
    streamKey: identity.streamKey,
    seqKey: identity.seqKey,
    project: selectDefinedValue(() => (identity.project), () => ('')),
    runId: selectDefinedValue(() => (identity.runId), () => ('')),
    moduleId: typeof opts.module_id === 'string' ? opts.module_id : '',
    emitter: typeof opts.emitter === 'string' && opts.emitter.trim() ? opts.emitter : 'buster/pipeline/services/telemetry',
    logDir: selectTruthyValue(() => (opts.log_dir), () => (null)),
    pipelineLogPath: selectTruthyValue(() => (opts.pipeline_log_path), () => (null)),
    pipelineRunLogPath: selectTruthyValue(() => (opts.pipeline_run_log_path), () => (null)),
    attempt: selectDefinedValue(() => (opts.attempt), () => (null)),
    dispatchId: selectDefinedValue(() => (opts.dispatch_id), () => (null)),
    sessionKey: selectDefinedValue(() => (opts.session_key), () => (null)),
    gateId: selectDefinedValue(() => (opts.gate_id), () => (null)),
    gateType: selectDefinedValue(() => (opts.gate_type), () => (null)),
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
  if (selectTruthyValue(() => (!ctx), () => (ctx._health?.redis?.degraded))) return;
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
  const redisHealth = ctx?._health?.redis;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!redisHealth?.degraded), () => (redisHealth.restoring))), () => (!ctx?.redis))) return;
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
  if (selectTruthyValue(() => (!telemetryCtx), () => (!type))) return;
  if (telemetryCtx?._health?.redis?.disabled) return;
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
  if (selectTruthyValue(() => (!telemetryCtx), () => (!telemetryCtx.redis))) return;
  try {
    await telemetryCtx.redis.quit();
  } catch (error) {
    // KEEP_TYPED_POLICY: telemetry shutdown failures are diagnostic-only and
    // must not alter task terminal results.
    reportBusterTelemetryIncident(telemetryCtx, 'redis_close_failed', error, 'Buster telemetry Redis client close failed');
  }
}
