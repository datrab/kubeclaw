import { PrismEngine, DeterministicDesignProvider } from "../engine/index.ts";
import { WorkerArtifactClient } from "./worker-artifacts.ts";
import { WorkerNonceDatabase } from "./worker-readiness.ts";
import { createWorkerServer } from "./worker-service.ts";
const spiffeEnabled = process.env.WORKER_TRUST_SPIFFE_ENABLED === "true";
const workerSecret = process.env.PRISM_WORKER_SECRET ?? "";
if (!spiffeEnabled && !workerSecret) throw new Error("PRISM_WORKER_SECRET is required");
const trustedControlSpiffeId = process.env.PRISM_TRUSTED_CONTROL_SPIFFE_ID ?? "";
if (spiffeEnabled && !trustedControlSpiffeId) throw new Error("Prism worker SPIFFE trust policy is incomplete");
const databaseUrl = process.env.DATABASE_URL ?? "";
if (!spiffeEnabled && !databaseUrl) throw new Error("DATABASE_URL is required");
// The worker is intentionally model-free. OpenClaw is the sole owner of LLM
// calls; this deterministic provider only supports bounded render/evaluation
// operations and cannot reach OpenAI, LiteLLM, or any other model endpoint.
const engine = new PrismEngine(new DeterministicDesignProvider());
const controlInternalUrl=process.env.PRISM_CONTROL_INTERNAL_URL??"http://prism-control:8080";
const artifactClient = new WorkerArtifactClient(new URL(controlInternalUrl), workerSecret, spiffeEnabled);
const server = createWorkerServer(spiffeEnabled
  ? { mode: "spiffe", trustedControlSpiffeId }
  : { mode: "hmac", secret: workerSecret, database: new WorkerNonceDatabase(databaseUrl) }, engine, artifactClient);
server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
