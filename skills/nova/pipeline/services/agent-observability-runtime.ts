import { log } from '../core/logger.ts';
import { createAgentObservabilityIngester } from './agent-observability-ingester/index.ts';
import { recordObservabilityDegraded } from './observability.ts';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ingesterConfig(config = {}) {
  return config?.agent_observability?.ingester || { enabled: false };
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
      try {
        await task;
      } catch (_error) { /* loop errors are logged above */ }
      if (typeof ingester.stop === 'function') await ingester.stop();
      log('INFO', '[agent-observability-ingester] runtime loop stopped');
    },
  };
}
