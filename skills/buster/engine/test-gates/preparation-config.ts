import type { WorkerCorePolicyCapture } from '@kubeclaw/plugin-foundation/config/worker-core-policy';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBusterPreparationRuntimeSource } from './preparation-runtime-source.ts';
import { readNativeWorkerNodeIdentity, readNativeWorkerPoolPolicy, requireNativeWorkerRuntimeIdentity,
  requireNativeWorkerLauncher } from '@kubeclaw/worker-core';
import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { portableJson } from '@kubeclaw/plugin-sdk/values';

export const preparationStateRoot = '/var/lib/buster-v2/plan-jobs';
export const preparationSourceRoot = '/var/lib/buster-v2/native-sources';
export const preparationRuntimeConfig = '/run/kubeclaw-buster/config/runtime.json';
const nativeTrustCaptures = new WeakMap<object, Readonly<{ poolFile: string; settings: string }>>();

/** The root parent reads only bounded immutable configuration; it never constructs providers. */
export function captureNativeBusterPreparationTrust(settings: BusterPreparationSettings, environment: NodeJS.ProcessEnv, workerCore?: WorkerCorePolicyCapture) {
  const poolFile = environment.BUSTER_NATIVE_POOL_POLICY_FILE;
  if (!poolFile) throw new Error('BUSTER_NATIVE_POOL_POLICY_REQUIRED');
  const pool = readNativeWorkerPoolPolicy(poolFile, 'buster', workerCore);
  requireNativeWorkerRuntimeIdentity(pool.runtimeIdentityFile, workerCore);
  if (pool.limits.memoryBytes < settings.resourcePolicy.memoryBytes || pool.limits.tasks < settings.resourcePolicy.tasks
    || pool.maximumActiveScopes < settings.maximumActivePreparations) throw new Error('BUSTER_NATIVE_POOL_CAPACITY_INVALID');
  const engineContentDigest = environment.BUSTER_ENGINE_CONTENT_DIGEST;
  if (!/^sha256:[a-f0-9]{64}$/u.test(engineContentDigest ?? '')) throw new Error('BUSTER_NATIVE_ENGINE_IDENTITY_REQUIRED');
  const launcher = '/usr/local/libexec/kubeclaw-native-worker-launcher';
  requireNativeWorkerLauncher(launcher);
  requireNativeWorkerLauncher('/usr/local/libexec/kubeclaw-buster-lifetime-guardian');
  requireNativeWorkerLauncher(process.execPath);
  requireNativeWorkerLauncher(fileURLToPath(import.meta.resolve('@kubeclaw/plugin-foundation/isolation/plugin-sandbox')));
  const captured = Object.freeze({ pool, launcher, engineContentDigest: engineContentDigest!,
    nodeIdentity: readNativeWorkerNodeIdentity(pool.nodeIdentityFile, workerCore), tarExecutable: '/usr/bin/tar' });
  nativeTrustCaptures.set(captured, Object.freeze({ poolFile, settings: portableJson(settings) }));
  return captured;
}

/** Generated runtime read is separate from the recovery-only pool/node/code trust capture. */
export function nativeBusterPreparationConfig(settings: BusterPreparationSettings, environment: NodeJS.ProcessEnv, workerCore?: WorkerCorePolicyCapture) {
  const trusted = captureNativeBusterPreparationTrust(settings, environment, workerCore);
  const runtime = readRootConfiguration(settings.maximumInputBytes);
  const captured = Object.freeze({ ...trusted, ...readBusterPreparationRuntimeSource(runtime, environment) });
  nativeTrustCaptures.set(captured, nativeTrustCaptures.get(trusted)!);
  return captured;
}

/** Internal provenance for the archive creator, not an environment decoder. */
export function originalNativeBusterHostPoolFile(captured: ReturnType<typeof captureNativeBusterPreparationTrust>,
  settings: BusterPreparationSettings): string {
  const original = nativeTrustCaptures.get(captured);
  if (!original || original.settings !== portableJson(settings)) {
    throw new Error('BUSTER_NATIVE_VERIFIED_TRUST_CAPTURE_REQUIRED');
  }
  return original.poolFile;
}

/** Full legacy fact capture additionally requires the runtime/source binding.
 * A genuine HOST-only capture must never be promoted to source trust.
 */
export function originalNativeBusterPoolFile(captured: ReturnType<typeof nativeBusterPreparationConfig>,
  settings: BusterPreparationSettings): string {
  const poolFile = originalNativeBusterHostPoolFile(captured, settings);
  if (typeof captured.sourceAttestationPublicKey !== 'string'
    || typeof captured.trustedSourceAuthority !== 'string' || typeof captured.stateRoot !== 'string') {
    throw new Error('BUSTER_NATIVE_VERIFIED_TRUST_CAPTURE_REQUIRED');
  }
  return poolFile;
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
