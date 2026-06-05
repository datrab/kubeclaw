// services/redis-log.js — Redis exchange artifact logging
//
// Writes Redis send/receive records under .swarm/logs/redis/ so that
// pipeline Redis traffic can be reconstructed after the fact.
// Non-blocking: all failures degrade safely.

import fs from 'fs';
import path from 'path';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { redisLogArtifactTargets } from '../core/paths.ts';
import { getRunId } from '../core/runtime.ts';
import { sanitizeTelemetryPayload } from '../redaction.ts';

function reportRedisLogIncident(classification, error, context = {}) {
  return reportClassifiedNonBlockingError({
    reporter: 'redis-log',
    classification,
    incidentKey: buildNonBlockingIncidentKey(
      'redis-log',
      classification,
      context.fileName,
      context.filePath,
      context.direction,
      context.type,
    ),
    message: context.message || 'Redis artifact logging failed; continuing without blocking pipeline execution',
    error,
    level: 'WARN',
  });
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function getRedisLogTargets(config, fileName = 'redis-exchanges.jsonl') {
  return redisLogArtifactTargets(config, fileName);
}

export function appendRedisArtifactRecord(config, record, fileName = 'redis-exchanges.jsonl') {
  try {
    if (!isPlainObject(record)) return { ok: false, skipped: true, reason: 'record_not_object' };
    const targets = getRedisLogTargets(config, fileName);
    if (!targets.length) return { ok: false, skipped: true, reason: 'no_targets' };
    const line = `${JSON.stringify(record)}\n`;
    const errors = [];
    for (const filePath of targets) {
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.appendFileSync(filePath, line);
      } catch (error) {
        errors.push({ filePath, error });
        reportRedisLogIncident('redis_artifact_append_failed', error, {
          fileName,
          filePath,
          message: `Redis artifact append failed for ${fileName}`,
        });
      }
    }
    return {
      ok: errors.length === 0,
      targets,
      ...(errors.length > 0 && { errors: errors.map(({ filePath, error }) => ({ filePath, message: error?.message || String(error) })) }),
    };
  } catch (error) {
    reportRedisLogIncident('redis_artifact_record_failed', error, {
      fileName,
      message: `Redis artifact record handling failed for ${fileName}`,
    });
    return { ok: false, errors: [{ message: error?.message || String(error) }] };
  }
}

/**
 * Log a Redis message exchange to .swarm/logs/redis/redis-exchanges.jsonl
 * Non-blocking — silently skips if log dir is unavailable.
 *
 * @param {object} config
 * @param {string} direction  - 'sent' | 'received'
 * @param {string} type       - message type / stream name
 * @param {string} scope      - 'module' | 'gate' | 'pipeline'
 * @param {string} scopeId    - module dir, gate id, etc.
 * @param {any}    payload    - message payload (will be sanitized to bounded size)
 */
export function logRedisExchange(config, direction, type, scope, scopeId, payload) {
  try {
    // Sanitize payload: redact telemetry-sensitive values and cap at 2KB to avoid log bloat from large task payloads
    let sanitizedPayload = null;
    if (payload !== undefined && payload !== null) {
      try {
        const redactedPayload = sanitizeTelemetryPayload(payload);
        const raw = typeof redactedPayload === 'string' ? redactedPayload : JSON.stringify(redactedPayload);
        sanitizedPayload = raw.length > 2048
          ? { _truncated: true, _size: raw.length, _preview: raw.slice(0, 256) }
          : redactedPayload;
      } catch (error) {
        sanitizedPayload = { _serialization_error: true };
        reportRedisLogIncident('redis_exchange_payload_serialization_failed', error, {
          fileName: 'redis-exchanges.jsonl',
          direction,
          type,
          message: 'Redis exchange payload serialization failed; writing bounded error marker',
        });
      }
    }

    const entry = {
      ts: new Date().toISOString(),
      run_id: getRunId(config),
      direction,
      type,
      scope,
      scope_id: scopeId,
      payload: sanitizedPayload,
    };
    return appendRedisArtifactRecord(config, entry, 'redis-exchanges.jsonl');
  } catch (error) {
    reportRedisLogIncident('redis_exchange_log_failed', error, {
      fileName: 'redis-exchanges.jsonl',
      direction,
      type,
      message: 'Redis exchange logging failed; continuing without blocking pipeline execution',
    });
    return { ok: false, errors: [{ message: error?.message || String(error) }] };
  }
}

/**
 * Log Redis operation-level tracing for completion reads, archiving, etc.
 * Written to .swarm/logs/redis/redis-ops.jsonl plus the run-scoped mirror.
 */
export function logRedisOperation(config, event = {}) {
  appendRedisArtifactRecord(config, {
    ts: new Date().toISOString(),
    run_id: getRunId(config),
    ...event,
  }, 'redis-ops.jsonl');
}

/**
 * Log a sent Redis task message.
 */
export function logRedisSent(config, type, scope, scopeId, payload) {
  logRedisExchange(config, 'sent', type, scope, scopeId, payload);
}

/**
 * Log a received Redis completion/response message.
 */
export function logRedisReceived(config, type, scope, scopeId, payload) {
  logRedisExchange(config, 'received', type, scope, scopeId, payload);
}

/**
 * Flush and close the Redis log stream. Call on pipeline shutdown.
 * Non-blocking.
 */
export function closeRedisLog() {
  return { ok: true, closed: false, reason: 'redis_log_uses_sync_jsonl_writes' };
}
