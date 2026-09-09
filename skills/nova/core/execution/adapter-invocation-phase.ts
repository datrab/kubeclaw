import type { AttemptIdentity } from '@kubeclaw/plugin-sdk';

export interface AdapterInvocationOwner {
  readonly adapterId: string;
  readonly signal: AbortSignal;
  readonly attempt: AttemptIdentity;
  readonly executionKey?: string;
  readonly phase: AdapterInvocationPhase;
}

/** One non-renewable cleanup allowance for one active, still-authorized adapter invocation. */
export class AdapterInvocationPhase {
  #closed = false;
  #cleanupStarted = false;
  #cleanupController: AbortController | undefined;
  readonly #lifecycle: AbortSignal;
  readonly #timeoutMs: number;
  constructor(lifecycle: AbortSignal, timeoutMs: number) {
    this.#lifecycle = lifecycle;
    this.#timeoutMs = timeoutMs;
  }
  assertActive(): void {
    if (this.#closed) throw new Error('ADAPTER_INVOCATION_CLOSED');
    if (this.#lifecycle.aborted) throw new Error('ADAPTER_CONTEXT_REVOKED');
  }
  close(): void {
    this.#closed = true;
    this.#cleanupController?.abort(new Error('ADAPTER_INVOCATION_CLOSED'));
  }
  async cleanup<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.assertActive();
    if (this.#cleanupStarted) throw new Error('ADAPTER_CLEANUP_ALREADY_STARTED');
    this.#cleanupStarted = true;
    const controller = new AbortController();
    this.#cleanupController = controller;
    const signal = AbortSignal.any([controller.signal, this.#lifecycle]);
    const timeout = new Error('ADAPTER_CLEANUP_TIMEOUT');
    const deadline = Date.now() + this.#timeoutMs;
    const timer = setTimeout(() => controller.abort(timeout), this.#timeoutMs);
    let abort!: () => void;
    const expired = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    try {
      const result = await Promise.race([Promise.resolve().then(() => operation(signal)), expired]);
      if (Date.now() >= deadline) throw timeout;
      signal.throwIfAborted();
      return result;
    }
    finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      controller.abort(new Error('ADAPTER_CLEANUP_CLOSED'));
    }
  }
}
