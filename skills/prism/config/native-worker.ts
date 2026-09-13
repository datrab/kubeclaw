import path from 'node:path';
import { readNativeWorkerNodeIdentity, readNativeWorkerPoolPolicy, requireNativeWorkerRuntimeIdentity } from '@kubeclaw/worker-core';

/** One explicit migration selection shared by Control and the worker chart. */
export function prismWorkerExecutionMode(environment: NodeJS.ProcessEnv = process.env): 'legacy' | 'native' {
  const mode = environment.PRISM_WORKER_EXECUTION_MODE ?? 'legacy';
  if (mode !== 'legacy' && mode !== 'native') throw new Error('PRISM_WORKER_EXECUTION_MODE_INVALID');
  return mode;
}

export function prismNativeMaximumResultBytes(environment: NodeJS.ProcessEnv = process.env): number {
  const value = Number(environment.PRISM_NATIVE_MAXIMUM_RESULT_BYTES ?? 67108864);
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) throw new Error('PRISM_NATIVE_RESULT_LIMIT_INVALID');
  return value;
}

export function prismNativeDispatchTimeoutMs(environment: NodeJS.ProcessEnv = process.env): number {
  const value = Number(environment.PRISM_NATIVE_DISPATCH_TIMEOUT_MS ?? 900000);
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) throw new Error('PRISM_NATIVE_DISPATCH_DEADLINE_INVALID');
  return value;
}

/** Shared producer/worker defaults; deployment overrides use these same named settings. */
export function prismEngineContentDigest(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  return environment.PRISM_ENGINE_CONTENT_DIGEST?.trim();
}

export function prismNativePolicy(environment: NodeJS.ProcessEnv = process.env) {
  const read = (name: string, fallback: number) => {
    const value = Number(environment[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`PRISM_NATIVE_POLICY_INVALID:${name}`);
    return value;
  };
  return Object.freeze({
    cpuTimeMs: read('PRISM_NATIVE_CPU_TIME_MS', 60000),
    memoryBytes: read('PRISM_NATIVE_MEMORY_BYTES', 8589934592),
    tasks: read('PRISM_NATIVE_TASKS', 2048),
  });
}

export function nativePrismHostConfig(environment: NodeJS.ProcessEnv = process.env) {
  const scope = environment.KUBECLAW_NATIVE_SCOPE;
  if (!scope) throw new Error('PRISM_NATIVE_PREEXEC_MEMBERSHIP_REQUIRED');
  const maximumInputBytes = Number(environment.PRISM_NATIVE_MAXIMUM_INPUT_BYTES);
  if (!Number.isSafeInteger(maximumInputBytes) || maximumInputBytes < 1) throw new Error('PRISM_NATIVE_INPUT_LIMIT_REQUIRED');
  const controlInternalUrl = new URL(environment.PRISM_CONTROL_INTERNAL_URL!);
  const workerSecret = environment.PRISM_WORKER_SECRET ?? '';
  const spiffeEnabled = environment.WORKER_TRUST_SPIFFE_ENABLED === 'true';
  if (!spiffeEnabled && !workerSecret) throw new Error('PRISM_NATIVE_ARTIFACT_AUTH_REQUIRED');
  return Object.freeze({ scope, maximumInputBytes, controlInternalUrl, workerSecret, spiffeEnabled });
}

export function nativePrismSupervisorConfig(environment: NodeJS.ProcessEnv = process.env) {
  const root = (name: string) => {
    const value = environment[name];
    if (!value || !path.isAbsolute(value) || path.resolve(value) !== value || value === '/') throw new Error(`PRISM_NATIVE_PATH_REQUIRED:${name}`);
    return value;
  };
  const read = (name: string, fallback: number, maximum = 2_147_483_647) => {
    const value = Number(environment[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`PRISM_NATIVE_CONFIG_INVALID:${name}`);
    return value;
  };
  const pool = readNativeWorkerPoolPolicy(root('PRISM_NATIVE_POOL_POLICY_FILE'), 'prism');
  requireNativeWorkerRuntimeIdentity(pool.runtimeIdentityFile);
  return Object.freeze({
    policy: prismNativePolicy(environment),
    engineContentDigest: prismEngineContentDigest(environment) ?? '',
    cgroupRoot: pool.cgroupRoot, ownershipRoot: pool.ownershipRoot,
    poolLimits: pool.limits, nodeIdentity: readNativeWorkerNodeIdentity(pool.nodeIdentityFile),
    launcher: root('PRISM_NATIVE_LAUNCHER'),
    uid: read('PRISM_NATIVE_UID', 1000), gid: read('PRISM_NATIVE_GID', 1000),
    maximumActiveScopes: pool.maximumActiveScopes,
    maximumRecords: read('PRISM_NATIVE_MAXIMUM_OWNERSHIP_RECORDS', 65536),
    maximumBytes: read('PRISM_NATIVE_MAXIMUM_OWNERSHIP_BYTES', 67108864),
    maximumInputBytes: read('PRISM_NATIVE_MAXIMUM_INPUT_BYTES', 16777216),
    maximumOutputBytes: read('PRISM_NATIVE_MAXIMUM_OUTPUT_BYTES', 33554432),
    maximumResultBytes: prismNativeMaximumResultBytes(environment),
    maximumJournalBytes: read('PRISM_NATIVE_MAXIMUM_JOURNAL_BYTES', 68719476736, Number.MAX_SAFE_INTEGER),
    pollIntervalMs: read('PRISM_NATIVE_POLL_INTERVAL_MS', 20),
    drainTimeoutMs: read('PRISM_NATIVE_DRAIN_TIMEOUT_MS', 10000),
    closeTimeoutMs: read('PRISM_NATIVE_CLOSE_TIMEOUT_MS', 15000),
    browserPath: environment.PLAYWRIGHT_BROWSERS_PATH ?? '/ms-playwright',
  });
}
