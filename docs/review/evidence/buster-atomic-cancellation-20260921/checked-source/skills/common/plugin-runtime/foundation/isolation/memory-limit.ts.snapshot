import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Query the existing trusted launcher, never a plugin-selected executable. */
export function hostPageSize(): number {
  const result = spawnSync(fileURLToPath(new URL('./plugin-sandbox', import.meta.url)), ['--page-size'], {
    encoding: 'utf8', timeout: 1000, killSignal: 'SIGKILL', maxBuffer: 128,
  });
  if (result.error || result.status !== 0 || !/^\d+\n$/u.test(result.stdout)) {
    throw new Error('ISOLATION_PAGE_SIZE_UNAVAILABLE', { cause: result.error });
  }
  const size = Number(result.stdout);
  if (!Number.isSafeInteger(size) || size <= 0 || 2 ** Math.floor(Math.log2(size)) !== size) {
    throw new Error('ISOLATION_PAGE_SIZE_INVALID');
  }
  return size;
}

/** Cgroup limits are page-granular: the effective ceiling must never grow. */
export function pageAlignedMemoryLimit(memoryBytes: number, pageSize: number): number {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0 || 2 ** Math.floor(Math.log2(pageSize)) !== pageSize) {
    throw new Error('ISOLATION_PAGE_SIZE_INVALID');
  }
  if (!Number.isSafeInteger(memoryBytes)) throw new Error('ISOLATION_MEMORY_LIMIT_INVALID');
  const effective = Math.floor(memoryBytes / pageSize) * pageSize;
  if (effective < 16 * 1024 * 1024 || effective > memoryBytes) throw new Error('ISOLATION_MEMORY_LIMIT_INVALID');
  return effective;
}
