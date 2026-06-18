import { log } from '../core/logger.ts';
import { createAgentObservabilityIngester } from './agent-observability-ingester/index.ts';
import { recordObservabilityDegraded } from './observability.ts';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ingesterConfig(config = {}) {
  return config?.agent_observability?.ingester || { enabled: false };
}

function positiveNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
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

export function startAgentObservabilityIngester(config, ctx = {}, opts = {}) {
  const runtimeConfig = ingesterConfig(config);
  if (runtimeConfig.enabled !== true) {
    return {
      started: false,
      stop: async () => {},
      stats: () => null,
    };
  }

  const ingester = opts.ingester || createAgentObservabilityIngester({
    config: runtimeConfig,
    env: process.env,
    logger: opts.logger || console,
    redisClientFactory: opts.redisClientFactory,
    emitEvent: opts.emitEvent,
    recordObservabilityDegraded: opts.recordObservabilityDegraded,
    recordObservabilityRestored: opts.recordObservabilityRestored,
  });
  const loopDelayMs = Number(runtimeConfig.loopDelayMs ?? 250);
  const healthCheckEvery = Number(runtimeConfig.healthCheckEvery ?? 10);
  const stopTimeoutMs = positiveNumber(runtimeConfig.stopTimeoutMs ?? opts.stopTimeoutMs, 2000);
  const reportDegraded = opts.recordObservabilityDegraded || recordObservabilityDegraded;
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
          log('WARN', `[agent-observability-ingester] runtime loop failed: ${error?.message || String(error)}`);
          try {
            await reportDegraded({ ...ctx, config }, {
              reason: 'agent_observability_ingester_loop_failed',
              source: 'agent_observability_ingester_runtime',
              detail: { error: error?.message || String(error) },
            });
          } catch (reportError) {
            log('WARN', `[agent-observability-ingester] degraded evidence failed: ${reportError?.message || String(reportError)}`);
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
      let stopTimedOut = false;
      if (typeof ingester.stop === 'function') {
        const stopResult = await withTimeout(Promise.resolve().then(() => ingester.stop()), stopTimeoutMs);
        stopTimedOut = stopTimedOut || stopResult?.timedOut === true;
      }
      try {
        const loopResult = await withTimeout(task, stopTimeoutMs);
        stopTimedOut = stopTimedOut || loopResult?.timedOut === true;
      } catch (_error) { /* loop errors are logged above */ }
      if (stopTimedOut) {
        log('WARN', `[agent-observability-ingester] runtime loop stop timed out after ${stopTimeoutMs}ms`);
      } else {
        log('INFO', '[agent-observability-ingester] runtime loop stopped');
      }
    },
  };
}
