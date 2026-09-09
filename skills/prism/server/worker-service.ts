import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  PrismEngine,
} from "../engine/index.ts";
import {
  validatePipelineWorkerCoreContract,
  type WorkerAttemptEnvelopeV1,
} from "@kubeclaw/pipeline-worker-core-contract";
import type { WorkerArtifactClient } from "./worker-artifacts.ts";
import { executeWorkerAttempt } from "./worker-attempt.ts";
import { type WorkerNonceDatabase, WorkerDependencyUnavailable } from "./worker-readiness.ts";
import { authorizeProxiedSpiffePeer } from "@kubeclaw/worker-core";

export type WorkerAuthentication =
  | { mode: "hmac"; secret: string; database: WorkerNonceDatabase }
  | { mode: "spiffe"; trustedControlSpiffeId: string };

export function createWorkerServer(auth: WorkerAuthentication, engine: PrismEngine, artifactClient: WorkerArtifactClient) {
return createServer((request, response) => {
  void handleWorkerRequest(auth, engine, artifactClient, request, response);
});
}

async function handleWorkerRequest(auth: WorkerAuthentication, engine: PrismEngine, artifactClient: WorkerArtifactClient, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const cancellation = new AbortController();
  response.once("close", () => cancellation.abort());
  if (serveLocalHealth(request, response)) return;
  if (request.url === "/ready") {
    try {
      if (auth.mode === "hmac") await auth.database.check(cancellation.signal);
      response.writeHead(200, { "content-type": "application/json" });
      return void response.end('{"status":"ready"}');
    } catch {
      response.writeHead(503, { "content-type": "application/json" });
      return void response.end('{"status":"not-ready","error":"PRISM_NONCE_DATABASE_UNAVAILABLE"}');
    }
  }
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
      if (size > 16_000_000)
        throw new Error("Prism attempt request is too large");
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks);
    if (auth.mode === "spiffe") authorizeProxiedSpiffePeer(request.headers, request.socket.remoteAddress, new Set([auth.trustedControlSpiffeId]));
    else await auth.database.authenticate(auth.secret, raw, request.headers, cancellation.signal);
    const input = JSON.parse(raw.toString("utf8")) as WorkerAttemptEnvelopeV1;
    validatePipelineWorkerCoreContract("workerAttemptEnvelope", input);
    const result = await executeWorkerAttempt(input, engine, artifactClient);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(error instanceof WorkerDependencyUnavailable ? 503 : 422, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "failed",
      }),
    );
  }
}

function serveLocalHealth(request: IncomingMessage, response: ServerResponse): boolean {
  if (request.url === "/health" || request.url === "/bootstrap") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: request.url === "/health" ? "alive" : "initialized" }));
    return true;
  }
  return false;
}
