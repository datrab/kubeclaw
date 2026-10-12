export interface IngressLimits { maxQueueEvents: number; maxQueueBytes: number; drainTimeoutMs: number }

export function ingressLimits(config: Readonly<Record<string, unknown>>): IngressLimits {
  const limits = { maxQueueEvents: 256, maxQueueBytes: 1024 * 1024, drainTimeoutMs: 5000 };
  const maxima = { maxQueueEvents: 10_000, maxQueueBytes: 16 * 1024 * 1024, drainTimeoutMs: 60_000 };
  for (const key of Object.keys(limits) as Array<keyof IngressLimits>) {
    const value = config[key] ?? limits[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maxima[key]) throw new Error(`AGENT_EVENT_LIMIT_INVALID:${key}`);
    limits[key] = value;
  }
  return limits;
}

export class IngressQueue<T> {
  readonly #limits: IngressLimits;
  readonly #emit: (value: T) => Promise<void>;
  readonly #queue: Array<{ value: T; bytes: number }> = [];
  #pending: Promise<void> | undefined;
  #bytes = 0;
  #emitted = 0;
  #failures = 0;
  #rejected = 0;
  #lastError: string | null = null;

  constructor(limits: IngressLimits, emit: (value: T) => Promise<void>) { this.#limits = limits; this.#emit = emit; }

  enqueue(value: T): void {
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (this.#queue.length >= this.#limits.maxQueueEvents || bytes + this.#bytes > this.#limits.maxQueueBytes) {
      this.#rejected += 1;
      this.#lastError = 'AGENT_EVENT_INGRESS_CAPACITY';
      throw new Error(this.#lastError);
    }
    this.#queue.push({ value, bytes });
    this.#bytes += bytes;
    this.#start();
  }

  #start(): void {
    this.#pending ??= Promise.resolve().then(() => this.#flush()).finally(() => {
      this.#pending = undefined;
      if (this.#queue.length) this.#start();
    });
  }

  async #flush(): Promise<void> {
    while (this.#queue.length) {
      const item = this.#queue[0]!;
      try { await this.#emit(item.value); this.#emitted += 1; }
      catch (error) {
        this.#failures += 1;
        this.#lastError = `AGENT_EVENT_EMIT_FAILED:${error instanceof Error ? error.message : String(error)}`;
      }
      this.#queue.shift();
      this.#bytes -= item.bytes;
    }
  }

  status() {
    return { emitted: this.#emitted, failures: this.#failures, rejected: this.#rejected,
      queued: this.#queue.length, queuedBytes: this.#bytes, lastError: this.#lastError, ...this.#limits };
  }

  async drain(signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED', { cause: signal.reason });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: () => void = () => {};
    const interrupted = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new Error('ADAPTER_CANCELLED', { cause: signal.reason }));
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => reject(new Error(`AGENT_EVENT_DRAIN_TIMEOUT:pending=${this.#queue.length}`)), this.#limits.drainTimeoutMs);
    });
    try { while (this.#pending) await Promise.race([this.#pending, interrupted]); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  }
}
