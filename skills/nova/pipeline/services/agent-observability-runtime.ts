import { log } from '../core/logger.ts';
import { createAgentObservabilityIngester } from './agent-observability-ingester/index.ts';
import { createDefaultAgentObservabilityRedisClient } from './agent-observability-ingester/consumer.ts';
import { agentObservabilityIngesterConfig } from './agent-observability-config.ts';
import { recordObservabilityDegraded } from './observability.ts';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireNonNegativeNumber(value, field) {
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0) return num;
  throw new Error(`agent_observability.ingester.${field} must be a non-negative number`);
}

function errorDetail(error) {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) return error.message.trim();
  return String(error);
}

function didTimeout(...results) {
  return results.some((result) => result?.timedOut === true);
}

function withTimeout(promise, timeoutMs) {
  if (timeoutMs === 0) return promise;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([
    promise.then((value) => ({ value, timedOut: false })),
    timeout,
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function startAgentObservabilityIngester(config, ctx = {}) {
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
  let tick = 0;
  let loggedFailure = false;

  async function loop() {
    while (!stopped) {
      try {
        await ingester.processNext({ ...ctx, config });
        tick += 1;
        if (healthCheckEvery > 0 && tick % healthCheckEvery === 0 && typeof ingester.checkPressure === 'function') {
          await ingester.checkPressure({ ...ctx, config });
        }
        if (typeof ingester.trim === 'function') await ingester.trim();
      } catch (error) {
        if (!loggedFailure) {
          loggedFailure = true;
          const detail = errorDetail(error);
          log('WARN', `[agent-observability-ingester] runtime loop failed: ${detail}`);
          try {
            await recordObservabilityDegraded({ ...ctx, config }, {
              component: 'agent_observability_ingester',
              surface: 'redis_control_stream',
              reason: 'agent_observability_ingester_loop_failed',
              source: 'agent_observability_ingester_runtime',
              detail,
            });
          } catch (reportError) {
            log('WARN', `[agent-observability-ingester] degraded evidence failed: ${errorDetail(reportError)}`);
          }
        }
        await sleep(loopDelayMs);
      }
    }
  }

  const task = loop();
  log('INFO', '[agent-observability-ingester] runtime loop started from swarm.config.json');

  return {
    started: true,
    stats: () => (typeof ingester.getStats === 'function' ? ingester.getStats() : null),
    async stop() {
      stopped = true;
      const stopResults = [];
      if (typeof ingester.stop === 'function') {
        const stopResult = await withTimeout(Promise.resolve().then(() => ingester.stop()), stopTimeoutMs);
        stopResults.push(stopResult);
      }
      try {
        const loopResult = await withTimeout(task, stopTimeoutMs);
        stopResults.push(loopResult);
      } catch (_error) { /* loop errors are logged above */ }
      if (didTimeout(...stopResults)) {
        log('WARN', `[agent-observability-ingester] runtime loop stop timed out after ${stopTimeoutMs}ms`);
      } else {
        log('INFO', '[agent-observability-ingester] runtime loop stopped');
      }
    },
  };
}
