import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const TELEMETRY_STREAM_PREFIX = 'pipeline:telemetry';
export const TELEMETRY_SEQ_PREFIX = `${TELEMETRY_STREAM_PREFIX}:seq`;
export const TELEMETRY_SEQ_TTL_SECONDS = 7 * 24 * 60 * 60;

export function loadRedisCtor() {
  try {
    const mod = require('ioredis');
    return mod?.default || mod;
  } catch (err) {
    const wrapped = new Error('ioredis is required for pipeline telemetry transport');
    wrapped.cause = err;
    throw wrapped;
  }
}

export function getTelemetryStreamKey(project = '', runId = '') {
  return `${TELEMETRY_STREAM_PREFIX}:${project || 'unknown'}:${runId || 'unknown'}`;
}

export function getTelemetrySeqKey(project = '', runId = '') {
  return `${TELEMETRY_SEQ_PREFIX}:${project || 'unknown'}:${runId || 'unknown'}`;
}
