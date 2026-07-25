import { hostname } from 'os';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { readBusterEnvironment } from '../runtime-environment.ts';
import { writeBusterRuntimeLog } from './logger.ts';
import { loadBusterRuntimePolicy } from './runtime-policy.ts';
import { reportBusterRuntimeDiagnostic, safeErrorMessage } from './runtime-diagnostics.ts';
import { createRedisTaskQueue } from './task-transport-contract.ts';

function requireRuntimeEnvString(name: 'AGENT_NAME'): string {
  const value = readBusterEnvironment(name);
  if (typeof value !== 'string') throw new Error(`${name}: required runtime environment value`);
  if (!value.trim()) throw new Error(`${name}: required runtime environment value`);
  return value.trim();
}

export const AGENT_NAME = requireRuntimeEnvString('AGENT_NAME');
export const GROUP_NAME = `${AGENT_NAME}-group`;
export const CONSUMER_NAME = `${AGENT_NAME}-buster-pipeline-${hostname()}`;

export function getTaskStreamKey(): string {
  return loadBusterRuntimePolicy().task_stream;
}

const transport: { RedisCtor: any; redis: any } = { RedisCtor: null, redis: null };

export function getRedisClient(): any {
  if (transport.redis) return transport.redis;
  if (!transport.RedisCtor) transport.RedisCtor = loadRedisCtor();
  transport.redis = createRedisClient(transport.RedisCtor, {}, {
    retryStrategy: (times: number) => Math.min(times * 100, 5000),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  transport.redis.on('error', (error: unknown) => writeBusterRuntimeLog('error', 'task-queue', 'Redis client error', { detail: safeErrorMessage(error) }));
  transport.redis.on('connect', () => writeBusterRuntimeLog('info', 'task-queue', 'Redis connected'));
  return transport.redis;
}

export async function disconnectRedisClient(): Promise<void> {
  if (!transport.redis) return;
  const current = transport.redis;
  transport.redis = null;
  try {
    await current.quit();
  } catch (quitError) {
    reportBusterRuntimeDiagnostic({ component: 'buster_redis', surface: 'disconnect', reason: 'redis_quit_failed', detail: quitError });
    try {
      current.disconnect();
    } catch (disconnectError) {
      reportBusterRuntimeDiagnostic({ component: 'buster_redis', surface: 'disconnect', reason: 'redis_disconnect_failed', detail: disconnectError });
    }
  }
}

export function getTaskQueue(redisClient = getRedisClient()) {
  const policy = loadBusterRuntimePolicy();
  return createRedisTaskQueue(redisClient, {
    streamKey: getTaskStreamKey(),
    groupName: GROUP_NAME,
    consumerName: CONSUMER_NAME,
    pollInterval: policy.task_poll_interval_ms,
    reclaimIdleMs: policy.task_pending_reclaim_idle_ms,
    maxLen: policy.task_stream_max_len,
  });
}

export async function ensureTaskConsumerGroup(redisClient = getRedisClient()) {
  return getTaskQueue(redisClient).ensureConsumerGroup();
}

export async function reclaimPendingTask(redisClient = getRedisClient()) {
  if (!redisClient) return null;
  return getTaskQueue(redisClient).reclaimPending();
}

export async function readNextTaskEntry(redisClient = getRedisClient()) {
  if (!redisClient) return null;
  return getTaskQueue(redisClient).readNext();
}
