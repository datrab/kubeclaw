import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicKey } from 'node:crypto';
import { readNativeWorkerNodeIdentity, readNativeWorkerPoolPolicy, requireNativeWorkerRuntimeIdentity,
  requireNativeWorkerLauncher } from '@kubeclaw/worker-core';
import type { BusterPreparationSettings } from '../../../common/plugin-runtime/foundation/config/swarm.ts';

export const preparationStateRoot = '/var/lib/buster-v2/plan-jobs';
export const preparationSourceRoot = '/var/lib/buster-v2/native-sources';
export const preparationRuntimeConfig = '/run/kubeclaw-buster/config/runtime.json';

/** The root parent reads only bounded immutable configuration; it never constructs providers. */
export function nativeBusterPreparationConfig(settings: BusterPreparationSettings, environment: NodeJS.ProcessEnv) {
  const poolFile = environment.BUSTER_NATIVE_POOL_POLICY_FILE;
  if (!poolFile) throw new Error('BUSTER_NATIVE_POOL_POLICY_REQUIRED');
  const pool = readNativeWorkerPoolPolicy(poolFile, 'buster');
  requireNativeWorkerRuntimeIdentity(pool.runtimeIdentityFile);
  if (pool.limits.memoryBytes < settings.resourcePolicy.memoryBytes || pool.limits.tasks < settings.resourcePolicy.tasks
    || pool.maximumActiveScopes < settings.maximumActivePreparations) throw new Error('BUSTER_NATIVE_POOL_CAPACITY_INVALID');
  const engineContentDigest = environment.BUSTER_ENGINE_CONTENT_DIGEST;
  if (!/^sha256:[a-f0-9]{64}$/u.test(engineContentDigest ?? '')) throw new Error('BUSTER_NATIVE_ENGINE_IDENTITY_REQUIRED');
  const launcher = '/usr/local/libexec/kubeclaw-native-worker-launcher';
  requireNativeWorkerLauncher(launcher);
  requireNativeWorkerLauncher(process.execPath);
  requireNativeWorkerLauncher(fileURLToPath(new URL('../../../common/plugin-runtime/foundation/isolation/plugin-sandbox', import.meta.url)));
  const runtime = readRootConfiguration(settings.maximumInputBytes);
  const publicKeyName = runtime.sourceAttestationPublicKeyEnvironmentVariable;
  if (typeof publicKeyName !== 'string' || !/^[A-Z][A-Z0-9_]*$/u.test(publicKeyName)
    || typeof runtime.trustedSourceAuthority !== 'string' || !runtime.trustedSourceAuthority) throw new Error('BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID');
  const sourceAttestationPublicKey = environment[publicKeyName];
  if (!sourceAttestationPublicKey || createPublicKey(sourceAttestationPublicKey).asymmetricKeyType !== 'ed25519') {
    throw new Error('BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID');
  }
  if ((runtime.stateRoot !== preparationStateRoot || runtime.runtimeRoot !== '/var/lib/buster-v2/runs')) throw new Error('BUSTER_NATIVE_STATE_ROOT_INVALID');
  return Object.freeze({ pool, launcher, engineContentDigest: engineContentDigest!, sourceAttestationPublicKey,
    trustedSourceAuthority: runtime.trustedSourceAuthority, stateRoot: runtime.stateRoot,
    nodeIdentity: readNativeWorkerNodeIdentity(pool.nodeIdentityFile), tarExecutable: '/usr/bin/tar' });
}

function readRootConfiguration(maximumBytes: number): Record<string, unknown> {
  let current = '/';
  for (const component of path.dirname(preparationRuntimeConfig).split('/').filter(Boolean)) {
    current = path.join(current, component);
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) throw new Error('BUSTER_NATIVE_CONFIG_ANCESTOR_INVALID');
  }
  const fd = fs.openSync(preparationRuntimeConfig, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.uid !== 0 || stat.nlink !== 1 || (stat.mode & 0o022) !== 0 || stat.size > maximumBytes) {
      throw new Error('BUSTER_NATIVE_CONFIG_NOT_TRUSTED');
    }
    const value: unknown = JSON.parse(fs.readFileSync(fd, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('BUSTER_NATIVE_CONFIG_INVALID');
    return value as Record<string, unknown>;
  } finally { fs.closeSync(fd); }
}

/** ConfigMap symlinks may resolve only through root-controlled immutable ancestry. */
export function requireRootBusterSettings(environment: NodeJS.ProcessEnv): void {
  const file = environment.SWARM_CONFIG;
  if (!file || !path.isAbsolute(file) || path.resolve(file) !== file) throw new Error('BUSTER_NATIVE_SWARM_CONFIG_REQUIRED');
  for (const candidate of [path.dirname(file), path.dirname(fs.realpathSync(file))]) {
    let current = '/';
    for (const component of candidate.split('/').filter(Boolean)) {
      current = path.join(current, component);
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) {
        throw new Error('BUSTER_NATIVE_SWARM_CONFIG_NOT_TRUSTED');
      }
    }
  }
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) {
    throw new Error('BUSTER_NATIVE_SWARM_CONFIG_NOT_TRUSTED');
  }
}
