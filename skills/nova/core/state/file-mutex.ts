import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

/** Synchronous, non-reentrant Linux flock over a stable inode. Never unlink it. */
export class FileMutex {
  readonly #file: string; readonly #timeoutMs: number; readonly #timeoutCode: string;
  constructor(file: string, timeoutMs: number, timeoutCode: string) { this.#file = file; this.#timeoutMs = timeoutMs; this.#timeoutCode = timeoutCode; }
  withLock<T>(operation: () => T): T {
    const descriptor = fs.openSync(this.#file, 'a', 0o600);
    try {
      // fd 3 shares the parent's open file description. The kernel lock remains
      // held after flock exits and is released when the parent closes its fd.
      const acquired = spawnSync('/usr/bin/flock', ['--exclusive', '--timeout', String(this.#timeoutMs / 1000), '--conflict-exit-code', '75', '3'], {
        stdio: ['ignore', 'ignore', 'pipe', descriptor],
      });
      if (acquired.error) throw new Error(`FILE_MUTEX_ACQUIRE_FAILED:${this.#file}`, { cause: acquired.error });
      if (acquired.status === 75) throw new Error(this.#timeoutCode);
      if (acquired.status !== 0) throw new Error(`FILE_MUTEX_ACQUIRE_FAILED:${this.#file}:${acquired.status}:${acquired.signal}:${acquired.stderr?.toString().trim()}`);
      return operation();
    } finally {
      fs.closeSync(descriptor);
    }
  }
}
