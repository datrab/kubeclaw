import { loadPrismWorkerSettings, type PrismWorkerSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';

/** Platform-owned configuration is captured once before starting the worker. */

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env) {
  const spiffeEnabled = environment.WORKER_TRUST_SPIFFE_ENABLED === 'true';
  const workerSecret = environment.PRISM_WORKER_SECRET ?? '';
  if (!spiffeEnabled && !workerSecret) throw new Error('PRISM_WORKER_SECRET is required');
  const trustedControlSpiffeId = environment.PRISM_TRUSTED_CONTROL_SPIFFE_ID ?? '';
  if (spiffeEnabled && !trustedControlSpiffeId) throw new Error('Prism worker SPIFFE trust policy is incomplete');
  const databaseUrl = environment.DATABASE_URL ?? '';
  if (!spiffeEnabled && !databaseUrl) throw new Error('DATABASE_URL is required');
  const settings = loadPrismWorkerSettings(environment);
  return Object.freeze({ spiffeEnabled, workerSecret, trustedControlSpiffeId, databaseUrl, shutdownTimeoutMs: settings.shutdownTimeoutMs,
    controlInternalUrl: new URL(environment.PRISM_CONTROL_INTERNAL_URL ?? 'http://prism-control:8080'),
    port: Number(environment.PORT ?? 8080), ingress: ingressLimits(environment, settings),
  });
}

export function workerIngressLimits(environment: NodeJS.ProcessEnv = process.env) {
  return ingressLimits(environment, loadPrismWorkerSettings(environment));
}

function ingressLimits(environment: NodeJS.ProcessEnv, settings: PrismWorkerSettings) {
  // Shared native input limit is a separate, not yet migrated setting.
  const maximumInputBytes = Number(environment.PRISM_NATIVE_MAXIMUM_INPUT_BYTES ?? 16777216);
  if (!Number.isSafeInteger(maximumInputBytes) || maximumInputBytes < 1 || maximumInputBytes > 2_147_483_647) {
    throw new Error('PRISM_WORKER_INGRESS_INVALID:PRISM_NATIVE_MAXIMUM_INPUT_BYTES');
  }
  return Object.freeze({
    maximumActiveRequests: settings.maximumActiveRequests,
    maximumProbeRequests: settings.maximumProbeRequests,
    maximumConnections: settings.maximumConnections,
    maximumInputBytes,
    requestTimeoutMs: settings.requestTimeoutMs,
  });
}
