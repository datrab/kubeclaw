import type { TestProviderCapabilityRequest, TestProviderExecutionContext } from '@kubeclaw/plugin-sdk';

export class ProviderCapabilities {
  readonly #controller = new AbortController();
  readonly #pending = new Map<string, { operation: Promise<void>; controller: AbortController }>();
  readonly #maximum: number;
  constructor(maximum = 32) { this.#maximum = maximum; }
  get pending(): number { return this.#pending.size; }

  handle(id: string, capability: string, request: TestProviderCapabilityRequest,
    context: TestProviderExecutionContext, send: (message: unknown) => boolean): Promise<void> {
    if (this.#controller.signal.aborted) return Promise.reject(this.#controller.signal.reason);
    if (this.#pending.has(id)) return Promise.reject(new Error('TEST_PROVIDER_CAPABILITY_DUPLICATE'));
    if (this.#pending.size >= this.#maximum) return Promise.reject(new Error('TEST_PROVIDER_CAPABILITY_LIMIT'));
    const controller = new AbortController();
    const signal = AbortSignal.any([context.signal, this.#controller.signal, controller.signal]);
    const operation = Promise.resolve().then(async () => {
      try {
        if (signal.aborted) throw signal.reason;
        const value = await context.invoke(capability, request, signal);
        if (signal.aborted) throw signal.reason;
        send({ kind: 'capability-result', id, ok: true, value });
      } catch (error) {
        if (!signal.aborted) send({ kind: 'capability-result', id, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }).finally(() => this.#pending.delete(id));
    this.#pending.set(id, { operation, controller });
    return operation;
  }

  cancel(id: string, reason: Error): void { this.#pending.get(id)?.controller.abort(reason); }

  abort(reason: Error): void { this.#controller.abort(reason); }

  async drain(timeoutMs = 1_000): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...this.#pending.values()].map(({ operation }) => operation)),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('TEST_PROVIDER_CAPABILITY_DRAIN_TIMEOUT')), timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }
}
