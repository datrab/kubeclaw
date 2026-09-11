import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { WorkerAttemptResultV1 } from '@kubeclaw/pipeline-worker-core-contract';

type Handler = (request: IncomingMessage, response: ServerResponse, signal: AbortSignal) => Promise<WorkerAttemptResultV1 | void>;
export type ManagedWorkerServer = Server & { shutdown(timeoutMs: number): Promise<void> };

/** A fulfilled HTTP handler is not evidence that unresolved Core work stopped. */
function unresolved(result: WorkerAttemptResultV1 | void): boolean {
  return Boolean(result && (result.cleanup.state === 'failed'
    || result.error?.code === 'WORKER_PHASE_UNRESOLVED'
    || result.error?.code === 'WORKER_TERMINATION_FAILED'));
}
function unavailable(response: ServerResponse): void {
  response.writeHead(503, { 'content-type': 'application/json', connection: 'close' });
  response.end('{"status":"not-ready","error":"PRISM_WORKER_STOPPING"}');
}

export function createManagedWorkerServer(handler: Handler, closeDependencies: () => Promise<void>): ManagedWorkerServer {
  return new WorkerLifecycle(handler, closeDependencies).server;
}

class WorkerLifecycle {
  readonly server: ManagedWorkerServer;
  private readonly active = new Map<Promise<void>, { controller: AbortController; response: ServerResponse }>();
  private stopping = false;
  private unsafe = false;
  private shutdownWork: Promise<void> | undefined;
  private readonly handler: Handler;
  private readonly closeDependencies: () => Promise<void>;
  constructor(handler: Handler, closeDependencies: () => Promise<void>) {
    this.handler = handler;
    this.closeDependencies = closeDependencies;
    this.server = Object.assign(createServer((request, response) => this.accept(request, response)), {
      shutdown: (timeoutMs: number) => this.shutdown(timeoutMs),
    });
  }
  private accept(request: IncomingMessage, response: ServerResponse): void {
    if (this.stopping || this.unsafe) { unavailable(response); return; }
    const cancellation = new AbortController();
    const disconnect = () => { if (!response.writableEnded) cancellation.abort(); };
    const interruptBody = () => { if (!request.complete) request.destroy(); };
    response.once('close', disconnect);
    cancellation.signal.addEventListener('abort', interruptBody, { once: true });
    const work = this.handler(request, response, cancellation.signal)
      .then(result => { if (unresolved(result)) this.unsafe = true; })
      .catch(() => { this.unsafe = true; response.destroy(); })
      .finally(() => {
        response.removeListener('close', disconnect);
        cancellation.signal.removeEventListener('abort', interruptBody);
        this.active.delete(work);
      });
    this.active.set(work, { controller: cancellation, response });
  }
  private shutdown(timeoutMs: number): Promise<void> {
    if (this.shutdownWork) return this.shutdownWork;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
      return Promise.reject(new Error('Invalid Prism worker shutdown deadline'));
    }
    // Admission closes synchronously, including already connected keepalive peers.
    this.stopping = true;
    const deadline = performance.now() + timeoutMs;
    const closed = new Promise<void>((resolve, reject) => this.server.close(error => {
      if (error && !("code" in error && error.code === 'ERR_SERVER_NOT_RUNNING')) reject(error); else resolve();
    }));
    this.server.closeIdleConnections();
    for (const { controller, response } of this.active.values()) {
      response.shouldKeepAlive = false;
      controller.abort(new Error('PRISM_WORKER_SHUTDOWN'));
    }
    this.shutdownWork = this.drain(closed, deadline);
    return this.shutdownWork;
  }
  private async drain(closed: Promise<void>, deadline: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const dependencies = (async () => {
      await Promise.all(this.active.keys());
      this.server.closeIdleConnections();
      await this.closeDependencies();
    })();
    const work = Promise.all([dependencies, closed]).then(() => {
      if (this.unsafe) throw new Error('PRISM_WORKER_SHUTDOWN_UNRESOLVED');
    });
    try {
      await Promise.race([work, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PRISM_WORKER_SHUTDOWN_DEADLINE')), Math.max(1, deadline - performance.now()));
      })]);
    } catch (error) {
      // This is a connection cutoff, never a claim that arbitrary work was reaped.
      this.server.closeAllConnections();
      throw error;
    } finally { if (timer) clearTimeout(timer); }
  }
}
