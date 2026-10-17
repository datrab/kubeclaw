import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { WorkerAttemptResult } from '@kubeclaw/pipeline-worker-core-contract';
import { workerIngressLimits } from './worker-config.ts';

type Handler = (request: IncomingMessage, response: ServerResponse, signal: AbortSignal) => Promise<WorkerAttemptResult | void>;
export type ManagedWorkerServer = Server & { shutdown(timeoutMs: number): Promise<void> };

/** A fulfilled HTTP handler is not evidence that unresolved Core work stopped. */
function unresolved(result: WorkerAttemptResult | void): boolean {
  return Boolean(result && (result.cleanup.state === 'failed'
    || result.error?.code === 'WORKER_PHASE_UNRESOLVED'
    || result.error?.code === 'WORKER_TERMINATION_FAILED'));
}
function unavailable(response: ServerResponse, code = 'PRISM_WORKER_STOPPING'): void {
  response.writeHead(503, { 'content-type': 'application/json', connection: 'close' });
  response.end(JSON.stringify({ status: 'not-ready', error: code }));
}

export function createManagedWorkerServer(handler: Handler, closeDependencies: () => Promise<void>,
  limits = workerIngressLimits()): ManagedWorkerServer {
  return new WorkerLifecycle(handler, closeDependencies, limits).server;
}

class WorkerLifecycle {
  readonly server: ManagedWorkerServer;
  private readonly active = new Map<Promise<void>, { controller: AbortController; response: ServerResponse }>();
  private stopping = false;
  private unsafe = false;
  private shutdownWork: Promise<void> | undefined;
  private readonly handler: Handler;
  private readonly closeDependencies: () => Promise<void>;
  private readonly limits: ReturnType<typeof workerIngressLimits>;
  constructor(handler: Handler, closeDependencies: () => Promise<void>, limits: ReturnType<typeof workerIngressLimits>) {
    if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)) throw new Error('PRISM_WORKER_INGRESS_INVALID');
    this.limits = { ...limits };
    this.handler = handler;
    this.closeDependencies = closeDependencies;
    this.server = Object.assign(createServer((request, response) => this.accept(request, response)), {
      shutdown: (timeoutMs: number) => this.shutdown(timeoutMs),
    });
    this.server.maxConnections = limits.maximumConnections;
    this.server.requestTimeout = limits.requestTimeoutMs;
    this.server.headersTimeout = Math.min(this.server.headersTimeout, limits.requestTimeoutMs);
  }
  private accept(request: IncomingMessage, response: ServerResponse): void {
    if (this.stopping || this.unsafe) { unavailable(response); return; }
    const probe = request.method === 'GET' && ['/health', '/bootstrap', '/ready'].includes(request.url ?? '')
      && !request.headers['transfer-encoding'] && Number(request.headers['content-length'] ?? 0) === 0;
    const capacity = this.limits.maximumActiveRequests + (probe ? this.limits.maximumProbeRequests : 0);
    if (this.active.size >= capacity) { unavailable(response, 'PRISM_WORKER_CAPACITY_EXCEEDED'); return; }
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
