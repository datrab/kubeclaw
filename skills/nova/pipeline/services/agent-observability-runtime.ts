import { log } from '../core/logger.ts';
import { createAgentObservabilityIngester } from './agent-observability-ingester/index.ts';
import { createDefaultAgentObservabilityRedisClient } from './agent-observability-ingester/consumer.ts';
import { agentObservabilityIngesterConfig } from './agent-observability-config.ts';
import { recordObservabilityDegraded } from './observability.ts';

function sleep(ms: any) {
  return new Promise((resolve: any) => setTimeout(resolve, ms));
}

function requireNonNegativeNumber(value: any, field: any) {
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0) return num;
  throw new Error(`agent_observability.ingester.${field} must be a non-negative number`);
}

function errorDetail(error: any) {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) return error.message.trim();
  return String(error);
}

function didTimeout(...results: any) {
  return results.some((result: any) => result?.timedOut === true);
}

function withTimeout(promise: any, timeoutMs: any) {
  if (timeoutMs === 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise((resolve: any) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([
    promise.then((value: any) => ({ value, timedOut: false })),
    timeout,
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function reportRuntimeLoopFailure(ctx: any, error: any) {
  const detail = errorDetail(error);
  log('WARN', `[agent-observability-ingester] runtime loop failed: ${detail}`);
  try {
    await recordObservabilityDegraded(ctx, {
      component: 'agent_observability_ingester', surface: 'redis_control_stream',
      reason: 'agent_observability_ingester_loop_failed', source: 'agent_observability_ingester_runtime', detail,
    });
  } catch (reportError: any) {
    log('WARN', `[agent-observability-ingester] degraded evidence failed: ${errorDetail(reportError)}`);
  }
}

function createRuntimeLoop(ingester: any, context: any) {
  let tick = 0;
  let loggedFailure = false;
  return async function loop(isStopped: () => boolean) {
    while (!isStopped()) {
      try {
        await ingester.processNext(context.ctx);
        tick += 1;
        if (context.healthCheckEvery > 0 && tick % context.healthCheckEvery === 0 && typeof ingester.checkPressure === 'function') {
          await ingester.checkPressure(context.ctx);
        }
        if (typeof ingester.trim === 'function') await ingester.trim();
      } catch (error: any) {
        if (!loggedFailure) {
          loggedFailure = true;
          await reportRuntimeLoopFailure(context.ctx, error);
        }
        await sleep(context.loopDelayMs);
      }
    }
  };
}

export function startAgentObservabilityIngester(config: any, ctx: any = {}) {
  const runtimeConfig = agentObservabilityIngesterConfig(config);
  if (runtimeConfig.enabled !== true) {
    return {
      started: false,
      stop: async () => {},
      stats: () => null,
    };
  }

  const ingester = createAgentObservabilityIngester({
    config: runtimeConfig,
    env: process.env,
    logger: console,
    redisClientFactory: createDefaultAgentObservabilityRedisClient,
  });
  const loopDelayMs = requireNonNegativeNumber(runtimeConfig.loopDelayMs, 'loopDelayMs');
  const healthCheckEvery = requireNonNegativeNumber(runtimeConfig.healthCheckEvery, 'healthCheckEvery');
  const stopTimeoutMs = requireNonNegativeNumber(runtimeConfig.stopTimeoutMs, 'stopTimeoutMs');
  let stopped = false;
  const loop = createRuntimeLoop(ingester, {
    ctx: { ...ctx, config }, healthCheckEvery, loopDelayMs,
  });
  const task = loop(() => stopped);
  log('INFO', '[agent-observability-ingester] runtime loop started from swarm.config.json');

  const controller = {
    started: true,
    stats: () => (typeof ingester.getStats === 'function' ? ingester.getStats() : null),
    async stop() {
      stopped = true;
      const stopResults: any[] = [];
      if (typeof ingester.stop === 'function') {
        const stopResult = await withTimeout(Promise.resolve().then(() => ingester.stop()), stopTimeoutMs);
        stopResults.push(stopResult);
      }
      try {
        const loopResult = await withTimeout(task, stopTimeoutMs);
        stopResults.push(loopResult);
      } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): this side effect is noncritical and the owning operation remains authoritative. */ /* loop errors are logged above */ }
      if (didTimeout(...stopResults)) {
        log('WARN', `[agent-observability-ingester] runtime loop stop timed out after ${stopTimeoutMs}ms`);
      } else {
        log('INFO', '[agent-observability-ingester] runtime loop stopped');
      }
    },
  };
  config._agentObservabilityRuntime = controller;
  return controller;
}
