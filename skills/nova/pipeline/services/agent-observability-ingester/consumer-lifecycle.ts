import { errorMessage, isExpectedRedisCloseDuringShutdown } from './consumer-values.ts';

const runtimeLog = (level: string, message: string, reasonCode: string | null = null) => JSON.stringify({
  schema_version: 'runtime_log.v1', timestamp: new Date().toISOString(), level,
  component: 'nova/agent-observability-ingester', message, error_class: null, reason_code: reasonCode,
});

async function runLoop(owner: any, ctx: unknown) {
  while (owner.running && !owner.stopped) {
    try {
      await owner.processNext(ctx);
      if (!owner.running || owner.stopped) break;
      await owner.checkPressure(ctx);
      if (!owner.running || owner.stopped) break;
      if (owner.shouldTrim()) owner.scheduleTrim();
    } catch (error: any) {
      owner.stats.failed += 1; owner.redisReady = false; owner.groupReady = false;
      owner.stats.lastError = errorMessage(error);
      owner.logOnce('loop', `agent observability ingester loop failed: ${owner.stats.lastError}`);
      await new Promise((resolve) => setTimeout(resolve, owner.config.loopDelayMs));
    }
  }
}

export function startIngester(owner: any, ctx: unknown) {
  if (owner.running || !owner.config.enabled) return;
  owner.running = true; owner.stopped = false; owner.lifecycleState = 'running';
  let task: Promise<void>;
  task = runLoop(owner, ctx).catch((error: any) => {
    owner.stats.failed += 1; owner.stats.lastError = errorMessage(error);
    owner.logOnce('loop', `agent observability ingester loop failed: ${owner.stats.lastError}`);
  }).finally(() => { if (owner.loopTask === task) owner.loopTask = null; });
  owner.loopTask = task;
}

export async function stopIngester(owner: any) {
  if (owner.lifecycleState === 'closed') return;
  owner.lifecycleState = 'draining'; owner.stopped = true; owner.running = false;
  const loopTask = owner.loopTask; const redis = owner.redis;
  if (loopTask) await loopTask;
  if (!redis) { owner.lifecycleState = 'closed'; return; }
  if (owner.redis === redis) { owner.redis = null; owner.redisReady = false; owner.groupReady = false; }
  try {
    if (redis.quit) await redis.quit();
  } catch (error: any) {
    owner.stats.lastError = errorMessage(error);
    if (owner.lifecycleState === 'draining' && isExpectedRedisCloseDuringShutdown(error)) {
      owner.logger.debug?.(runtimeLog('debug', `Redis already closed during draining shutdown: ${owner.stats.lastError}`, 'REDIS_ALREADY_CLOSED'));
    } else owner.logOnce('redis-close', `agent observability ingester Redis close failed: ${owner.stats.lastError}`);
    if (redis.disconnect) redis.disconnect();
  } finally { owner.lifecycleState = 'closed'; }
}
