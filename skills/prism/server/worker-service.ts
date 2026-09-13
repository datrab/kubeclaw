import { type IncomingMessage, type ServerResponse } from "node:http";
import type {
  PrismEngine,
} from "../engine/index.ts";
import {
  validatePipelineWorkerCoreContract,
  validateWorkerResourceContractV3,
  type WorkerAttemptEnvelopeV1,
  type WorkerAttemptResultV1, type WorkerAttemptEnvelopeV3, type WorkerAttemptResultV3,
} from "@kubeclaw/pipeline-worker-core-contract";
import type { WorkerArtifactClient } from "./worker-artifacts.ts";
import { executeWorkerAttempt } from "./worker-attempt.ts";
import { type WorkerNonceDatabase, WorkerDependencyUnavailable } from "./worker-readiness.ts";
import { createManagedWorkerServer } from "./worker-lifecycle.ts";
import { authorizeProxiedSpiffePeer, NativeWorkerAttemptBusy } from "@kubeclaw/worker-core";
import { workerIngressLimits } from './worker-config.ts';

export type WorkerAuthentication =
  | { mode: "hmac"; secret: string; database: WorkerNonceDatabase }
  | { mode: "spiffe"; trustedControlSpiffeId: string };

export interface NativePrismWorkerExecution {
  ready(): boolean;
  execute(envelope: WorkerAttemptEnvelopeV3, signal: AbortSignal): Promise<WorkerAttemptResultV3>;
}

export function createNativeWorkerServer(auth: WorkerAuthentication, execution: NativePrismWorkerExecution, limits = workerIngressLimits()) {
  return createManagedWorkerServer(
    (request, response, signal) => handleWorkerRequest(auth, null, null, request, response, signal, { maximumInputBytes: limits.maximumInputBytes, native: execution }),
    () => auth.mode === 'hmac' ? auth.database.close() : Promise.resolve(),
    limits,
  );
}

export function createWorkerServer(auth: WorkerAuthentication, engine: PrismEngine, artifactClient: WorkerArtifactClient, limits = workerIngressLimits()) {
  return createManagedWorkerServer(
    (request, response, signal) => handleWorkerRequest(auth, engine, artifactClient, request, response, signal, { maximumInputBytes: limits.maximumInputBytes }),
    () => auth.mode === "hmac" ? auth.database.close() : Promise.resolve(),
    limits,
  );
}

async function handleWorkerRequest(auth: WorkerAuthentication, engine: PrismEngine | null, artifactClient: WorkerArtifactClient | null,
  request: IncomingMessage, response: ServerResponse, signal: AbortSignal,
  { maximumInputBytes, native }: { maximumInputBytes: number; native?: NativePrismWorkerExecution }): Promise<WorkerAttemptResultV1 | WorkerAttemptResultV3 | void> {
  if (serveLocalHealth(request, response)) return;
  if (request.url === '/ready') return serveReadiness(auth, response, signal, native);
  if (request.url !== "/v1/attempts" || request.method !== "POST") {
    response.writeHead(404);
    return void response.end();
  }
  try {
    if (
      !(request.headers["content-type"] ?? "")
        .toString()
        .toLowerCase()
        .startsWith("application/json")
    ) {
      response.writeHead(415);
      return void response.end();
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maximumInputBytes)
        throw new Error("Prism attempt request is too large");
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks);
    if (auth.mode === "spiffe") authorizeProxiedSpiffePeer(request.headers, request.socket.remoteAddress, new Set([auth.trustedControlSpiffeId]));
    else await auth.database.authenticate(auth.secret, raw, request.headers, signal);
    const result = await dispatchAttempt(JSON.parse(raw.toString('utf8')), engine, artifactClient, signal, native);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
    return result;
  } catch (error) {
    response.writeHead(error instanceof WorkerDependencyUnavailable || error instanceof NativeWorkerAttemptBusy ? 503 : 422, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "failed",
      }),
    );
  }
}

async function serveReadiness(auth: WorkerAuthentication, response: ServerResponse, signal: AbortSignal,
  native?: NativePrismWorkerExecution): Promise<void> {
  if (native && !native.ready()) {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end('{"status":"not-ready","error":"PRISM_NATIVE_RECONCILIATION_REQUIRED"}');
    return;
  }
  try {
    if (auth.mode === 'hmac') await auth.database.check(signal);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"status":"ready"}');
  } catch {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end('{"status":"not-ready","error":"PRISM_NONCE_DATABASE_UNAVAILABLE"}');
  }
}

async function dispatchAttempt(input: unknown, engine: PrismEngine | null, artifacts: WorkerArtifactClient | null,
  signal: AbortSignal, native?: NativePrismWorkerExecution): Promise<WorkerAttemptResultV1 | WorkerAttemptResultV3> {
  if (native) {
    if (!native.ready()) throw new Error('PRISM_NATIVE_RECONCILIATION_REQUIRED');
    validateWorkerResourceContractV3('workerAttemptEnvelope', input);
    return native.execute(input as WorkerAttemptEnvelopeV3, signal);
  }
  if (!engine || !artifacts) throw new Error('PRISM_WORKER_EXECUTION_CONFIGURATION_REQUIRED');
  validatePipelineWorkerCoreContract('workerAttemptEnvelope', input);
  return executeWorkerAttempt(input as WorkerAttemptEnvelopeV1, engine, artifacts, signal);
}

function serveLocalHealth(request: IncomingMessage, response: ServerResponse): boolean {
  if (request.url === "/health" || request.url === "/bootstrap") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: request.url === "/health" ? "alive" : "initialized" }));
    return true;
  }
  return false;
}
