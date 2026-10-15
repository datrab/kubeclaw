import { rejectLegacyAuthors, type PrismWorkerSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { projectWorkerSettings } from '@kubeclaw/plugin-foundation/config/pipeline-composition';
import type { PipelineBootCapture } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';

/** Platform-owned configuration is captured once before starting the worker. */

export function loadWorkerConfig(capture: PipelineBootCapture, environment: NodeJS.ProcessEnv = process.env) {
  rejectLegacyAuthors(environment);
  if (environment.PRISM_CONTROL_INTERNAL_URL !== undefined) throw new Error('SWARM_CONFIG_LEGACY_OVERRIDE:PRISM_CONTROL_INTERNAL_URL:use prism-control.config.json settings.controlInternalUrl');
  if (environment.PORT !== undefined) throw new Error('SWARM_CONFIG_LEGACY_OVERRIDE:PORT moved to prism-worker.config.json settings.ingress.port');
  const spiffeEnabled = environment.WORKER_TRUST_SPIFFE_ENABLED === 'true';
  const workerSecret = environment.PRISM_WORKER_SECRET ?? '';
  if (!spiffeEnabled && !workerSecret) throw new Error('PRISM_WORKER_SECRET is required');
  const trustedControlSpiffeId = environment.PRISM_TRUSTED_CONTROL_SPIFFE_ID ?? '';
  if (spiffeEnabled && !trustedControlSpiffeId) throw new Error('Prism worker SPIFFE trust policy is incomplete');
  const databaseUrl = environment.DATABASE_URL ?? '';
  if (!spiffeEnabled && !databaseUrl) throw new Error('DATABASE_URL is required');
  const snapshot = projectWorkerSettings(capture);
  const settings = snapshot.worker;
  return Object.freeze({ spiffeEnabled, workerSecret, trustedControlSpiffeId, databaseUrl, shutdownTimeoutMs: settings.shutdownTimeoutMs,
    controlInternalUrl: new URL(snapshot.controlInternalUrl), maximumArtifactAcknowledgmentBytes: snapshot.maximumArtifactAcknowledgmentBytes,
    nonceDatabase: snapshot.nonceDatabase, native: snapshot.native, port: settings.port, ingress: ingressLimits(settings),
  });
}

export function workerIngressLimits(capture: PipelineBootCapture) {
  return ingressLimits(projectWorkerSettings(capture).worker);
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
