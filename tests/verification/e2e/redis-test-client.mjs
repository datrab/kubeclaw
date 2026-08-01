import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Redis = require('ioredis');

function redisOptions(env = process.env) {
  const port = Number(env.REDIS_PORT || 6379);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('REDIS_PORT must be a valid TCP port');
  }
  return {
    host: env.REDIS_HOST || '127.0.0.1',
    port,
    password: env.REDIS_PASSWORD || undefined,
    tls: env.REDIS_TLS === '1' ? {} : undefined,
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    connectTimeout: Number(env.REAL_E2E_REDIS_CONNECT_TIMEOUT_MS || 10000),
  };
}

export function createRealE2ERedisClient(env = process.env) {
  return new Redis(redisOptions(env));
}

export async function withRealE2ERedisClient(operation, env = process.env) {
  const redis = createRealE2ERedisClient(env);
  redis.on('error', () => {});
  try {
    await redis.connect();
    return await operation(redis);
  } finally {
    if (redis.status === 'ready') await redis.quit();
    else redis.disconnect();
  }
}
