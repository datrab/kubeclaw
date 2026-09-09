export interface EngineCacheLimits {
  readonly maximumInFlight: number;
  readonly maximumCompletedEntries: number;
  readonly maximumCompletedBytes: number;
}
export const DEFAULT_ENGINE_CACHE_LIMITS: EngineCacheLimits = Object.freeze({
  maximumInFlight: 4,
  maximumCompletedEntries: 32,
  maximumCompletedBytes: 16 * 1024 * 1024,
});
type Pending<T> = { fingerprint: string; result: Promise<T>; owner: AbortSignal | undefined };
type Completed = { fingerprint: string; serialized: string; bytes: number };

/** RAM optimization only; durable request/result replay belongs to Control. */
export class EngineExecutionCache<T> {
  readonly #limits: EngineCacheLimits;
  readonly #pending = new Map<string, Pending<T>>();
  readonly #completed = new Map<string, Completed>();
  #completedBytes = 0;

  constructor(limits: EngineCacheLimits = DEFAULT_ENGINE_CACHE_LIMITS) {
    for (const value of [limits.maximumInFlight, limits.maximumCompletedEntries, limits.maximumCompletedBytes]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('PRISM_ENGINE_CACHE_LIMIT_INVALID');
    }
    this.#limits = Object.freeze({ ...limits });
  }

  usage() {
    return Object.freeze({ inFlight: this.#pending.size, completedEntries: this.#completed.size,
      completedBytes: this.#completedBytes, totalEntries: this.#pending.size + this.#completed.size });
  }

  async execute(key: string, fingerprint: string, execute: () => Promise<T>, owner?: AbortSignal): Promise<T> {
    owner?.throwIfAborted();
    const pending = this.#pending.get(key);
    const completed = this.#completed.get(key);
    if ((pending && pending.fingerprint !== fingerprint) || (completed && completed.fingerprint !== fingerprint)) {
      throw new Error('idempotency key was used for a different request');
    }
    if (pending) {
      if (pending.owner !== owner) throw new Error('PRISM_ENGINE_EXECUTION_OWNER_CONFLICT');
      return pending.result;
    }
    if (completed) {
      this.#completed.delete(key);
      this.#completed.set(key, completed);
      return JSON.parse(completed.serialized) as T;
    }
    if (this.#pending.size >= this.#limits.maximumInFlight) throw new Error('PRISM_ENGINE_IN_FLIGHT_LIMIT');
    // Reserve ownership before beginning execution, including synchronous callbacks.
    const result = Promise.resolve().then(() => {
      owner?.throwIfAborted();
      return execute();
    }).then(value => {
      try {
        owner?.throwIfAborted();
        this.#retain(key, fingerprint, value);
        return value;
      } finally { this.#pending.delete(key); }
    }, (error: unknown) => {
      this.#pending.delete(key);
      throw error;
    });
    // Duplicates share the checked retention settlement, never inner execution alone.
    this.#pending.set(key, { fingerprint, result, owner });
    return result;
  }

  #retain(key: string, fingerprint: string, value: T): void {
    const serialized = JSON.stringify(value);
    const bytes = Buffer.byteLength(serialized) + Buffer.byteLength(key) + Buffer.byteLength(fingerprint);
    if (bytes > this.#limits.maximumCompletedBytes) return;
    while (this.#completed.size >= this.#limits.maximumCompletedEntries
      || this.#completedBytes + bytes > this.#limits.maximumCompletedBytes) {
      const oldest = this.#completed.keys().next().value!;
      this.#completedBytes -= this.#completed.get(oldest)!.bytes;
      this.#completed.delete(oldest);
    }
    this.#completed.set(key, { fingerprint, serialized, bytes });
    this.#completedBytes += bytes;
  }
}
