import fs from 'node:fs';
import path from 'node:path';
import { createHash, createPublicKey } from 'node:crypto';
import { portableJson } from '@kubeclaw/plugin-sdk/values';
import { requireNativeWorkerRuntimeIdentity, readNativeWorkerNodeIdentity, readNativeWorkerPoolPolicy } from '@kubeclaw/worker-core';
import { assertPipelineBootCapture, type PipelineBootCapture } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';
import { projectBusterSettings } from '@kubeclaw/plugin-foundation/config/pipeline-composition';
import { originalNativeBusterPoolFile, originalNativeBusterHostPoolFile, captureNativeBusterPreparationTrust, nativeBusterPreparationConfig } from './preparation-config.ts';

type Native = ReturnType<typeof nativeBusterPreparationConfig>;
const verifiedFacts = new WeakSet<object>();
const verifiedHostFacts = new WeakSet<object>();
const hash = (bytes: Uint8Array): `sha256:${string}` => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const same = (a: fs.BigIntStats, b: fs.BigIntStats): boolean =>
  ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].every(key =>
    a[key as keyof fs.BigIntStats] === b[key as keyof fs.BigIntStats]);

/** Effect-free INITIAL host branch: selected immutable preparation policy plus
 * real host/code/kernel evidence, BEFORE any generated runtime/config file.
 * Source verifier/authority/shutdown policy is deliberately NOT inferred here.
 * These host facts alone cannot publish or activate an original boot capsule.
 */
export function captureInitialBusterNativeHostFacts(boot: PipelineBootCapture, environment: NodeJS.ProcessEnv) {
  if (process.getuid?.() !== 0) throw new Error('BUSTER_NATIVE_BOOT_FACT_SUPERVISOR_REQUIRED');
  assertPipelineBootCapture(boot, 'buster-preparation');
  const preparation = projectBusterSettings(boot, 'buster-preparation').preparation;
  return captureOriginalBusterNativeHostFacts(boot, captureNativeBusterPreparationTrust(preparation, environment));
}

