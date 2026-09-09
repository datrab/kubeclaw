import { createServer } from "node:http";
import {
  PrismEngine,
  DeterministicDesignProvider,
} from "../engine/index.ts";
import {
  validatePipelineWorkerCoreContract,
  type WorkerAttemptEnvelopeV1,
} from "@kubeclaw/pipeline-worker-core-contract";
import { WorkerArtifactClient } from "./worker-artifacts.ts";
import { executeWorkerAttempt } from "./worker-attempt.ts";
import { verifyInternalRequest } from "./internal-auth.ts";
import { PostgresNonceStore } from "./internal-auth.ts";
import { Pool } from "pg";
import { authorizeProxiedSpiffePeer } from "@kubeclaw/worker-core";
const spiffeEnabled = process.env.WORKER_TRUST_SPIFFE_ENABLED === "true";
const workerSecret = process.env.PRISM_WORKER_SECRET ?? "";
if (!spiffeEnabled && !workerSecret) throw new Error("PRISM_WORKER_SECRET is required");
const trustedControlSpiffeId = process.env.PRISM_TRUSTED_CONTROL_SPIFFE_ID ?? "";
if (spiffeEnabled && !trustedControlSpiffeId) throw new Error("Prism worker SPIFFE trust policy is incomplete");
const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const noncePool = new Pool({ connectionString: databaseUrl, max: 4 });
const nonceStore = new PostgresNonceStore(noncePool);
// The worker is intentionally model-free. OpenClaw is the sole owner of LLM
// calls; this deterministic provider only supports bounded render/evaluation
// operations and cannot reach OpenAI, LiteLLM, or any other model endpoint.
const engine = new PrismEngine(new DeterministicDesignProvider());
const controlInternalUrl=process.env.PRISM_CONTROL_INTERNAL_URL??"http://prism-control:8080";
const artifactClient = new WorkerArtifactClient(new URL(controlInternalUrl), workerSecret, spiffeEnabled);
const server = createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    return response.end('{"status":"ready"}');
  }
  if (request.url === "/ready") {
    try {
      await noncePool.query("SELECT 1 FROM prism.worker_request_nonce LIMIT 1");
      response.writeHead(200, { "content-type": "application/json" });
      return response.end('{"status":"ready"}');
    } catch {
      response.writeHead(503, { "content-type": "application/json" });
      return response.end('{"status":"not-ready"}');
    }
  }
  if (request.url !== "/v1/attempts" || request.method !== "POST") {
    response.writeHead(404);
    return response.end();
  }
  try {
    if (
      !(request.headers["content-type"] ?? "")
        .toString()
        .toLowerCase()
        .startsWith("application/json")
    ) {
      response.writeHead(415);
      return response.end();
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
    if(spiffeEnabled)authorizeProxiedSpiffePeer(request.headers,request.socket.remoteAddress,new Set([trustedControlSpiffeId]));
    else await verifyInternalRequest(workerSecret, raw, request.headers, nonceStore);
    const input = JSON.parse(raw.toString("utf8")) as WorkerAttemptEnvelopeV1;
    validatePipelineWorkerCoreContract("workerAttemptEnvelope", input);
    const result = await executeWorkerAttempt(input, engine, artifactClient);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(422, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "failed",
      }),
    );
  }
});
server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
