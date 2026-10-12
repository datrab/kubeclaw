import path from 'node:path';
import { requirePrismResourcePoolCapacity } from './resource-policy.ts';
import type { loadWorkerConfig } from '../server/worker-config.ts';
import { readNativeWorkerNodeIdentity, readNativeWorkerPoolPolicy, requireNativeWorkerRuntimeIdentity } from '@kubeclaw/worker-core';

/** Image identity shared by producer and worker. */
export function prismEngineContentDigest(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const digest = environment.PRISM_ENGINE_CONTENT_DIGEST?.trim();
  if (environment.NODE_ENV === 'production' && !/^sha256:[a-f0-9]{64}$/u.test(digest ?? '')) {
    throw new Error('PRISM_NATIVE_ENGINE_CONTENT_IDENTITY_REQUIRED');
  }
  return digest;
}

export function nativePrismHostConfig(environment: NodeJS.ProcessEnv = process.env) {
  const scope = environment.KUBECLAW_NATIVE_SCOPE;
  if (!scope) throw new Error('PRISM_NATIVE_PREEXEC_MEMBERSHIP_REQUIRED');
  if (environment.PRISM_NATIVE_MAXIMUM_INPUT_BYTES !== undefined) throw new Error('SWARM_CONFIG_LEGACY_OVERRIDE:PRISM_NATIVE_MAXIMUM_INPUT_BYTES');
  const maximumInputBytes = Number(environment.PRISM_NATIVE_ASSIGNED_INPUT_BYTES);
  if (!Number.isSafeInteger(maximumInputBytes) || maximumInputBytes < 1 || maximumInputBytes > 2_147_483_647) throw new Error('PRISM_NATIVE_INPUT_LIMIT_REQUIRED');
  const controlInternalUrl = new URL(environment.PRISM_CONTROL_INTERNAL_URL!);
  const workerSecret = environment.PRISM_WORKER_SECRET ?? '';
  const spiffeEnabled = environment.WORKER_TRUST_SPIFFE_ENABLED === 'true';
  if (!spiffeEnabled && !workerSecret) throw new Error('PRISM_NATIVE_ARTIFACT_AUTH_REQUIRED');
  return Object.freeze({ scope, maximumInputBytes, controlInternalUrl, workerSecret, spiffeEnabled });
}

export function nativePrismSupervisorConfig(config: ReturnType<typeof loadWorkerConfig>, environment: NodeJS.ProcessEnv = process.env) {
  const root = (name: string) => {
    const value = environment[name];
    if (!value || !path.isAbsolute(value) || path.resolve(value) !== value || value === '/') throw new Error(`PRISM_NATIVE_PATH_REQUIRED:${name}`);
    return value;
  };
  const engineContentDigest = prismEngineContentDigest(environment);
  if (!/^sha256:[a-f0-9]{64}$/u.test(engineContentDigest ?? '')) throw new Error('PRISM_NATIVE_ENGINE_CONTENT_IDENTITY_REQUIRED');
  const pool = readNativeWorkerPoolPolicy(root('PRISM_NATIVE_POOL_POLICY_FILE'), 'prism');
  requirePrismResourcePoolCapacity(config.native.resourcePolicy, pool.limits);
  requireNativeWorkerRuntimeIdentity(pool.runtimeIdentityFile);
  return Object.freeze({
    ...prismSupervisorSettings(config),
    engineContentDigest: engineContentDigest!,
    cgroupRoot: pool.cgroupRoot, ownershipRoot: pool.ownershipRoot,
    poolLimits: pool.limits, nodeIdentity: readNativeWorkerNodeIdentity(pool.nodeIdentityFile),
    launcher: root('PRISM_NATIVE_LAUNCHER'),
    maximumActiveScopes: pool.maximumActiveScopes,
    browserPath: environment.PLAYWRIGHT_BROWSERS_PATH ?? '/ms-playwright',
  });
}

/** Numeric startup snapshot; host authority is validated separately before composition. */
export function prismSupervisorSettings(config: ReturnType<typeof loadWorkerConfig>) {
  const supervisor = config.native.supervisor;
  return Object.freeze({
    policy: config.native.resourcePolicy,
    uid: supervisor.uid, gid: supervisor.gid,
    maximumRecords: supervisor.maximumOwnershipRecords,
    maximumBytes: supervisor.maximumOwnershipBytes,
    maximumInputBytes: config.ingress.maximumInputBytes,
    maximumOutputBytes: supervisor.maximumOutputBytes,
    maximumResultBytes: config.native.maximumResultBytes,
    maximumJournalBytes: supervisor.maximumJournalBytes,
    pollIntervalMs: supervisor.pollIntervalMs,
    drainTimeoutMs: supervisor.drainTimeoutMs,
    closeTimeoutMs: supervisor.closeTimeoutMs,
  });
}