export function captureOriginalBusterNativeHostFacts(boot: PipelineBootCapture,
  native: ReturnType<typeof captureNativeBusterPreparationTrust>) {
  if (process.getuid?.() !== 0) throw new Error('BUSTER_NATIVE_BOOT_FACT_SUPERVISOR_REQUIRED');
  assertPipelineBootCapture(boot, 'buster-preparation');
  const preparation = projectBusterSettings(boot, 'buster-preparation').preparation;
  const poolFile = originalNativeBusterHostPoolFile(native, preparation);
  const observations: { file: string; fd: number; before: fs.BigIntStats; directory?: boolean }[] = [];
  const ancestors = new Set<string>();
  const ancestry = (location: string): void => {
    if (!path.isAbsolute(location) || path.resolve(location) !== location) throw new Error('BUSTER_NATIVE_BOOT_FACT_PATH_INVALID');
    let current = '/';
    for (const part of ['', ...path.dirname(location).split('/').filter(Boolean)]) {
      if (part) current = path.join(current, part);
      if (ancestors.has(current)) continue;
      const fd = fs.openSync(current, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      const before = fs.fstatSync(fd, { bigint: true });
      observations.push({ file: current, fd, before, directory: true });
      if (!before.isDirectory() || before.uid !== 0n || (before.mode & 0o022n) !== 0n) throw new Error('BUSTER_NATIVE_BOOT_FACT_ANCESTOR_NOT_TRUSTED');
      ancestors.add(current);
    }
  };
  const file = (name: string, location: string) => {
    ancestry(location);
    const fd = fs.openSync(location, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const before = fs.fstatSync(fd, { bigint: true });
    observations.push({ file: location, fd, before });
    if (!before.isFile() || before.uid !== 0n || before.nlink !== 1n || (before.mode & 0o022n) !== 0n) {
      throw new Error('BUSTER_NATIVE_BOOT_FACT_FILE_NOT_TRUSTED');
    }
    const bytes = fs.readFileSync(fd);
    return Object.freeze({ name, file: location, byteLength: bytes.byteLength, digest: hash(bytes), bytes: bytes.toString('base64'),
      mode: Number(before.mode & 0o777n), uid: Number(before.uid), gid: Number(before.gid),
      device: String(before.dev), inode: String(before.ino) });
  };
  const directory = (location: string, kernel: boolean) => {
    ancestry(location);
    const fd = fs.openSync(location, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    const before = fs.fstatSync(fd, { bigint: true });
    observations.push({ file: location, fd, before, directory: true });
    if (!before.isDirectory() || before.uid !== 0n || (before.mode & 0o022n) !== 0n
      || (kernel && fs.statfsSync(location).type !== 0x63677270)) throw new Error('BUSTER_NATIVE_BOOT_FACT_DIRECTORY_NOT_TRUSTED');
    return Object.freeze({ file: location, device: String(before.dev), inode: String(before.ino) });
  };
  try {
    const files = [file('pool-policy', poolFile), file('node-identity', native.pool.nodeIdentityFile),
      file('runtime-identity', native.pool.runtimeIdentityFile), file('native-launcher', native.launcher),
      file('service-lifetime-guardian', '/usr/local/libexec/kubeclaw-buster-lifetime-guardian'),
      file('node-executable', process.execPath), file('tar-executable', native.tarExecutable)];
    const pool = directory(native.pool.cgroupRoot, true), ownershipStore = directory(native.pool.ownershipRoot, false);
    if (portableJson(readNativeWorkerPoolPolicy(poolFile, 'buster')) !== portableJson(native.pool)
      || readNativeWorkerNodeIdentity(native.pool.nodeIdentityFile) !== native.nodeIdentity) {
      throw new Error('BUSTER_NATIVE_BOOT_FACT_IDENTITY_CHANGED');
    }
    requireNativeWorkerRuntimeIdentity(native.pool.runtimeIdentityFile);
    const bootId = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    const namespace = fs.statSync('/proc/self/ns/cgroup', { bigint: true });
    for (const observation of observations) {
      for (const after of [fs.fstatSync(observation.fd, { bigint: true }), fs.lstatSync(observation.file, { bigint: true })]) {
        const current = observation.directory ? after.isDirectory() && ['dev', 'ino', 'mode', 'uid', 'gid'].every(key =>
          observation.before[key as keyof fs.BigIntStats] === after[key as keyof fs.BigIntStats]) : same(observation.before, after);
        if (!current) throw new Error('BUSTER_NATIVE_BOOT_FACT_IDENTITY_CHANGED');
      }
    }
    const captured = Object.freeze({ schemaVersion: 'buster-native-host-boot-facts.v1' as const,
      generationDigest: boot.selectionReceipt.generationDigest, packageReceiptDigest: boot.selectionReceipt.packageReceiptDigest,
      selectionDigest: boot.selectionReceipt.digest, imageReceiptDigest: boot.bootProvenance.expectedReceipt.imageReceiptDigest,
      preparation,
      native: Object.freeze({ pool: native.pool, engineContentDigest: native.engineContentDigest,
        nodeIdentity: native.nodeIdentity }),
      kernel: Object.freeze({ bootId, namespace: Object.freeze({ device: String(namespace.dev), inode: String(namespace.ino) }), pool }),
      ownershipStore, files: Object.freeze(files) });
    verifiedHostFacts.add(captured);
    return captured;
  } finally { for (const { fd } of observations) fs.closeSync(fd); }
}

export function assertOriginalBusterNativeHostFacts(value: unknown): asserts value is ReturnType<typeof captureOriginalBusterNativeHostFacts> {
  if (!value || typeof value !== 'object' || !verifiedHostFacts.has(value)) throw new Error('BUSTER_NATIVE_VERIFIED_HOST_FACTS_REQUIRED');
}

/** Existing complete capture retains its original wire and source requirements.
 * This wrapper STILL depends on nativeBusterPreparationConfig's runtime/source
 * binding; it is NOT the new INITIAL coordinator or permission to use current B.
 */
export function captureOriginalBusterNativeBootFacts(boot: PipelineBootCapture, native: Native) {
  assertPipelineBootCapture(boot, 'buster-preparation');
  const preparation = projectBusterSettings(boot, 'buster-preparation').preparation;
  originalNativeBusterPoolFile(native, preparation);
  const host = captureOriginalBusterNativeHostFacts(boot, native);
  const captured = Object.freeze({ ...host, schemaVersion: 'buster-native-boot-facts.v1' as const,
    native: Object.freeze({ ...host.native,
      sourceAttestationPublicKey: createPublicKey(native.sourceAttestationPublicKey).export({ type: 'spki', format: 'pem' }).toString(),
      trustedSourceAuthority: native.trustedSourceAuthority, stateRoot: native.stateRoot,
      serviceShutdownTimeoutMs: native.serviceShutdownTimeoutMs }) });
  verifiedFacts.add(captured);
  return captured;
}

export function assertOriginalBusterNativeBootFacts(value: unknown): asserts value is ReturnType<typeof captureOriginalBusterNativeBootFacts> {
  if (!value || typeof value !== 'object' || !verifiedFacts.has(value)) throw new Error('BUSTER_NATIVE_VERIFIED_BOOT_FACTS_REQUIRED');
}
