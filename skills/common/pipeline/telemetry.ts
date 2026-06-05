export {
  MISSING_DEPENDENCY_ERROR_CODE,
  MissingDependencyError,
  RedisTransportPolicyError,
  buildRedisClientOptions,
  createRedisClient,
  loadRedisCtor,
  resolveRedisTransportConfig,
} from './redis-transport.ts';

export const TELEMETRY_STREAM_PREFIX = 'pipeline:telemetry';
export const TELEMETRY_SEQ_PREFIX = `${TELEMETRY_STREAM_PREFIX}:seq`;
export const TELEMETRY_SEQ_TTL_SECONDS = 7 * 24 * 60 * 60;
export const TELEMETRY_STREAM_MAXLEN = 10000;

function normalizeTelemetryIdentityPart(value: unknown, field: string) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new TypeError(`telemetry ${field} is required for Redis stream keys`);
  }
  return normalized;
}

function encodeTelemetryIdentityPart(value: string) {
  return encodeURIComponent(value);
}

export function assertTelemetryStreamIdentity(project: unknown, runId: unknown) {
  return {
    project: normalizeTelemetryIdentityPart(project, 'project'),
    runId: normalizeTelemetryIdentityPart(runId, 'run_id'),
  };
}

export function getTelemetryStreamKey(project: unknown, runId: unknown) {
  const identity = assertTelemetryStreamIdentity(project, runId);
  return `${TELEMETRY_STREAM_PREFIX}:${encodeTelemetryIdentityPart(identity.project)}:${encodeTelemetryIdentityPart(identity.runId)}`;
}

export function getTelemetrySeqKey(project: unknown, runId: unknown) {
  const identity = assertTelemetryStreamIdentity(project, runId);
  return `${TELEMETRY_SEQ_PREFIX}:${encodeTelemetryIdentityPart(identity.project)}:${encodeTelemetryIdentityPart(identity.runId)}`;
}
