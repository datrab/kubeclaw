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

  constructor(options: BusterRemotePlanRuntimeOptions) {
    if (options.host.length === 0) throw new Error('BUSTER_REMOTE_HOST_INVALID');
    if (!Number.isSafeInteger(options.port) || options.port < 0 || options.port > 65_535) {
      throw new Error('BUSTER_REMOTE_PORT_INVALID');
    }
    if (!Number.isSafeInteger(options.shutdownTimeoutMs) || options.shutdownTimeoutMs < 1) {
      throw new Error('BUSTER_REMOTE_SHUTDOWN_TIMEOUT_INVALID');
    }
    this.#options = options;
    this.#server = createBusterRemotePlanHttpServer(options);
  }

  async start(): Promise<AddressInfo> {
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

  async stop(): Promise<void> {
    if (!this.#started) return;
    this.#started = false;
    const close = new Promise<void>((resolve, reject) => {
      this.#server.close((error) => error ? reject(error) : resolve());
    });
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        close,
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            this.#server.closeAllConnections();
            resolve();
          }, this.#options.shutdownTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      await this.#options.service.shutdown(this.#options.shutdownTimeoutMs);
    }
  }
}
