import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { sanitizeTelemetryPayload } from '../egress.ts';
import {
  TELEMETRY_SEQ_TTL_SECONDS,
  requireTelemetryStreamMaxLenFromConfig,
  getTelemetrySeqKey,
  getTelemetryStreamKey,
  createRedisClient,
  loadRedisCtor,
} from '../telemetry.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
let _redis = null;
let _redisTransportKey = '';
const TELEMETRY_EMITTER = 'nova/pipeline/services/telemetry';
const TELEMETRY_RUN_ID_MISSING = '';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function textValue(value) {
  return typeof value === 'string' ? value : '';
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

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

function telemetryTransportKey(config = {}) {
  const telemetry = objectRecord(config?.telemetry);
  return JSON.stringify({
    redisHost: selectDefinedValue(() => (selectDefinedValue(() => (telemetry.redisHost), () => (telemetry.host))), () => (null)),
    redisPort: selectDefinedValue(() => (selectDefinedValue(() => (telemetry.redisPort), () => (telemetry.port))), () => (null)),
    redisUsername: selectDefinedValue(() => (selectDefinedValue(() => (telemetry.redisUsername), () => (telemetry.username))), () => (null)),
    redisPassword: telemetry.redisPassword ? '[set]' : null,
    redisTls: selectDefinedValue(() => (selectDefinedValue(() => (telemetry.redisTls), () => (telemetry.tls))), () => (null)),
    redisNetworkIsolation: selectDefinedValue(() => (selectDefinedValue(() => (telemetry.redisNetworkIsolation), () => (telemetry.networkIsolation))), () => (null)),
  });
}

function getRedisClient(config = {}) {
  const transportKey = telemetryTransportKey(config);
  if (_redis && _redisTransportKey === transportKey) return _redis;
  if (_redis && _redisTransportKey !== transportKey) {
    try {
      _redis.disconnect?.();
    } catch (_error) {
      // Best-effort cache rotation; subsequent client creation still reports its own failures.
    }
    _redis = null;
    _redisTransportKey = '';
  }
  try {
    const Redis = loadRedisCtor();
    _redis = createRedisClient(Redis, objectRecord(config?.telemetry), {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableReadyCheck: false,
    });
    _redis.on('error', (error) => {
      reportTelemetryStreamIncident('redis_client_runtime_error', error, 'redis telemetry client emitted a non-blocking runtime error');
    });
    _redisTransportKey = transportKey;
    return _redis;
  } catch (error) {
    reportTelemetryStreamIncident('redis_client_init_failed', error, 'redis telemetry client initialization failed');
    return null;
  }
}

function normalizeTelemetryIdentityPart(value) {
  const normalized = textValue(value).trim();
  return selectTruthyValue(() => (normalized), () => (null));
}

function resolveTelemetryStreamIdentity(config = {}, opts = {}) {
  const runId = normalizeTelemetryIdentityPart(opts.runId);
  const project = normalizeTelemetryIdentityPart(config?.project);
  if (selectTruthyValue(() => (!project), () => (!runId))) {
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
    ...sanitizeTelemetryPayload(objectRecord(payload)),
    v: 1,
    type: eventType,
    ts: emittedAt,
    run_id: identity.runId,
    project: identity.project,
    seq,
    source: 'pipeline',
    emitter: selectPresentValue(opts.emitter, TELEMETRY_EMITTER),
  };
}

export async function emitTelemetryStreamEvent(config, eventType, payload = {}, opts = {}) {
  if (!isTelemetryEnabled(config)) {
    return {
      ok: false,
      skipped: true,
      reason: 'disabled',
      runId: selectPresentValue(opts.runId, TELEMETRY_RUN_ID_MISSING),
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
      runId: selectPresentValue(runId, TELEMETRY_RUN_ID_MISSING),
      streamKey: null,
      event: null,
      redis: null,
      error: identity.error,
    };
  }

  const redis = getRedisClient(config);
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

  const emittedAt = telemetryEmittedAtAuthority(opts);
  try {
    const seq = await allocateSeq(redis, identity.seqKey);
    const event = buildTelemetryStreamEvent(eventType, payload, identity, seq, opts, emittedAt);
    await redis.xadd(streamKey, 'MAXLEN', '~', String(requireTelemetryStreamMaxLenFromConfig(config)), '*', 'data', JSON.stringify(event));
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

function telemetryEmittedAtAuthority(opts) {
  if (opts.emittedAt) return opts.emittedAt;
  return new Date().toISOString();
}

export async function closeTelemetryStreamRedis() {
  if (!_redis) return;
  try {
    await _redis.quit();
  } catch (e) {
    reportTelemetryStreamIncident('redis_client_close_failed', e, 'redis telemetry client close failed');
  } finally {
    _redis = null;
    _redisTransportKey = '';
  }
}
