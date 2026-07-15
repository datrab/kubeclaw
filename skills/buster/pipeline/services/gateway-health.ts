// pipeline/services/gateway-health.ts — Buster gateway readiness and health monitor
// Keeps gateway liveness policy outside the main Buster pipeline entrypoint.

import { checkGatewayHealth as checkCommonGatewayHealth } from '../integrations/gateway.ts';
import { loadBusterGatewayHealthPolicy } from './runtime-policy.ts';

export async function checkGatewayHealth() {
  const policy = loadBusterGatewayHealthPolicy();
  return checkCommonGatewayHealth({ timeoutMs: policy.invokeTimeoutMs });
}

async function defaultGatewayShutdown(signal: string, opts: Record<string, any> = {}) {
  throw Object.assign(new Error(`Gateway shutdown requested: ${signal}`), {
    signal,
    opts,
  });
}

function gatewayShutdownAuthority(shutdown?: (signal: string, opts?: Record<string, any>) => any) {
  return typeof shutdown === 'function' ? shutdown : defaultGatewayShutdown;
}

export async function waitForGateway({ shutdown }: { shutdown?: (signal: string, opts?: Record<string, any>) => any } = {}): Promise<void> {
  const shutdownGateway = gatewayShutdownAuthority(shutdown);
  const policy = loadBusterGatewayHealthPolicy();
  console.log(`[GATEWAY] Waiting for gateway readiness (max ${policy.readyTimeoutMs / 1000}s)...`);
  const deadline = Date.now() + policy.readyTimeoutMs;
  while (Date.now() < deadline) {
    if (await checkGatewayHealth()) {
      console.log('[GATEWAY] ✅ Gateway ready.');
      return;
    }
    await new Promise(r => setTimeout(r, policy.readyIntervalMs));
  }
  console.error('[GATEWAY] ❌ Gateway not ready within timeout. Starting structured shutdown.');
  await shutdownGateway('GATEWAY_READY_TIMEOUT', {
    exitCode: 1,
    cleanupStage: 'gateway-ready-timeout',
    reason: 'gateway_ready_timeout',
    detail: `Gateway was not ready within ${policy.readyTimeoutMs / 1000}s`,
    emitGatewayDegraded: true,
  });
}

export function startGatewayHealthMonitor({ isShuttingDown = () => false, shutdown }: { isShuttingDown?: () => boolean; shutdown?: (signal: string, opts?: Record<string, any>) => any } = {}): ReturnType<typeof setInterval> {
  const shutdownGateway = gatewayShutdownAuthority(shutdown);
  const policy = loadBusterGatewayHealthPolicy();
  let consecutiveFailures = 0;
  return setInterval(async () => {
    if (isShuttingDown()) return;
    let healthy = false;
    try {
      healthy = await checkGatewayHealth();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[GATEWAY] Health check threw: ${detail}`);
    }
    if (!healthy) {
      consecutiveFailures++;
      console.warn(`[GATEWAY] ⚠️ Health check failed (${consecutiveFailures}/${policy.maxFailures})`);
      if (consecutiveFailures >= policy.maxFailures) {
        console.error('[GATEWAY] ❌ Gateway unreachable. Starting structured shutdown.');
        await shutdownGateway('GATEWAY_HEALTH_FAILED', {
          exitCode: 1,
          cleanupStage: 'gateway-health-failed',
          reason: 'gateway_unreachable',
          detail: `Gateway health failed ${consecutiveFailures} consecutive times`,
          emitGatewayDegraded: true,
        });
      }
    } else {
      if (consecutiveFailures > 0) console.log(`[GATEWAY] ✅ Recovered after ${consecutiveFailures} failed check(s).`);
      consecutiveFailures = 0;
    }
  }, policy.monitorIntervalMs);
}
