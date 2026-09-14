import fs from 'node:fs';
import path from 'node:path';

/** These are the same narrowly scoped privileges required by the non-setuid launcher. */
export function requireNativeWorkerSupervisorAuthority(): void {
  const capabilities = /^CapEff:\s*([a-f0-9]+)$/mu.exec(fs.readFileSync('/proc/self/status', 'utf8'))?.[1];
  const required = (1n << 5n) | (1n << 6n) | (1n << 7n); // KILL, SETGID, SETUID
  if (process.getuid?.() !== 0 || process.geteuid?.() !== 0 || !capabilities
    || (BigInt(`0x${capabilities}`) & required) !== required) throw new Error('WORKER_NATIVE_SUPERVISOR_AUTHORITY_REQUIRED');
}

/** Only an immutable-image, root-owned ordinary executable is accepted; never a setuid helper. */
export function requireNativeWorkerLauncher(file: string): void {
  if (!path.isAbsolute(file) || fs.realpathSync(file) !== file) throw new Error('WORKER_NATIVE_LAUNCHER_PATH_INVALID');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o6022) !== 0 || (stat.mode & 0o100) === 0) {
      throw new Error('WORKER_NATIVE_LAUNCHER_NOT_TRUSTED');
    }
  } finally { fs.closeSync(fd); }
}
