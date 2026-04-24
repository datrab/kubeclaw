import { log } from '../core/logger.js';
import { getRunId } from '../core/runtime.js';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../../../common/pipeline/noncritical-reporting.js';
import { sanitizeTelemetryPayload } from '../../../common/pipeline/redaction.js';
import {
  TELEMETRY_SEQ_TTL_SECONDS,
  getTelemetrySeqKey,
  getTelemetryStreamKey,
  loadRedisCtor,
} from '../../../common/pipeline/telemetry.js';

const STREAM_MAXLEN = '10000';
let _redis = null;
const _localSeqFallback = new Map();

function reportTelemetryStreamIncident(classification, error, message) {
  reportClassifiedNonBlockingError({
    log,
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
    _redis = new Redis({
      host: process.env.REDIS_HOST || 'redis-master.kubeclaw.svc.cluster.local',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
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

function getSeqKey(config, runId) {
  return getTelemetrySeqKey(config?.project || '', runId || '');
}

export function isTelemetryEnabled(config) {
  return !!(config?.telemetry?.stream_key || config?.telemetry?.enabled);
}

export function getTelemetryStreamKeyForRun(config, runId = getRunId(config)) {
  return getTelemetryStreamKey(config?.project || '', runId || '');
}

async function allocateSeq(config, redis, runId) {
  if (redis && runId && config?.project) {
    const seqKey = getSeqKey(config, runId);
    const seq = await redis.incr(seqKey);
    await redis.expire(seqKey, TELEMETRY_SEQ_TTL_SECONDS);
    return seq;
  }

  const fallbackKey = `${config?.project || 'unknown'}:${runId || 'unknown'}`;
  const next = (_localSeqFallback.get(fallbackKey) || 0) + 1;
  _localSeqFallback.set(fallbackKey, next);
  return next;
}

export async function emitTelemetryStreamEvent(config, eventType, payload = {}, opts = {}) {
  if (!isTelemetryEnabled(config)) {
    return {
      ok: false,
      skipped: true,
      reason: 'disabled',
      runId: opts.runId || getRunId(config) || config?.run_id || '',
      streamKey: null,
      event: null,
      redis: null,
      error: null,
    };
  }

  const runId = opts.runId || getRunId(config) || config?.run_id || '';
  const streamKey = getTelemetryStreamKeyForRun(config, runId);
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
    const seq = await allocateSeq(config, redis, runId);
    const event = {
      v: 1,
      type: eventType,
      ts: emittedAt,
      run_id: runId,
      project: config?.project || '',
      seq,
      source: 'pipeline',
      emitter: opts.emitter || 'nova/pipeline/services/telemetry',
      ...sanitizeTelemetryPayload(payload || {}),
    };
    await redis.xadd(streamKey, 'MAXLEN', '~', STREAM_MAXLEN, '*', 'data', JSON.stringify(event));
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
    log('DEBUG', '[telemetry] Redis connection closed');
  } catch (e) {
    log('DEBUG', `[telemetry] Redis close failed (non-critical): ${e.message}`);
  } finally {
    _redis = null;
  }
}
