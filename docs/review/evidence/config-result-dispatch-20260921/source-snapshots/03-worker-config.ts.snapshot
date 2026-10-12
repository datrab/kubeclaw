import { loadPrismSettings, loadPrismWorkerSettings, type PrismWorkerSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';

/** Platform-owned configuration is captured once before starting the worker. */

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env) {
  const spiffeEnabled = environment.WORKER_TRUST_SPIFFE_ENABLED === 'true';
  const workerSecret = environment.PRISM_WORKER_SECRET ?? '';
  if (!spiffeEnabled && !workerSecret) throw new Error('PRISM_WORKER_SECRET is required');
  const trustedControlSpiffeId = environment.PRISM_TRUSTED_CONTROL_SPIFFE_ID ?? '';
  if (spiffeEnabled && !trustedControlSpiffeId) throw new Error('Prism worker SPIFFE trust policy is incomplete');
  const databaseUrl = environment.DATABASE_URL ?? '';
  if (!spiffeEnabled && !databaseUrl) throw new Error('DATABASE_URL is required');
  const snapshot = loadPrismSettings(environment);
  const settings = snapshot.worker;
  return Object.freeze({ spiffeEnabled, workerSecret, trustedControlSpiffeId, databaseUrl, shutdownTimeoutMs: settings.shutdownTimeoutMs,
    controlInternalUrl: new URL(environment.PRISM_CONTROL_INTERNAL_URL ?? 'http://prism-control:8080'),
    native: snapshot.native, port: Number(environment.PORT ?? 8080), ingress: ingressLimits(settings),
  });
}

export function workerIngressLimits(environment: NodeJS.ProcessEnv = process.env) {
  return ingressLimits(loadPrismWorkerSettings(environment));
}

function ingressLimits(settings: PrismWorkerSettings) {
  return Object.freeze({
    maximumActiveRequests: settings.maximumActiveRequests,
    maximumProbeRequests: settings.maximumProbeRequests,
    maximumConnections: settings.maximumConnections,
    maximumInputBytes: settings.maximumInputBytes,
    requestTimeoutMs: settings.requestTimeoutMs,
  });
}
