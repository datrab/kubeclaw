import { agentObservabilityIngesterConfig } from './agent-observability-config.ts';
import { createRedisClient, loadRedisCtor, resolveRedisTransportConfig } from '../telemetry.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

function isPlainObject(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function positiveInteger(value: unknown, label: string): number {
  const numeric = Number(value);
  if (selectTruthyValue(() => (!Number.isInteger(numeric)), () => (numeric <= 0))) {
    throw new Error(`${label}: required positive integer in swarm.config.json`);
  }
  return numeric;
}

function redisSurfaces(config: AnyRecord = {}): Array<{ name: string; opts: AnyRecord; timeoutMs: number }> {
  const surfaces: Array<{ name: string; opts: AnyRecord; timeoutMs: number }> = [];
  if (isPlainObject(config.telemetry) && config.telemetry.enabled !== false) {
    surfaces.push({
      name: 'telemetry',
      opts: config.telemetry,
      timeoutMs: positiveInteger(config.telemetry.sink_timeout_ms, 'config.telemetry.sink_timeout_ms'),
    });
  }

  const ingester = agentObservabilityIngesterConfig(config);
  if (ingester.enabled === true) {
    surfaces.push({
      name: 'agent_observability_ingester',
      opts: {
        redisHost: ingester.redisHost,
        redisPort: ingester.redisPort,
        redisUsername: ingester.redisUsername,
        redisPassword: ingester.redisPassword,
        redisTls: ingester.redisTls,
        redisNetworkIsolation: ingester.redisNetworkIsolation,
      },
      timeoutMs: positiveInteger(ingester.redisCommandTimeoutMs, 'config.agent_observability.ingester.redis_command_timeout_ms'),
    });
  }
  return surfaces;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} Redis preflight timed out after ${timeoutMs}ms`) as Error & { code?: string };
      error.code = 'REDIS_CONNECTION_UNAVAILABLE';
      reject(error);
    }, timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function redisPreflightError(error: unknown, lastRedisError: unknown, surfaceName: string) {
  const root = lastRedisError instanceof Error ? lastRedisError : null;
  if (!root) return error;
  const wrapped = new Error(`${surfaceName} Redis preflight failed: ${root.message}`) as Error & AnyRecord;
  wrapped.name = root.name;
  wrapped.code = (root as AnyRecord).code || (error as AnyRecord)?.code || 'REDIS_CONNECTION_UNAVAILABLE';
  wrapped.cause = root;
  return wrapped;
}

async function preflightSurface(
  surface: { name: string; opts: AnyRecord; timeoutMs: number },
  env: Record<string, string | undefined> = process.env,
) {
  resolveRedisTransportConfig(surface.opts, env);
  const RedisCtor = loadRedisCtor();
  const redis = createRedisClient(RedisCtor, surface.opts, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
    retryStrategy: null,
    connectTimeout: surface.timeoutMs,
  }, env);
  let lastRedisError: unknown = null;
  const onRedisError = (error: unknown) => {
    lastRedisError = error;
  };
  redis.on?.('error', onRedisError);
  try {
    if (typeof redis.connect === 'function' && redis.status !== 'ready') {
      await withTimeout(Promise.resolve(redis.connect()), surface.timeoutMs, surface.name);
    }
    if (typeof redis.ping === 'function') {
      await withTimeout(Promise.resolve(redis.ping()), surface.timeoutMs, surface.name);
    }
  } catch (error) {
    throw redisPreflightError(error, lastRedisError, surface.name);
  } finally {
    redis.off?.('error', onRedisError);
    redis.removeListener?.('error', onRedisError);
    redis.disconnect?.();
  }
}

export async function preflightRuntimeRedis(config: AnyRecord = {}, env: Record<string, string | undefined> = process.env) {
  for (const surface of redisSurfaces(config)) {
    try {
      await preflightSurface(surface, env);
    } catch (error) {
      if (selectTruthyValue(() => (!error), () => (typeof error !== 'object'))) throw error;
      (error as AnyRecord).surface = surface.name;
      throw error;
    }
  }
}

export const __runtimeRedisPreflightTest = { redisSurfaces, redisPreflightError };
