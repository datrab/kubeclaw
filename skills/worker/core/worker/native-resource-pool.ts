import fs from 'node:fs';
import path from 'node:path';
import { NativeWorkerResourceScope, type NativeWorkerScopeLimits } from './native-resource-scope.ts';
import { WorkerResourceReservations } from './resource-reservations.ts';

export interface NativeWorkerPoolLimits extends NativeWorkerScopeLimits {
  readonly cpuQuotaMicroseconds: number;
  readonly cpuPeriodMicroseconds: number;
}

/** Host setup owns configuration. Workers only verify the real aggregate boundary. */
export class NativeWorkerResourcePool {
  readonly #root: string;
  readonly #device: number;
  readonly #inode: number;
  readonly #limits: NativeWorkerPoolLimits;
  readonly #reservations: WorkerResourceReservations;

  constructor(root: string, limits: NativeWorkerPoolLimits, maximumScopes: number) {
    NativeWorkerResourceScope.inventory(root); // Reject substituted filesystems before any capacity claim.
    this.#root = fs.realpathSync(root);
    const stat = fs.statSync(this.#root);
    this.#device = stat.dev; this.#inode = stat.ino;
    this.#limits = Object.freeze({ ...limits });
    this.#reservations = new WorkerResourceReservations(limits, maximumScopes);
    if (!Number.isSafeInteger(limits.cpuQuotaMicroseconds) || limits.cpuQuotaMicroseconds < 1000
      || !Number.isSafeInteger(limits.cpuPeriodMicroseconds) || limits.cpuPeriodMicroseconds < 1000
      || limits.cpuPeriodMicroseconds > 1000000) throw new Error('WORKER_NATIVE_POOL_CPU_INVALID');
    this.verify();
  }

  verify(): void {
    const stat = fs.statSync(this.#root);
    if (stat.dev !== this.#device || stat.ino !== this.#inode || fs.statfsSync(this.#root).type !== 0x63677270) {
      throw new Error('WORKER_NATIVE_POOL_IDENTITY_CHANGED');
    }
    const values: Record<string, string> = {
      'memory.max': String(this.#limits.memoryBytes), 'memory.swap.max': '0',
      'pids.max': String(this.#limits.tasks),
      'cpu.max': `${this.#limits.cpuQuotaMicroseconds} ${this.#limits.cpuPeriodMicroseconds}`,
    };
    for (const [file, expected] of Object.entries(values)) {
      if (fs.readFileSync(path.join(this.#root, file), 'utf8').trim() !== expected) {
        throw new Error(`WORKER_NATIVE_POOL_LIMIT_MISMATCH:${file}`);
      }
    }
    NativeWorkerResourceScope.inventory(this.#root);
    const after = fs.statSync(this.#root);
    if (after.dev !== this.#device || after.ino !== this.#inode) throw new Error('WORKER_NATIVE_POOL_IDENTITY_CHANGED');
  }

  reserve(limits: NativeWorkerScopeLimits): () => void {
    this.verify();
    return this.#reservations.reserve(limits);
  }
}
