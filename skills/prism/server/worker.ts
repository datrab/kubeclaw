import { createServer } from "node:http";
import { createHash } from "node:crypto";
import {
  PrismEngine,
  DeterministicDesignProvider,
} from "../engine/index.ts";
import { executePrismOperation } from "../engine/worker-binding.ts";
import {
  WorkerAttemptExecutor,
  type WorkerAttemptOperation,
} from "@kubeclaw/worker-core";
import {
  validatePipelineWorkerCoreContract,
  type WorkerAttemptEnvelopeV1,
  type WorkerAttemptLimitsV1,
} from "@kubeclaw/pipeline-worker-core-contract";
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
const trustedControlOrigin=new URL(controlInternalUrl).origin;
const digest=(value:Uint8Array)=>`sha256:${createHash("sha256").update(value).digest("hex")}`;
async function uploadEvidence(id:string,type:string,mediaType:string,bytes:Buffer){
  const contentDigest=digest(bytes);const storageUrl=new URL(`/v1/internal/artifacts/${contentDigest}`,controlInternalUrl).toString();
  const response=await fetch(storageUrl,{method:"POST",headers:spiffeEnabled?{"content-type":"application/octet-stream"}:{authorization:`Bearer ${workerSecret}`,"content-type":"application/octet-stream"},body:new Uint8Array(bytes)});
  if(!response.ok)throw new Error(`Prism evidence upload failed: ${response.status}`);
  return {evidenceId:id,type,artifact:{artifactId:`artifact:${contentDigest}`,type,mediaType,contentDigest,sizeBytes:bytes.byteLength,storageUrl}};
}
function operationFor(
  envelope: WorkerAttemptEnvelopeV1,
): WorkerAttemptOperation {
  let prepared = false;
  let terminated = false;
  return {
    prepare(limits: WorkerAttemptLimitsV1) {
      if (
        limits.cpuMillis > 4000 ||
        limits.memoryBytes > 8_589_934_592 ||
        limits.processes > 256
      )
        throw new Error("Prism attempt exceeds the worker resource boundary");
      prepared = true;
      return undefined;
    },
    async execute(context) {
      if (!prepared || terminated || context.signal.aborted)
        throw new Error("Prism attempt cannot start");
      if (envelope.operation.values.operation === "generate")
        throw new Error("Prism generation requires the OpenClaw agent gateway");
      context.log(
        "system",
        `Prism ${String(envelope.operation.values.operation)} operation started`,
      );
      const inputName=String(envelope.operation.values.inputName??"");
      const declared=envelope.inputs.find((item)=>item.name===inputName&&item.kind==="artifact");
      if(!declared||declared.kind!=="artifact"||declared.artifact.mediaType!=="application/json"||declared.artifact.type!=="prism-engine-input")throw new Error("Prism input artifact is missing or invalid");
      const inputUrl=new URL(declared.artifact.storageUrl);
      if(inputUrl.origin!==trustedControlOrigin||inputUrl.pathname!==`/v1/internal/artifacts/${declared.artifact.contentDigest}`||inputUrl.search||inputUrl.hash)throw new Error("Prism input artifact location is not allowed");
      const inputResponse=await fetch(inputUrl,{headers:spiffeEnabled?{}:{authorization:`Bearer ${workerSecret}`},signal:context.signal});
      if(!inputResponse.ok)throw new Error("Prism input artifact could not be read");
      const inputBytes=Buffer.from(await inputResponse.arrayBuffer());
      if(inputBytes.byteLength!==declared.artifact.sizeBytes||digest(inputBytes)!==declared.artifact.contentDigest)throw new Error("Prism input artifact failed integrity validation");
      const hydratedInput=JSON.parse(inputBytes.toString("utf8")) as Record<string,unknown>;
      const specialistResult = await executePrismOperation(
        engine,
        envelope.operation,
        envelope.executionId,
        hydratedInput,
      );
      if (terminated || context.signal.aborted)
        throw new Error("Prism attempt was cancelled");
      const values={...specialistResult.values};const evidence=[];
      if(typeof values.screenshotBase64==="string"){evidence.push(await uploadEvidence("render-screenshot","preview","image/png",Buffer.from(values.screenshotBase64,"base64")));delete values.screenshotBase64;}
      if(typeof values.ariaSnapshot==="string"){evidence.push(await uploadEvidence("render-aria","accessibility-tree","text/plain",Buffer.from(values.ariaSnapshot)));delete values.ariaSnapshot;}
      const boundedResult={...specialistResult,values};
      return {
        summary: "Prism operation completed",
        specialistResult:boundedResult,
        evidence,
        exitCode: 0,
        signal: null,
      };
    },
    async terminate() {
      terminated = true;
    },
    async measure() {
      return {
        cpuTimeMs: Math.round(process.cpuUsage().user / 1000),
        maximumMemoryBytes: process.memoryUsage().rss,
        maximumProcesses: 1,
      };
    },
  };
}
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
    const result = await new WorkerAttemptExecutor({
      envelope: input,
      operation: operationFor(input),
      receiptNamespace: "prism-worker",
    }).execute();
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
