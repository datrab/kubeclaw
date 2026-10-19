import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createBusterRemotePlanHttpServer } from './remote-plan-http.ts';
import type { BusterRemotePlanService } from './remote-plan-service.ts';

export interface BusterRemotePlanRuntimeOptions {
  readonly service: BusterRemotePlanService;
  readonly host: string;
  readonly port: number;
  readonly token?: string;
  readonly trustedPeerSpiffeIds?: readonly string[];
  readonly maximumRequestBytes: number;
  readonly maximumResponseBytes: number;
  readonly maximumResultBytes: number;
  readonly shutdownTimeoutMs: number;
  readonly tls?: Readonly<{ key: string | Buffer; cert: string | Buffer }>;
}

export class BusterRemotePlanRuntime {
  readonly #options: BusterRemotePlanRuntimeOptions;
  readonly #server: Server;
  #started = false;
  #stop: Promise<void> | undefined;

  constructor(options: BusterRemotePlanRuntimeOptions) {
    if (options.host.length === 0) throw new Error('BUSTER_REMOTE_HOST_INVALID');
    if (!Number.isSafeInteger(options.port) || options.port < 0 || options.port > 65_535) {
      throw new Error('BUSTER_REMOTE_PORT_INVALID');
    }
    if (!Number.isSafeInteger(options.shutdownTimeoutMs) || options.shutdownTimeoutMs < 1
      || options.shutdownTimeoutMs > 0x7fffffff) {
      throw new Error('BUSTER_REMOTE_SHUTDOWN_TIMEOUT_INVALID');
    }
    this.#options = options;
    this.#server = createBusterRemotePlanHttpServer(options);
  }

  async start(): Promise<AddressInfo> {
    if (this.#stop) throw new Error('BUSTER_REMOTE_RUNTIME_STOPPED');
    if (this.#started) throw new Error('BUSTER_REMOTE_RUNTIME_ALREADY_STARTED');
    await this.#options.service.recover();
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      this.#server.once('error', onError);
      this.#server.listen(this.#options.port, this.#options.host, () => {
        this.#server.off('error', onError);
        resolve();
      });
    });
    this.#started = true;
    const address = this.#server.address();
    if (!address || typeof address === 'string') throw new Error('BUSTER_REMOTE_ADDRESS_INVALID');
    return address;
  }

  stop(): Promise<void> {
    if (this.#stop) return this.#stop;
    if (!this.#started) return Promise.resolve();
    this.#started = false;
    this.#stop = this.#drain();
    return this.#stop;
  }

  async #drain(): Promise<void> {
    // This is only the captured S process-drain ceiling, not an original task
    // cleanup deadline or authority. Start service shutdown before waiting for
    // HTTP: admission closes immediately and neither drain gets a fresh budget.
    let shutdownFailure: { error: unknown } | undefined;
    const shutdown = this.#options.service.shutdown(this.#options.shutdownTimeoutMs).catch((error: unknown) => {
      shutdownFailure = { error };
      throw error;
    });
    const close = new Promise<void>((resolve, reject) => {
      this.#server.close((error) => error ? reject(error) : resolve());
    });
    let timer: NodeJS.Timeout | undefined;
    try {
      const outcomes = await Promise.race([
        Promise.allSettled([close, shutdown]),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            this.#server.closeAllConnections();
            const timeout = new Error('BUSTER_REMOTE_SHUTDOWN_TIMEOUT');
            reject(shutdownFailure
              ? new AggregateError([shutdownFailure.error, timeout], 'BUSTER_REMOTE_SHUTDOWN_FAILED')
              : timeout);
          }, this.#options.shutdownTimeoutMs);
        }),
      ]);
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') throw outcome.reason;
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
