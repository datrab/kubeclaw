import fs from 'node:fs';
import path from 'node:path';

interface RuntimeIdentity {
  schemaVersion: 1;
  bootId: string;
  cgroupNamespace: { device: string; inode: string };
}

/** Compare the actual namespace with root-managed host evidence; never enter a namespace here. */
export function requireNativeWorkerRuntimeIdentity(file: string): void {
  if (!path.isAbsolute(file)) throw new Error('WORKER_NATIVE_RUNTIME_IDENTITY_PATH_REQUIRED');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || stat.size < 1 || stat.size > 4096) {
      throw new Error('WORKER_NATIVE_RUNTIME_IDENTITY_NOT_TRUSTED');
    }
    const identity = JSON.parse(fs.readFileSync(fd, 'utf8')) as RuntimeIdentity;
    const bootId = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    const namespace = fs.statSync('/proc/self/ns/cgroup', { bigint: true });
    if (identity?.schemaVersion !== 1 || identity.bootId !== bootId
      || identity.cgroupNamespace?.device !== String(namespace.dev)
      || identity.cgroupNamespace?.inode !== String(namespace.ino)) {
      throw new Error('WORKER_NATIVE_HOST_CGROUP_NAMESPACE_REQUIRED');
    }
  } finally { fs.closeSync(fd); }
}
