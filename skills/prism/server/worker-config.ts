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
    port: Number(environment.PORT ?? 8080),
  });
}

function shutdownTimeout(environment: NodeJS.ProcessEnv): number {
  const shutdownTimeoutMs = Number(environment.PRISM_WORKER_SHUTDOWN_TIMEOUT_MS ?? 20_000);
  if (!Number.isSafeInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1 || shutdownTimeoutMs > 2_147_483_647) {
    throw new Error('PRISM_WORKER_SHUTDOWN_TIMEOUT_MS must be a positive timer-safe integer');
  }
  return shutdownTimeoutMs;
}
