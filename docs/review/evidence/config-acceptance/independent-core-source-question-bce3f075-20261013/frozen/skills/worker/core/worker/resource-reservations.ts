import type { NativeWorkerScopeLimits } from './native-resource-scope.ts';

export class NativeWorkerCapacityExceeded extends Error {
  constructor() { super('WORKER_NATIVE_CAPACITY_EXCEEDED'); }
}

function positive(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('WORKER_NATIVE_CAPACITY_INVALID');
}

/** Synchronous reservations include pending filesystem allocation, not just running hosts. */
export class WorkerResourceReservations {
  readonly #maximum: NativeWorkerScopeLimits;
  readonly #maximumScopes: number;
  #memoryBytes = 0;
  #tasks = 0;
  #scopes = 0;

  constructor(maximum: NativeWorkerScopeLimits, maximumScopes: number) {
    positive(maximum.memoryBytes); positive(maximum.tasks); positive(maximumScopes);
    this.#maximum = Object.freeze({ ...maximum });
    this.#maximumScopes = maximumScopes;
  }

  reserve(limits: NativeWorkerScopeLimits): () => void {
    const { memoryBytes, tasks } = limits;
    positive(memoryBytes); positive(tasks);
    if (this.#scopes >= this.#maximumScopes || memoryBytes > this.#maximum.memoryBytes - this.#memoryBytes
      || tasks > this.#maximum.tasks - this.#tasks) throw new NativeWorkerCapacityExceeded();
    this.#memoryBytes += memoryBytes; this.#tasks += tasks; this.#scopes++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#memoryBytes -= memoryBytes; this.#tasks -= tasks; this.#scopes--;
    };
  }
}
