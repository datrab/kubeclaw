/** Platform-owned configuration is captured once before starting the worker. */

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env) {
  const spiffeEnabled = environment.WORKER_TRUST_SPIFFE_ENABLED === 'true';
  const workerSecret = environment.PRISM_WORKER_SECRET ?? '';
  if (!spiffeEnabled && !workerSecret) throw new Error('PRISM_WORKER_SECRET is required');
  const trustedControlSpiffeId = environment.PRISM_TRUSTED_CONTROL_SPIFFE_ID ?? '';
  if (spiffeEnabled && !trustedControlSpiffeId) throw new Error('Prism worker SPIFFE trust policy is incomplete');
  const databaseUrl = environment.DATABASE_URL ?? '';
  if (!spiffeEnabled && !databaseUrl) throw new Error('DATABASE_URL is required');
  return Object.freeze({ spiffeEnabled, workerSecret, trustedControlSpiffeId, databaseUrl, shutdownTimeoutMs: shutdownTimeout(environment),
    controlInternalUrl: new URL(environment.PRISM_CONTROL_INTERNAL_URL ?? 'http://prism-control:8080'),
    port: Number(environment.PORT ?? 8080), ingress: workerIngressLimits(environment),
  });
}

export function workerIngressLimits(environment: NodeJS.ProcessEnv = process.env) {
  const read = (name: string, fallback: number) => {
    const value = Number(environment[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) throw new Error(`PRISM_WORKER_INGRESS_INVALID:${name}`);
    return value;
  };
  return Object.freeze({
    maximumActiveRequests: read('PRISM_WORKER_MAXIMUM_ACTIVE_REQUESTS', 16),
    maximumProbeRequests: read('PRISM_WORKER_MAXIMUM_PROBE_REQUESTS', 4),
    maximumConnections: read('PRISM_WORKER_MAXIMUM_CONNECTIONS', 128),
    maximumInputBytes: read('PRISM_NATIVE_MAXIMUM_INPUT_BYTES', 16777216),
    requestTimeoutMs: read('PRISM_WORKER_REQUEST_BODY_TIMEOUT_MS', 120000),
  });
}

function shutdownTimeout(environment: NodeJS.ProcessEnv): number {
  const shutdownTimeoutMs = Number(environment.PRISM_WORKER_SHUTDOWN_TIMEOUT_MS ?? 120_000);
  if (!Number.isSafeInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1 || shutdownTimeoutMs > 2_147_483_647) {
    throw new Error('PRISM_WORKER_SHUTDOWN_TIMEOUT_MS must be a positive timer-safe integer');
  }
  return shutdownTimeoutMs;
}
