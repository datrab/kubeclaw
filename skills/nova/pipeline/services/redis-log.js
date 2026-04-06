// services/redis-log.js — Redis exchange artifact logging
//
// Writes Redis send/receive records under .swarm/logs/redis/ so that
// pipeline Redis traffic can be reconstructed after the fact.
// Non-blocking: all failures degrade safely.

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { redisLogDir } from '../core/paths.js';
import { getRunId } from '../core/runtime.js';

function getLogTargets(config) {
  if (!config?._runLogDir && !config?._logDir) return [];
  const targets = [];
  if (config?._logDir) targets.push(path.join(redisLogDir(config), 'redis.jsonl'));
  if (config?._runLogDir) targets.push(path.join(config._runLogDir, 'redis.jsonl'));
  return targets;
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
    const targets = getLogTargets(config);
    if (!targets.length) return;

    // Sanitize payload: cap at 2KB to avoid log bloat from large task payloads
    let sanitizedPayload = null;
    if (payload !== undefined && payload !== null) {
      try {
        const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
        sanitizedPayload = raw.length > 2048
          ? { _truncated: true, _size: raw.length, _preview: raw.slice(0, 256) }
          : payload;
      } catch {
        sanitizedPayload = { _serialization_error: true };
      }
    }

    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      run_id: getRunId(config),
      direction,
      type,
      scope,
      scope_id: scopeId,
      payload: sanitizedPayload,
    }) + '\n';
    for (const filePath of targets) {
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.appendFileSync(filePath, entry);
      } catch { /* non-blocking */ }
    }
  } catch {
    // Fully non-blocking — never propagate
  }
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
  try {
    if (_logStream) {
      _logStream.end();
      _logStream = null;
      _logStreamPath = null;
    }
  } catch { /* non-critical */ }
}
