import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { sanitizeTelemetryPayload } from '../redaction.ts';
import {
  TELEMETRY_SEQ_TTL_SECONDS,
  requireTelemetryStreamMaxLen,
  getTelemetrySeqKey,
  getTelemetryStreamKey,
  createRedisClient,
  loadRedisCtor,
} from '../telemetry.ts';

let _redis = null;

function reportTelemetryStreamIncident(classification, error, message) {
  reportClassifiedNonBlockingError({
    reporter: 'telemetry-stream',
    classification,
    incidentKey: buildNonBlockingIncidentKey('telemetry-stream', classification),
    message,
    error,
    level: 'DEBUG',
  });
}

function getRedisClient() {
  if (_redis) return _redis;
  try {
    const Redis = loadRedisCtor();
    _redis = createRedisClient(Redis, {}, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableReadyCheck: false,
    });
    _redis.on('error', (error) => {
      reportTelemetryStreamIncident('redis_client_runtime_error', error, 'redis telemetry client emitted a non-blocking runtime error');
    });
    return _redis;
  } catch (error) {
    reportTelemetryStreamIncident('redis_client_init_failed', error, 'redis telemetry client initialization failed');
    return null;
  }
}

function normalizeTelemetryIdentityPart(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function resolveTelemetryStreamIdentity(config = {}, opts = {}) {
  const runId = normalizeTelemetryIdentityPart(opts.runId);
  const project = normalizeTelemetryIdentityPart(config?.project);
  if (!project || !runId) {
    return {
      ok: false,
      project,
      runId,
      streamKey: null,
      seqKey: null,
      error: new Error('telemetry stream emission requires non-empty project and run_id'),
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

export function isTelemetryEnabled(config) {
  return config?.telemetry?.enabled === true;
}

export function getTelemetryStreamKeyForRun(config, runId = '') {
  const identity = resolveTelemetryStreamIdentity(config, { runId });
  return identity.ok ? identity.streamKey : null;
}

async function allocateSeq(redis, seqKey) {
  const seq = await redis.incr(seqKey);
  await redis.expire(seqKey, TELEMETRY_SEQ_TTL_SECONDS);
  return seq;
}

export function buildTelemetryStreamEvent(eventType, payload = {}, identity = {}, seq, opts = {}, emittedAt = new Date().toISOString()) {
  return {
    ...sanitizeTelemetryPayload(payload || {}),
    v: 1,
    type: eventType,
    ts: emittedAt,
    run_id: identity.runId,
    project: identity.project,
    seq,
    source: 'pipeline',
    emitter: opts.emitter || 'nova/pipeline/services/telemetry',
  };
}

export async function emitTelemetryStreamEvent(config, eventType, payload = {}, opts = {}) {
  if (!isTelemetryEnabled(config)) {
    return {
      ok: false,
      skipped: true,
      reason: 'disabled',
      runId: opts.runId || '',
      streamKey: null,
      event: null,
      redis: null,
      error: null,
    };
  }

  const identity = resolveTelemetryStreamIdentity(config, opts);
  const { runId, streamKey } = identity;
  if (!identity.ok) {
    return {
      ok: false,
      skipped: false,
      reason: 'missing_identity',
      runId: runId || '',
      streamKey: null,
      event: null,
      redis: null,
      error: identity.error,
    };
  }

  const redis = getRedisClient();
  if (!redis) {
    return {
      ok: false,
      skipped: false,
      reason: 'redis_unavailable',
      runId,
      streamKey,
      event: null,
      redis: null,
      error: new Error('redis client unavailable'),
    };
  }

  const emittedAt = opts.emittedAt || new Date().toISOString();
  try {
    const seq = await allocateSeq(redis, identity.seqKey);
    const event = buildTelemetryStreamEvent(eventType, payload, identity, seq, opts, emittedAt);
    await redis.xadd(streamKey, 'MAXLEN', '~', String(requireTelemetryStreamMaxLen(config?.telemetry?.stream_max_len)), '*', 'data', JSON.stringify(event));
    return {
      ok: true,
      skipped: false,
      reason: null,
      runId,
      streamKey,
      event,
      redis,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: 'redis_emit_failed',
      runId,
      streamKey,
      event: null,
      redis,
      error,
    };
  }
}

export async function closeTelemetryStreamRedis() {
  if (!_redis) return;
  try {
    await _redis.quit();
  } catch (e) {
    reportTelemetryStreamIncident('redis_client_close_failed', e, 'redis telemetry client close failed');
  } finally {
    _redis = null;
  }
}
