import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Pool } from "pg";
import {
  validatePrism,
  type PrismDocument,
} from "@kubeclaw/prism-contracts-v1";
import {
  ContentAddressedArtifactStore,
  RevisionRepository,
} from "../storage/index.ts";
import {
  exchangeTailscaleIdentity,
  verifySession,
} from "../control/session.ts";
import { prismAttempt, prismRequestDigest } from "../engine/worker-envelope.ts";
import { ingest, search, type CorpusInput } from "../corpus/index.ts";
import { evaluate } from "../evaluation/index.ts";
import {
  projectPreferences,
  type PreferenceEvent,
} from "../preferences/index.ts";
import { signInternalRequest } from "./internal-auth.ts";
import { assertMaterialDirectionDiversity } from "../directions/index.ts";
import { authorizeProxiedSpiffePeer } from "@kubeclaw/worker-core";

const port = Number(process.env.PORT ?? 8080);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const repository = new RevisionRepository(pool);
const artifacts = new ContentAddressedArtifactStore(
  process.env.ARTIFACT_ROOT ?? "/var/lib/prism/artifacts",
);
const workerUrl = new URL(
  process.env.PRISM_WORKER_URL ?? "http://prism-worker:8080",
);
const sessionSecret = required("PRISM_SESSION_SECRET");
const ingressSecret = required("PRISM_INGRESS_SECRET");
const spiffeEnabled = process.env.WORKER_TRUST_SPIFFE_ENABLED === "true";
const dispatchSecret = spiffeEnabled ? "" : required("PRISM_DISPATCH_SECRET");
const workerSecret = spiffeEnabled ? "" : required("PRISM_WORKER_SECRET");
const trustedNovaSpiffeId = process.env.PRISM_TRUSTED_NOVA_SPIFFE_ID ?? "";
const trustedTestRunnerSpiffeId = process.env.PRISM_TRUSTED_TEST_RUNNER_SPIFFE_ID ?? "";
const trustedWorkerSpiffeId = process.env.PRISM_TRUSTED_WORKER_SPIFFE_ID ?? "";
const trustedControlSpiffeId = process.env.PRISM_CONTROL_SPIFFE_ID ?? "";
if (spiffeEnabled && (!trustedNovaSpiffeId || !trustedWorkerSpiffeId || !trustedControlSpiffeId)) {
  throw new Error("Prism SPIFFE trust policy is incomplete");
}
const ingestionSecret=required("PRISM_INGESTION_SECRET");
const ingestionUrl=new URL(process.env.PRISM_INGESTION_URL??"http://prism-ingestion:8080");
const controlInternalUrl=new URL(process.env.PRISM_CONTROL_INTERNAL_URL??"http://prism-control:8080");
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
async function body(
  request: IncomingMessage,
  maxBytes = 2_000_000,
): Promise<unknown> {
  if (
    !(request.headers["content-type"] ?? "")
      .toString()
      .toLowerCase()
      .startsWith("application/json")
  )
    throw new Error("application/json is required");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("request too large");
    chunks.push(chunk);
  }
  return chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
    : {};
}
function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}
function cookies(request: IncomingMessage): Record<string, string> {
  return Object.fromEntries(
    (request.headers.cookie ?? "")
      .split(";")
      .filter(Boolean)
      .map(
        (item) =>
          item.trim().split("=").map(decodeURIComponent) as [string, string],
      ),
  );
}
function authenticated(request: IncomingMessage): {
  user: string;
  roles: string[];
  csrf: string;
} {
  const values = cookies(request);
  const session = verifySession(values.prism_session ?? "", sessionSecret);
  const csrf = values.prism_csrf ?? "";
  if (
    !["GET", "HEAD"].includes(request.method ?? "") &&
    (!csrf || request.headers["x-prism-csrf"] !== csrf)
  )
    throw new Error("invalid CSRF token");
  return { user: session.user, roles: session.roles, csrf };
}
type WorkerEvidence = { evidenceId?:string; type?:string; artifact?:{ storageUrl?:string; contentDigest?:string; mediaType?:string } };
async function hydrateWorkerEvidence(
  portableValues: Record<string, unknown>,
  evidence: WorkerEvidence[],
): Promise<Record<string, unknown>> {
  const values={...portableValues};
  for(const item of evidence){
    if(!item.evidenceId||!item.artifact?.storageUrl||!item.artifact.contentDigest)throw new Error("Prism worker returned invalid evidence");
    const evidenceUrl=new URL(item.artifact.storageUrl);
    if(evidenceUrl.origin!==controlInternalUrl.origin||evidenceUrl.pathname!==`/v1/internal/artifacts/${item.artifact.contentDigest}`)throw new Error("Prism worker evidence location is not allowed");
    const evidenceResponse=await fetch(evidenceUrl,{headers:spiffeEnabled?{}:{authorization:`Bearer ${workerSecret}`}});
    if(!evidenceResponse.ok)throw new Error("Prism worker evidence could not be read");
    const bytes=Buffer.from(await evidenceResponse.arrayBuffer());
    if(sha256(bytes)!==item.artifact.contentDigest)throw new Error("Prism worker evidence digest mismatch");
    if(item.evidenceId==="render-screenshot")values.screenshotBase64=bytes.toString("base64");
    else if(item.evidenceId==="render-aria")values.ariaSnapshot=bytes.toString("utf8");
    else if(item.evidenceId==="evaluation-report")values.report=JSON.parse(bytes.toString("utf8"));
  }
  return values;
}
async function runWorker(
  operation: "generate" | "render" | "evaluate" | "ingest" | "publish",
  input: Record<string, unknown>,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const inputBytes=Buffer.from(JSON.stringify(input));
  const storedInput=await artifacts.put(inputBytes);
  const attempt = prismAttempt(operation,{
    artifactId:storedInput.artifactId,type:"prism-engine-input",mediaType:"application/json",contentDigest:storedInput.digest,sizeBytes:storedInput.sizeBytes,
    storageUrl:new URL(`/v1/internal/artifacts/${storedInput.digest}`,controlInternalUrl).toString(),
  }, idempotencyKey);
  const requestDigest = prismRequestDigest(attempt.operation,storedInput.digest);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      idempotencyKey,
    ]);
    const prior = await client.query<{
      request_digest: string | null;
      result: Record<string, unknown> | null;
    }>(
      "SELECT request_digest,result FROM prism.engine_operation WHERE idempotency_key=$1",
      [idempotencyKey],
    );
    if (
      prior.rows[0]?.request_digest &&
      prior.rows[0].request_digest !== requestDigest
    )
      throw new Error("idempotency key was used for a different Prism request");
    if (prior.rows[0]?.result) {
      await client.query("COMMIT");
      const stored=prior.rows[0].result as {values?:Record<string,unknown>;evidence?:WorkerEvidence[]};
      return hydrateWorkerEvidence(stored.values??stored,stored.evidence??[]);
    }
    await client.query(
      "INSERT INTO prism.engine_operation(idempotency_key,attempt_id,operation,request_digest) VALUES($1,$2,$3,$4) ON CONFLICT(idempotency_key) DO UPDATE SET attempt_id=excluded.attempt_id,request_digest=COALESCE(prism.engine_operation.request_digest,excluded.request_digest)",
      [idempotencyKey, attempt.executionId, operation, requestDigest],
    );
    const body = Buffer.from(JSON.stringify(attempt));
    const timestamp = Date.now();
    const nonce = randomBytes(16).toString("hex");
    const result = await fetch(new URL("/v1/attempts", workerUrl), {
      method: "POST",
      headers: spiffeEnabled ? {
        "content-type": "application/json",
      } : {
        "content-type": "application/json",
        "x-prism-timestamp": String(timestamp),
        "x-prism-nonce": nonce,
        "x-prism-signature": `v1=${signInternalRequest(workerSecret, body, timestamp, nonce)}`,
      },
      body,
    });
    if (!result.ok) throw new Error(`Prism worker failed: ${result.status}`);
    const workerResult = (await result.json()) as {
      state?: string;
      error?: { message?: string } | null;
      specialistResult?: { values?: Record<string, unknown> } | null;
      evidence?:WorkerEvidence[];
    };
    if (workerResult.state !== "completed")
      throw new Error(
        workerResult.error?.message ?? "Prism worker attempt failed",
      );
    const portableValues = workerResult.specialistResult?.values ?? {};
    const values = await hydrateWorkerEvidence(portableValues,workerResult.evidence??[]);
    await client.query(
      "UPDATE prism.engine_operation SET result=$2::jsonb,completed_at=now() WHERE idempotency_key=$1",
      [idempotencyKey, JSON.stringify({ values: portableValues, evidence: workerResult.evidence ?? [] })],
    );
    await client.query("COMMIT");
    return values;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
const sha256 = (value: string | Uint8Array) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const stableRecord = (record: Record<string, string>) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
const userKey = (identity: string) =>
  `user-${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://prism-control");
    if (url.pathname === "/health")
      return json(response, 200, { status: "ok" });
    if (url.pathname === "/ready") {
      await pool.query("SELECT 1");
      return json(response, 200, { status: "ready" });
    }
    const internalArtifact=/^\/v1\/internal\/artifacts\/(sha256:[a-f0-9]{64})$/.exec(url.pathname);
    if(internalArtifact){
      if(spiffeEnabled){
        try{authorizeProxiedSpiffePeer(request.headers,request.socket.remoteAddress,new Set([trustedWorkerSpiffeId,trustedControlSpiffeId]));}
        catch{return json(response,401,{error:"unauthorized"});}
      }else{
        const supplied=Buffer.from(String(request.headers.authorization??"").replace(/^Bearer /,""));const expected=Buffer.from(workerSecret);
        if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return json(response,401,{error:"unauthorized"});
      }
      if(request.method==="GET"){
        const bytes=await artifacts.get(`artifact:${internalArtifact[1]}`);response.writeHead(200,{"content-type":"application/octet-stream","cache-control":"no-store"});return response.end(bytes);
      }
      if(request.method==="POST"){
        const chunks:Buffer[]=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>134_217_728)throw new Error("evidence is too large");chunks.push(chunk);}const stored=await artifacts.put(Buffer.concat(chunks));
        if(stored.digest!==internalArtifact[1])throw new Error("evidence digest does not match URL");return json(response,201,stored);
      }
      return json(response,405,{error:"method not allowed"});
    }
    if (url.pathname === "/v1/session" && request.method === "POST") {
      const headers = Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [
          key,
          Array.isArray(value) ? value[0] : value,
        ]),
      );
      const token = exchangeTailscaleIdentity(
        headers,
        ingressSecret,
        sessionSecret,
      );
      const csrf = randomBytes(24).toString("base64url");
      response.setHeader("set-cookie", [
        `prism_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900`,
        `prism_csrf=${encodeURIComponent(csrf)}; Secure; SameSite=Strict; Path=/; Max-Age=900`,
      ]);
      return json(response, 201, {
        csrf,
        userId: userKey(verifySession(token, sessionSecret).user),
      });
    }
    if (url.pathname === "/v1/dispatch" && request.method === "POST") {
      if(spiffeEnabled){
        try{authorizeProxiedSpiffePeer(request.headers,request.socket.remoteAddress,new Set([trustedNovaSpiffeId, trustedTestRunnerSpiffeId].filter(Boolean)));}
        catch{throw new Error("invalid dispatch identity");}
      }
      if (
        !(request.headers["content-type"] ?? "")
          .toString()
          .toLowerCase()
          .startsWith("application/json")
      )
        throw new Error("application/json is required");
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 2_000_000) throw new Error("request too large");
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks);
      const key = String(request.headers["idempotency-key"] ?? "");
      if(!key)throw new Error("invalid dispatch idempotency key");
      if(!spiffeEnabled){
        const supplied = String(request.headers["x-kubeclaw-signature"] ?? "").replace(/^v1=/, "");
        const expected = createHmac("sha256", dispatchSecret).update(`${key}.${raw.toString("utf8")}`).digest();
        const actual = Buffer.from(supplied, "hex");
        if(actual.length !== expected.length || !timingSafeEqual(actual, expected))throw new Error("invalid dispatch signature");
      }
      const payload = JSON.parse(raw.toString("utf8")) as {
        request?: { projectId?: string; approvalId?: string; schema?: string; architecture?: {artifactId?:string;contentDigest?:string}; architectureContent?: unknown };
      };
      const designRequest = validatePrism<{
        schema: "prism.design-request.v1";
        projectId: string;
        architecture: { artifactId: string; contentDigest: string; revision: number };
        architectureContent: Record<string, unknown>;
        approvalId?: string;
      }>("designRequest", payload.request);
      const projectKey = designRequest.projectId;
      const project = await pool.query<{ id: string }>(
        "INSERT INTO prism.project(id,external_id,name) VALUES($1,$2,$3) ON CONFLICT(external_id) DO UPDATE SET updated_at=now() RETURNING id",
        [randomUUID(), projectKey, projectKey],
      );
      const requestClient=await pool.connect();
      try{
        await requestClient.query("BEGIN");
        await requestClient.query("SELECT id FROM prism.project WHERE id=$1 FOR UPDATE",[project.rows[0]!.id]);
        const active=await requestClient.query<{architecture_digest:string;architecture_revision:number}>("SELECT architecture_digest,architecture_revision FROM prism.design_request WHERE project_id=$1 AND status='active' ORDER BY architecture_revision DESC LIMIT 1",[project.rows[0]!.id]);
        if(active.rows[0]){
          const current=active.rows[0];
          if(designRequest.architecture.revision<current.architecture_revision)throw new Error("stale architecture revision");
          if(designRequest.architecture.revision===current.architecture_revision&&designRequest.architecture.contentDigest!==current.architecture_digest)throw new Error("architecture revision digest conflict");
          if(designRequest.approvalId&&designRequest.architecture.contentDigest!==current.architecture_digest)throw new Error("approval cannot activate a different architecture");
        }
        await requestClient.query("UPDATE prism.design_request SET status='superseded' WHERE project_id=$1 AND architecture_revision<$2 AND status='active'",[project.rows[0]!.id,designRequest.architecture.revision]);
        await requestClient.query("INSERT INTO prism.design_request(id,project_id,architecture_artifact_id,architecture_digest,architecture_revision,request,status) VALUES($1,$2,$3,$4,$5,$6::jsonb,'active') ON CONFLICT(project_id,architecture_revision) DO UPDATE SET architecture_artifact_id=excluded.architecture_artifact_id,architecture_digest=excluded.architecture_digest,request=excluded.request,status='active'",[randomUUID(),project.rows[0]!.id,designRequest.architecture.artifactId,designRequest.architecture.contentDigest,designRequest.architecture.revision,JSON.stringify(designRequest)]);
        await requestClient.query("COMMIT");
      }catch(error){await requestClient.query("ROLLBACK");throw error;}finally{requestClient.release();}
      if (!designRequest.approvalId)
        return json(response, 202, {
          result: { status: "waiting", projectId: project.rows[0]!.id },
        });
      const baseline = await pool.query<{
        bundle_digest: string;
        bundle_artifact_id: string;
      }>(
        "SELECT b.bundle_digest,b.bundle_artifact_id FROM prism.baseline b JOIN prism.approval a ON a.id=b.approval_id JOIN prism.design_request r ON r.project_id=b.project_id AND r.status='active' WHERE b.project_id=$1 AND b.approval_id=$2 AND a.architecture_digest=r.architecture_digest",
        [project.rows[0]!.id, designRequest.approvalId],
      );
      if (!baseline.rows[0])
        throw new Error("approved Prism baseline not found");
      return json(response, 200, {
        result: {
          bundleDigest: baseline.rows[0].bundle_digest,
          artifactId: baseline.rows[0].bundle_artifact_id,
        },
      });
    }
    const actor = authenticated(request);
    const projectBrief=/^\/v1\/projects\/([0-9a-f-]+)\/brief$/.exec(url.pathname);
    if(projectBrief&&request.method==="GET"){
      const result=await pool.query("SELECT architecture_artifact_id,architecture_digest,request,created_at FROM prism.design_request WHERE project_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1",[projectBrief[1]]);
      if(!result.rows[0])throw new Error("active Prism design request not found");
      return json(response,200,result.rows[0]);
    }
    if (url.pathname === "/v1/projects" && request.method === "POST") {
      const input = (await body(request)) as {
        externalId?: string;
        name?: string;
      };
      if (!input.externalId || !input.name)
        throw new Error("externalId and name are required");
      const architectureContent = {
        schema: "prism.standalone-brief.v1",
        projectId: input.externalId,
        title: input.name,
        source: "standalone-studio",
      };
      const bytes = Buffer.from(JSON.stringify(architectureContent));
      const architecture = await artifacts.put(bytes);
      const designRequest = {
        schema: "prism.design-request.v1",
        projectId: input.externalId,
        architecture: {
          artifactId: architecture.artifactId,
          contentDigest: architecture.digest,
          revision: 1,
        },
        architectureContent,
      };
      const client=await pool.connect();let projectId:string;
      try{
        await client.query("BEGIN");
        const project=await client.query<{id:string}>("INSERT INTO prism.project(id,external_id,name) VALUES($1,$2,$3) RETURNING id",[randomUUID(),input.externalId,input.name]);
        projectId=project.rows[0]!.id;
        await client.query("INSERT INTO prism.design_request(id,project_id,architecture_artifact_id,architecture_digest,architecture_revision,request,status) VALUES($1,$2,$3,$4,1,$5::jsonb,'active')",[randomUUID(),projectId,architecture.artifactId,architecture.digest,JSON.stringify(designRequest)]);
        await client.query("COMMIT");
      }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
      return json(response, 201, { id: projectId });
    }
    if (url.pathname === "/v1/documents" && request.method === "POST") {
      const input = (await body(request)) as {
        projectId?: string;
        key?: string;
        document?: PrismDocument;
      };
      validatePrism<PrismDocument>("designDocument", input.document);
      if (!input.projectId || !input.key)
        throw new Error("projectId and key are required");
      const activeRequest=await pool.query<{id:string}>("SELECT id FROM prism.design_request WHERE project_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1",[input.projectId]);
      if(!activeRequest.rows[0])throw new Error("active Prism design request is required before document creation");
      return json(response, 201, {
        id: await repository.createDocument(
          input.projectId,
          input.key,
          input.document!,
          actor.user,
          activeRequest.rows[0].id,
        ),
      });
    }
    const directions = /^\/v1\/projects\/([0-9a-f-]+)\/directions$/.exec(
      url.pathname,
    );
    if (directions && request.method === "GET") {
      const result = await pool.query(
        "SELECT id,direction_key,title,summary,proposal,state,content_digest,evidence FROM prism.direction WHERE project_id=$1 ORDER BY created_at,id",
        [directions[1]],
      );
      return json(response, 200, { items: result.rows });
    }
    if (directions && request.method === "POST") {
      const input = (await body(request)) as { documentId?: string };
      if (!input.documentId) throw new Error("documentId is required");
      const documentOwner = await pool.query<{ project_id: string }>(
        "SELECT d.project_id FROM prism.design_document d JOIN prism.design_request r ON r.id=d.design_request_id AND r.status='active' WHERE d.id=$1",
        [input.documentId],
      );
      if (
        !documentOwner.rows[0] ||
        documentOwner.rows[0].project_id !== directions[1]
      )
        throw new Error("document does not belong to the direction project");
      const currentDocument = await repository.current(input.documentId);
      const briefResult=await pool.query<{request:Record<string,unknown>}>("SELECT request FROM prism.design_request WHERE project_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1",[directions[1]]);
      const brief=briefResult.rows[0]?.request??{projectId:currentDocument.document.meta.projectId};
      const preferenceRows=await pool.query<{content:PreferenceEvent}>("SELECT e.content FROM prism.preference_event e WHERE e.subject_id=$1 AND (e.project_id=$2 OR e.project_id IS NULL) ORDER BY e.occurred_at,e.id",[userKey(actor.user),directions[1]]);
      const preferenceProfile=projectPreferences(preferenceRows.rows.map((row)=>row.content));
      const researchText=JSON.stringify(brief).slice(0,100_000);
      const embedded=await runWorker("ingest",{text:researchText},`research:${directions[1]}:${sha256(researchText)}`);
      const references=await search(pool,researchText,8,{embedding:embedded.embedding as number[],model:String(embedded.model)},{sourceFamilyLimit:2});
      const referenceSummary=references.map((item)=>({id:item.id,summary:(item.normalized as Record<string,unknown>|undefined)?.summary,sourceKind:item.source_kind,explanation:item.explanation}));
      const proposals = [
        {
          key: "calm-technical",
          title: "Calm technical",
          summary: "Dense, restrained, and operational.",
          instruction:
            "Create a calm, restrained, high-density technical direction. Preserve task clarity and accessibility.",
        },
        {
          key: "clear-expressive",
          title: "Clear expressive",
          summary: "Clear hierarchy with a stronger visual signature.",
          instruction:
            "Create a distinct expressive direction with strong hierarchy. Preserve usability and accessibility.",
        },
        {
          key: "focused-editorial",
          title: "Focused editorial",
          summary: "Strong narrative order with restrained detail and deliberate emphasis.",
          instruction:
            "Create a focused editorial direction with a clear narrative sequence, deliberate typography, and restrained controls. Preserve task completion, accessibility, and product credibility.",
        },
      ];
      const generated: Array<{proposal:(typeof proposals)[number];document:PrismDocument;content:string;evidence:Record<string,unknown>}> = [];
      for (const proposal of proposals) {
        const values = await runWorker(
          "generate",
          {
            document: currentDocument.document,
            instruction: `${proposal.instruction}\nGround the proposal in this approved brief: ${researchText}\nUse these Prism corpus references as evidence, not templates to copy: ${JSON.stringify(referenceSummary)}\nApply these contextual user preferences only where their context matches, and preserve novelty: ${JSON.stringify(preferenceProfile)}`,
            mode: "directions",
          },
          `directions:${directions[1]}:${currentDocument.id}:${proposal.key}:${sha256(JSON.stringify({document:currentDocument.document,brief,references:referenceSummary,preferences:preferenceProfile}))}`,
        );
        const document = validatePrism<PrismDocument>(
          "designDocument",
          values.document,
        );
        const content = JSON.stringify(document);
        generated.push({proposal,document,content,evidence:{thesis:proposal.summary,references:referenceSummary,preferences:Object.keys(preferenceProfile),tradeoffs:proposal.key==="calm-technical"?["Less expressive","Optimized for expert density"]:proposal.key==="clear-expressive"?["More visual emphasis","Requires careful restraint"]:["More guided narrative","Lower information density"]}});
      }
      assertMaterialDirectionDiversity(generated.map((item)=>item.document));
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        for(const item of generated)await client.query(
          "INSERT INTO prism.direction(id,project_id,source_document_id,source_revision_id,direction_key,title,summary,proposal,content_digest,state,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'proposed',$10::jsonb) ON CONFLICT(project_id,source_document_id,direction_key) DO UPDATE SET source_revision_id=excluded.source_revision_id,title=excluded.title,summary=excluded.summary,proposal=excluded.proposal,content_digest=excluded.content_digest,state='proposed',evidence=excluded.evidence",
          [
            randomUUID(),
            directions[1],
            input.documentId,
            currentDocument.id,
            item.proposal.key,
            item.proposal.title,
            item.proposal.summary,
            item.content,
            sha256(item.content),
            JSON.stringify(item.evidence),
          ],
        );
        await client.query("COMMIT");
      }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
      const result = await pool.query(
        "SELECT id,direction_key,title,summary,proposal,state,content_digest,evidence FROM prism.direction WHERE project_id=$1 AND source_document_id=$2 ORDER BY created_at,id",
        [directions[1], input.documentId],
      );
      return json(response, 201, { items: result.rows });
    }
    const directionFeedback = /^\/v1\/directions\/([0-9a-f-]+)\/feedback$/.exec(
      url.pathname,
    );
    if (directionFeedback && request.method === "POST") {
      const input = (await body(request)) as {
        action?: "rejected" | "liked" | "disliked" | "preserved";
        trait?: string;
      };
      if (!input.action || !["rejected", "liked", "disliked", "preserved"].includes(input.action))
        throw new Error("supported direction feedback action is required");
      const direction = await pool.query<{
        project_id: string;
        external_id: string;
        direction_key: string;
        state: string;
      }>(
        "SELECT d.project_id,p.external_id,d.direction_key,d.state FROM prism.direction d JOIN prism.project p ON p.id=d.project_id WHERE d.id=$1",
        [directionFeedback[1]],
      );
      if (!direction.rows[0]) throw new Error("direction is not available");
      if(input.action==="rejected"&&direction.rows[0].state!=="proposed")throw new Error("only a proposed direction can be rejected");
      if (input.action === "rejected")
        await pool.query("UPDATE prism.direction SET state='rejected' WHERE id=$1 AND state='proposed'", [directionFeedback[1]]);
      const eventId = `event-${randomBytes(12).toString("hex")}`;
      const userId = userKey(actor.user);
      const event: PreferenceEvent = {
        schema: "prism.preference-event.v1",
        eventId,
        userId,
        projectId: direction.rows[0].external_id,
        action: input.action,
        target: { directionId: directionFeedback[1] },
        traits: [input.trait?.trim() || direction.rows[0].direction_key],
        context: { surface: "direction" },
        source: "explicit",
        learningScope: "project",
        occurredAt: new Date().toISOString(),
      };
      await pool.query(
        "INSERT INTO prism.preference_event(id,project_id,subject_id,event_type,content,consent_scope,occurred_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)",
        [eventId,direction.rows[0].project_id,userId,event.action,JSON.stringify(event),event.learningScope,event.occurredAt],
      );
      return json(response, 201, { eventId, state: input.action === "rejected" ? "rejected" : "recorded" });
    }
    const selectDirection = /^\/v1\/directions\/([0-9a-f-]+)\/select$/.exec(
      url.pathname,
    );
    if (selectDirection && request.method === "POST") {
      const input = (await body(request)) as { documentId?: string };
      if (!input.documentId) throw new Error("documentId is required");
      const selected = await pool.query<{
        project_id: string;
        source_document_id: string;
        source_revision_id: string;
        proposal: PrismDocument;
        direction_key: string;
        external_id: string;
      }>(
        "SELECT d.project_id,d.source_document_id,d.source_revision_id,d.proposal,d.direction_key,p.external_id FROM prism.direction d JOIN prism.project p ON p.id=d.project_id WHERE d.id=$1 AND d.state='proposed'",
        [selectDirection[1]],
      );
      if (!selected.rows[0]) throw new Error("direction is not available");
      const documentOwner = await pool.query<{ project_id: string }>(
        "SELECT project_id FROM prism.design_document WHERE id=$1",
        [input.documentId],
      );
      if (
        !documentOwner.rows[0] ||
        documentOwner.rows[0].project_id !== selected.rows[0].project_id ||
        selected.rows[0].source_document_id !== input.documentId
      )
        throw new Error("direction does not belong to the target document");
      const currentDocument = await repository.current(input.documentId);
      if (selected.rows[0].source_revision_id !== currentDocument.id)
        throw new Error(
          "direction is stale; generate new directions from the current revision",
        );
      const proposal = structuredClone(selected.rows[0].proposal);
      proposal.meta.revision = currentDocument.document.meta.revision + 1;
      proposal.meta.updatedAt = new Date().toISOString();
      await repository.replace(
        input.documentId,
        currentDocument.id,
        proposal,
        { type: "direction.selected", directionId: selectDirection[1] },
        actor.user,
      );
      await pool.query(
        "UPDATE prism.direction SET state=CASE WHEN id=$1 THEN 'selected' ELSE 'rejected' END WHERE project_id=$2 AND source_document_id=$3 AND state IN ('proposed','selected')",
        [selectDirection[1], selected.rows[0].project_id, input.documentId],
      );
      const eventId = `event-${randomBytes(12).toString("hex")}`;
      const userId = `user-${createHash("sha256").update(actor.user).digest("hex").slice(0, 24)}`;
      const event: PreferenceEvent = {
        schema: "prism.preference-event.v1",
        eventId,
        userId,
        projectId: selected.rows[0].external_id,
        action: "selected",
        target: { directionId: selectDirection[1] },
        traits: [selected.rows[0].direction_key],
        context: { surface: "direction" },
        source: "explicit",
        learningScope: "project",
        occurredAt: new Date().toISOString(),
      };
      await pool.query(
        "INSERT INTO prism.preference_event(id,project_id,subject_id,event_type,content,consent_scope,occurred_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)",
        [
          eventId,
          selected.rows[0].project_id,
          userId,
          event.action,
          JSON.stringify(event),
          event.learningScope,
          event.occurredAt,
        ],
      );
      return json(response, 200, {
        document: proposal,
        directionKey: selected.rows[0].direction_key,
      });
    }
    const current = /^\/v1\/documents\/([0-9a-f-]+)$/.exec(url.pathname);
    if (current && request.method === "GET")
      return json(response, 200, await repository.current(current[1]!));
    const revisions = /^\/v1\/documents\/([0-9a-f-]+)\/revisions$/.exec(
      url.pathname,
    );
    if (revisions && request.method === "GET")
      return json(response, 200, {
        items: await repository.history(revisions[1]!),
      });
    const restore =
      /^\/v1\/documents\/([0-9a-f-]+)\/revisions\/([0-9a-f-]+)\/restore$/.exec(
        url.pathname,
      );
    if (restore && request.method === "POST")
      return json(
        response,
        200,
        await repository.restore(restore[1]!, restore[2]!, actor.user),
      );
    const operations = /^\/v1\/documents\/([0-9a-f-]+)\/operations$/.exec(
      url.pathname,
    );
    if (operations && request.method === "POST")
      return json(
        response,
        200,
        await repository.apply(
          operations[1]!,
          (await body(request)) as never,
          actor.user,
        ),
      );
    const execute = /^\/v1\/documents\/([0-9a-f-]+)\/engine$/.exec(
      url.pathname,
    );
    if (execute && request.method === "POST") {
      const input = (await body(request)) as {
        operation?: string;
        input?: Record<string, unknown>;
        idempotencyKey?: string;
        baseRevision?: number;
      };
      const idempotencyKey =
        input.idempotencyKey ?? randomBytes(16).toString("hex");
      if (
        !["generate", "render", "evaluate", "publish"].includes(
          input.operation ?? "",
        )
      )
        throw new Error("unsupported Prism engine operation");
      if (
        !Number.isSafeInteger(input.baseRevision) ||
        Number(input.baseRevision) < 1
      )
        throw new Error("baseRevision is required");
      const requestDocument = await repository.revision(
        execute[1]!,
        Number(input.baseRevision),
      );
      const operation = input.operation as
        "generate" | "render" | "evaluate" | "publish";
      const defaults =
        operation === "render"
          ? { view: "home", state: "default", viewport: "wide" }
          : {};
      const engineInput: Record<string, unknown> = {
        ...defaults,
        ...input.input,
        document: requestDocument.document,
      };
      if (operation === "render") {
        const assetSources: Record<string, string> = {};
        let totalBytes = 0;
        for (const [assetId, rawAsset] of Object.entries(
          requestDocument.document.assets,
        )) {
          const asset = rawAsset as { artifact?: string; mediaType?: string };
          if (!asset.artifact || !asset.mediaType)
            throw new Error(`asset metadata is incomplete for ${assetId}`);
          const bytes = await artifacts.get(asset.artifact);
          totalBytes += bytes.byteLength;
          if (totalBytes > 6_000_000)
            throw new Error("render assets exceed the 6 MB baseline limit");
          assetSources[assetId] =
            `data:${asset.mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
        }
        engineInput.assetSources = assetSources;
      }
      const values = await runWorker(operation, engineInput, idempotencyKey);
      const generated = values.document;
      if (input.operation === "generate" && generated) {
        validatePrism<PrismDocument>("designDocument", generated);
        const currentDocument = await repository.current(execute[1]!);
        if (currentDocument.document.meta.revision === input.baseRevision) {
          try {
            await repository.replace(
              execute[1]!,
              currentDocument.id,
              generated as PrismDocument,
              { type: "engine.generate", idempotencyKey },
              actor.user,
            );
          } catch (error) {
            if (
              !(await repository.includesOperation(execute[1]!, idempotencyKey))
            )
              throw error;
          }
        } else if (currentDocument.document.meta.revision < input.baseRevision!)
          throw new Error("design revision moved backwards");
        else if (
          !(await repository.includesOperation(execute[1]!, idempotencyKey))
        )
          throw new Error(
            "revision conflict: generated proposal is based on a stale design",
          );
      }
      return json(response, 200, {
        state: "completed",
        specialistResult: { values },
      });
    }
    if (url.pathname === "/v1/approvals" && request.method === "POST") {
      const input = (await body(request)) as {
        projectId?: string;
        documentId?: string;
        designDigest?: string;
        acceptedWarningIds?: string[];
      };
      if (!input.projectId || !input.documentId || !input.designDigest)
        throw new Error("projectId, documentId, and designDigest are required");
      const documentOwner = await pool.query<{ project_id: string }>(
        "SELECT project_id FROM prism.design_document WHERE id=$1",
        [input.documentId],
      );
      if (
        !documentOwner.rows[0] ||
        documentOwner.rows[0].project_id !== input.projectId
      )
        throw new Error("document does not belong to the approval project");
      const currentDocument = await repository.current(input.documentId);
      const id = `approval-${randomBytes(16).toString("hex")}`;
      const quality = evaluate(currentDocument.document);
      if (quality.status === "blocked")
        throw new Error("design quality gate blocked approval");
      const requiredWarnings = quality.findings
        .filter((finding) => finding.level === "review")
        .map((finding) => finding.id)
        .sort();
      const accepted = [...(input.acceptedWarningIds ?? [])].sort();
      if (JSON.stringify(requiredWarnings) !== JSON.stringify(accepted))
        throw new Error("all design warnings must be accepted explicitly");
      const activeRequest=await pool.query<{architecture_digest:string}>("SELECT r.architecture_digest FROM prism.design_request r JOIN prism.design_document d ON d.design_request_id=r.id WHERE r.project_id=$1 AND r.status='active' AND d.id=$2 ORDER BY r.created_at DESC LIMIT 1",[input.projectId,input.documentId]);
      if(!activeRequest.rows[0])throw new Error("active Prism design request is required for approval");
      await pool.query(
        "INSERT INTO prism.approval(id,project_id,design_revision_id,design_digest,approved_by,accepted_warning_ids,architecture_digest) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)",
        [
          id,
          input.projectId,
          currentDocument.id,
          input.designDigest,
          actor.user,
          JSON.stringify(accepted),
          activeRequest.rows[0].architecture_digest,
        ],
      );
      return json(response, 201, { id, acceptedWarningIds: accepted });
    }
    if (url.pathname === "/v1/baselines" && request.method === "POST") {
      const input = (await body(request)) as {
        projectId?: string;
        documentId?: string;
        approvalId?: string;
      };
      if (!input.projectId || !input.documentId || !input.approvalId)
        throw new Error("projectId, documentId, and approvalId are required");
      const published = await pool.query<{
        bundle_digest: string;
        bundle_artifact_id: string;
      }>(
        "SELECT b.bundle_digest,b.bundle_artifact_id FROM prism.baseline b JOIN prism.design_revision r ON r.id=b.design_revision_id WHERE b.approval_id=$1 AND b.project_id=$2 AND r.document_id=$3",
        [input.approvalId, input.projectId, input.documentId],
      );
      if (published.rows[0])
        return json(response, 200, {
          bundleDigest: published.rows[0].bundle_digest,
          artifactId: published.rows[0].bundle_artifact_id,
          reused: true,
        });
      const documentOwner = await pool.query<{ project_id: string }>(
        "SELECT project_id FROM prism.design_document WHERE id=$1",
        [input.documentId],
      );
      if (
        !documentOwner.rows[0] ||
        documentOwner.rows[0].project_id !== input.projectId
      )
        throw new Error("document does not belong to the baseline project");
      const currentDocument = await repository.current(input.documentId);
      const approval = await pool.query<{
        design_digest: string;
        approved_at: string;
        accepted_warning_ids: string[];
      }>(
        "SELECT a.design_digest,a.approved_at::text,a.accepted_warning_ids FROM prism.approval a JOIN prism.design_revision rev ON rev.id=a.design_revision_id JOIN prism.design_document d ON d.id=rev.document_id JOIN prism.design_request req ON req.id=d.design_request_id AND req.status='active' WHERE a.id=$1 AND a.project_id=$2 AND a.design_revision_id=$3 AND a.architecture_digest=req.architecture_digest",
        [input.approvalId, input.projectId, currentDocument.id],
      );
      if (!approval.rows[0])
        throw new Error("approval does not match the current design revision");
      const content = Buffer.from(JSON.stringify(currentDocument.document));
      const designDigest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      if (designDigest !== approval.rows[0].design_digest)
        throw new Error("stale approval digest");
      const quality = evaluate(currentDocument.document);
      if (quality.status === "blocked")
        throw new Error("design quality gate blocked publication");
      const warningIds = quality.findings
        .filter((finding) => finding.level === "review")
        .map((finding) => finding.id)
        .sort();
      if (
        JSON.stringify(warningIds) !==
        JSON.stringify(
          [...(approval.rows[0].accepted_warning_ids ?? [])].sort(),
        )
      )
        throw new Error("design warnings changed after approval");
      const requestRow=await pool.query<{request:Record<string,unknown>}>("SELECT request FROM prism.design_request WHERE project_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1",[input.projectId]);
      const approvedRequest=requestRow.rows[0]?.request??{};
      const selectedDirection=await pool.query<{title:string;summary:string;evidence:Record<string,unknown>}>("SELECT dir.title,dir.summary,dir.evidence FROM prism.direction dir JOIN prism.design_document d ON d.id=dir.source_document_id JOIN prism.design_request req ON req.id=d.design_request_id AND req.status='active' WHERE dir.project_id=$1 AND dir.source_document_id=$2 AND dir.state='selected' ORDER BY dir.created_at DESC LIMIT 1",[input.projectId,input.documentId]);
      if(!selectedDirection.rows[0])throw new Error("an active design direction must be selected before publication");
      const specification = `# Design specification\n\n## Experience goal\n${currentDocument.document.meta.title}\n\n## Approved architecture and users\n${JSON.stringify(approvedRequest.architectureContent??approvedRequest,null,2)}\n\n## Approved direction\n${selectedDirection.rows[0]?.title??"Approved Design Document direction"}: ${selectedDirection.rows[0]?.summary??""}\n\n## Reference evidence and trade-offs\n${JSON.stringify(selectedDirection.rows[0]?.evidence??{},null,2)}\n\n## Screen, state, and flow inventory\n${Object.entries(currentDocument.document.views).map(([id,view])=>`${id}: ${Object.keys(view.states).join(", ")}`).join("\n")}\n${Object.entries(currentDocument.document.flows).map(([id,flow])=>`${id}: ${(flow as {goal?:string}).goal??"user journey"}`).join("\n")}\n\n## Responsive behavior\nCompact, regular, and wide behavior is defined for every view.\n\n## Accessibility requirements\nUse semantic controls, visible keyboard focus, sufficient contrast, reduced motion, accessible names, and complete keyboard operation.\n\n## Content guidance\nUse clear task language from the approved architecture. Do not invent production facts.\n\n## Important design rules\n${(currentDocument.document.theme.rules as Array<{ instruction?: string }>).map((rule) => `- ${rule.instruction ?? ""}`).join("\n")}\n\n## Implementation notes\nPreserve Prism IDs and implement every required state and flow.\n\n## Known limits\nAll prototype data is synthetic. Production behavior remains owned by the implementation pipeline.\n`;
      const criteria = {
        schema: "prism.acceptance-criteria.v1",
        criteria: [...Object.entries(currentDocument.document.views).flatMap(
          ([view, value]) =>
            Object.keys(value.states).map((state) => ({
              id: `${view.slice(0, 55)}-${state.slice(0, 15)}-visible`,
              category: "visual",
              requirement: `The ${value.title} ${state} state is visible, usable, and keyboard accessible.`,
              targets: [{ view, state }],
              priority: "required",
              verification: ["visual", "automated"],
            })),
        ),...Object.entries(currentDocument.document.flows).map(([flow,value])=>({id:`flow-${flow}`.slice(0,80),category:"flow",requirement:`The ${String((value as {title?:string}).title??flow)} journey reaches its declared success state and supports each declared recovery path.`,targets:[{flow}],priority:"required",verification:["automated","manual"]}))],
      };
      validatePrism("acceptanceCriteria",criteria);
      const previewEntries: Array<Record<string, unknown>> = [];
      const binaryFiles: Record<string, string> = {};
      const manifestAssets: Record<
        string,
        { path: string; mediaType: string; digest: string }
      > = {};
      const renderAssetSources: Record<string, string> = {};
      let renderAssetBytes = 0;
      const textFiles: Record<string, string> = {
        "design-document.json": JSON.stringify(currentDocument.document),
        "design-specification.md": specification,
        "acceptance-criteria.json": JSON.stringify(criteria),
        "quality-report.json": JSON.stringify({
          ...quality,
          acceptedWarningIds: warningIds,
        }),
      };
      for (const [assetId, rawAsset] of Object.entries(
        currentDocument.document.assets,
      )) {
        const asset = rawAsset as { artifact?: string; mediaType?: string };
        if (!asset.artifact || !asset.mediaType)
          throw new Error(`asset metadata is incomplete for ${assetId}`);
        const bytes = await artifacts.get(asset.artifact);
        renderAssetBytes += bytes.byteLength;
        if (renderAssetBytes > 6_000_000)
          throw new Error("render assets exceed the 6 MB baseline limit");
        const extension =
          asset.mediaType === "image/png"
            ? "png"
            : asset.mediaType === "image/webp"
              ? "webp"
              : asset.mediaType === "image/svg+xml"
                ? "svg"
                : asset.mediaType === "font/woff2"
                  ? "woff2"
                  : "bin";
        const path = `assets/${assetId}.${extension}`;
        binaryFiles[path] = Buffer.from(bytes).toString("base64");
        renderAssetSources[assetId] =
          `data:${asset.mediaType};base64,${binaryFiles[path]}`;
        manifestAssets[assetId] = {
          path,
          mediaType: asset.mediaType,
          digest: sha256(bytes),
        };
      }
      const widths = { compact: 390, regular: 768, wide: 1440 } as const;
      for (const [view, value] of Object.entries(
        currentDocument.document.views,
      ))
        for (const state of Object.keys(value.states))
          for (const viewport of ["compact", "regular", "wide"] as const) {
            const targetKey=`${view}-${state}-${viewport}`;
            const id = `${view.slice(0,30)}-${state.slice(0,20)}-${viewport}-${sha256(targetKey).slice(7,15)}`;
            const rendered = await runWorker(
              "render",
              {
                document: currentDocument.document,
                view,
                state,
                viewport,
                capture: true,
                assetSources: renderAssetSources,
              },
              `${input.approvalId}:render:${id}`,
            );
            if (
              typeof rendered.screenshotBase64 !== "string" ||
              typeof rendered.ariaSnapshot !== "string"
            )
              throw new Error(`render evidence is missing for ${id}`);
            if (!Array.isArray(rendered.accessibilityFindings))
              throw new Error(
                `rendered accessibility evidence is missing for ${id}`,
              );
            if (rendered.accessibilityFindings.length)
              throw new Error(
                `rendered accessibility gate failed for ${id}: ${rendered.accessibilityFindings.join(",")}`,
              );
            const previewPath = `previews/${id}.png`;
            const ariaPath = `previews/${id}.aria.txt`;
            binaryFiles[previewPath] = rendered.screenshotBase64;
            textFiles[ariaPath] = rendered.ariaSnapshot;
            const previewDigest=sha256(Buffer.from(rendered.screenshotBase64,"base64"));
            const ariaDigest=sha256(rendered.ariaSnapshot);
            previewEntries.push({
              id,
              view,
              state,
              viewport,
              path: previewPath,
              width: widths[viewport],
              height: 1000,
              fidelity: "intent",
              digest: previewDigest,
              ariaPath,
              ariaDigest,
              renderer: rendered.renderer,
            });
          }
      const previewIndex={
        schema: "prism.preview-index.v1",
        previews: previewEntries,
      };
      validatePrism("previewIndex",previewIndex);
      textFiles["previews/index.json"] = JSON.stringify(previewIndex);
      const checksums: Record<string, string> = {};
      for (const [path, value] of Object.entries(textFiles))
        checksums[path] = sha256(value);
      for (const [path, value] of Object.entries(binaryFiles))
        checksums[path] = sha256(Buffer.from(value, "base64"));
      textFiles["checksums.json"] = JSON.stringify({
        algorithm: "sha256",
        files: Object.fromEntries(
          Object.entries(checksums).sort(([a], [b]) => a.localeCompare(b)),
        ),
      });
      const bundleDigest = sha256(stableRecord(checksums));
      const manifest = {
        schema: "prism.baseline-bundle.v1",
        bundleId: `${currentDocument.document.meta.projectId.slice(0, 71)}-baseline`,
        projectId: currentDocument.document.meta.projectId,
        revision: currentDocument.document.meta.revision,
        designDocument: {
          path: "design-document.json",
          schema: "prism.design-document.v1",
          revision: currentDocument.document.meta.revision,
        },
        designSpecification: { path: "design-specification.md" },
        acceptanceCriteria: { path: "acceptance-criteria.json" },
        assets: manifestAssets,
        previews: { path: "previews/index.json" },
        createdAt: new Date(approval.rows[0].approved_at).toISOString(),
        digest: bundleDigest,
      };
      validatePrism("baselineManifest", manifest);
      textFiles["manifest.json"] = JSON.stringify(manifest);
      const bundle = await artifacts.put(
        Buffer.from(
          JSON.stringify({
            schema: "prism.baseline-archive.v1",
            manifest,
            textFiles,
            binaryFiles,
          }),
        ),
      );
      await pool.query(
        "INSERT INTO prism.baseline(id,project_id,design_revision_id,bundle_key,bundle_revision,bundle_digest,bundle_artifact_id,approval_id,specification_digest,criteria_digest,preview_index_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          randomUUID(),
          input.projectId,
          currentDocument.id,
          "primary",
          currentDocument.document.meta.revision,
          bundleDigest,
          bundle.artifactId,
          input.approvalId,
          checksums["design-specification.md"],
          checksums["acceptance-criteria.json"],
          checksums["previews/index.json"],
        ],
      );
      return json(response, 201, {
        bundleDigest,
        artifactId: bundle.artifactId,
        manifest,
      });
    }
    if (url.pathname === "/v1/artifacts" && request.method === "POST") {
      const input = (await body(request, 8_500_000)) as { base64?: string };
      if (!input.base64) throw new Error("base64 is required");
      const decoded = Buffer.from(input.base64, "base64");
      if (
        decoded.byteLength > 6_000_000 ||
        decoded.toString("base64") !== input.base64
      )
        throw new Error("artifact payload is invalid or exceeds 6 MB");
      return json(response, 201, await artifacts.put(decoded));
    }
    if (url.pathname === "/v1/corpus" && request.method === "POST") {
      const input = (await body(request)) as CorpusInput;
      if (input.sourceKind === "public-web")
        throw new Error(
          "public-web ingestion is disabled until a source policy is approved",
        );
      const acquired=await fetch(new URL("/v1/acquisitions",ingestionUrl),{method:"POST",headers:{authorization:`Bearer ${ingestionSecret}`,"content-type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(30_000)});
      if(!acquired.ok)throw new Error(`corpus acquisition failed: ${acquired.status}`);
      const acquisition=(await acquired.json()) as {normalized?:CorpusInput;quarantineDigest?:string;contentBase64?:string};
      if(!acquisition.normalized||!acquisition.quarantineDigest||!acquisition.contentBase64)throw new Error("corpus acquisition returned invalid evidence");
      let publicationError:unknown;let stored:{id:string;digest:string}|undefined;
      try{
        const sourceBytes=Buffer.from(acquisition.contentBase64,"base64");
        if(`sha256:${createHash("sha256").update(sourceBytes).digest("hex")}`!==acquisition.quarantineDigest)throw new Error("corpus acquisition digest mismatch");
        const normalized={...acquisition.normalized,sourceContentDigest:acquisition.quarantineDigest};
        const text = `${normalized.title} ${normalized.summary} ${normalized.tags.join(" ")}`;
        const embedded = await runWorker("ingest",{ text },`corpus:${sha256(JSON.stringify(input))}`);
        stored=await ingest(pool, normalized, {
          embedding: embedded.embedding as number[],
          model: String(embedded.model),
          modelVersion: String(embedded.modelVersion),
          sourceDigest: String(embedded.sourceDigest),
        },{activate:false});
      }catch(error){publicationError=error;}
      let cleanupError:unknown;
      try{await fetch(new URL(`/v1/acquisitions/${acquisition.quarantineDigest.slice(7)}`,ingestionUrl),{method:"DELETE",headers:{authorization:`Bearer ${ingestionSecret}`},signal:AbortSignal.timeout(10_000)}).then((result)=>{if(!result.ok)throw new Error(`quarantine cleanup failed: ${result.status}`);});}
      catch(error){cleanupError=error;}
      if(publicationError&&cleanupError)throw new AggregateError([publicationError,cleanupError],"corpus publication and quarantine cleanup failed");
      if(publicationError)throw publicationError;
      if(cleanupError)throw cleanupError;
      // ingest returns corpus_revision.id so activation remains bound to the exact governed revision.
      await pool.query("UPDATE prism.corpus_item SET status='active' WHERE current_revision_id=$1",[stored!.id]);
      return json(response,201,stored!);
    }
    if (url.pathname === "/v1/corpus/search" && request.method === "GET") {
      const query = url.searchParams.get("q") ?? "";
      const embedded = await runWorker(
        "ingest",
        { text: query },
        `query:${sha256(query)}`,
      );
      const parseFilter = (
        name: string,
      ): Record<string, unknown> | undefined => {
        const value = url.searchParams.get(name);
        if (!value) return undefined;
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error(`${name} filter must be an object`);
        return parsed as Record<string, unknown>;
      };
      const items = await search(
        pool,
        query,
        Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 10))),
        {
          embedding: embedded.embedding as number[],
          model: String(embedded.model),
        },
        {
          required: parseFilter("required"),
          preferred: parseFilter("preferred"),
          avoid: parseFilter("avoid"),
          sourceFamilyLimit: Math.min(
            10,
            Math.max(1, Number(url.searchParams.get("sourceFamilyLimit") ?? 2)),
          ),
        },
      );
      return json(response, 200, {
        items,
        coverageGap:
          items.length <
          Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 10)))
            ? "The approved corpus does not cover all requested result slots."
            : null,
      });
    }
    if (url.pathname === "/v1/preferences" && request.method === "POST") {
      const event = validatePrism<PreferenceEvent>(
        "preferenceEvent",
        await body(request),
      );
      if (event.userId !== userKey(actor.user))
        throw new Error("preference user does not match the session");
      if (event.action === "retracted" && !event.retractsEventId)
        throw new Error("retraction target is required");
      await pool.query(
        "INSERT INTO prism.preference_event(id,project_id,subject_id,event_type,content,consent_scope,occurred_at) VALUES($1,(SELECT id FROM prism.project WHERE external_id=$2),$3,$4,$5::jsonb,$6,$7)",
        [
          event.eventId,
          event.projectId ?? null,
          event.userId,
          event.action,
          JSON.stringify(event),
          event.learningScope,
          event.occurredAt,
        ],
      );
      return json(response, 201, { id: event.eventId });
    }
    if (url.pathname === "/v1/preferences" && request.method === "GET") {
      const projectId = url.searchParams.get("project");
      const rows = await pool.query<{ content: PreferenceEvent }>(
        "SELECT e.content FROM prism.preference_event e LEFT JOIN prism.project p ON p.id=e.project_id WHERE e.subject_id=$1 AND ($2::text IS NULL OR p.external_id=$2) ORDER BY e.occurred_at,e.id",
        [userKey(actor.user), projectId],
      );
      const events = rows.rows.map((row) => row.content);
      return json(response, 200, {
        events,
        learned: projectPreferences(events),
      });
    }
    const artifact = /^\/v1\/artifacts\/(sha256:[a-f0-9]{64})$/.exec(
      url.pathname,
    );
    if (artifact && request.method === "GET") {
      const content = await artifacts.get(`artifact:${artifact[1]}`);
      response.writeHead(200, { "content-type": "application/octet-stream" });
      return response.end(content);
    }
    return json(response, 404, { error: "not found" });
  } catch (error) {
    return json(response, error instanceof SyntaxError ? 400 : 422, {
      error: error instanceof Error ? error.message : "request failed",
    });
  }
});

server.listen(port, "0.0.0.0");
process.on("SIGTERM", () => server.close(() => pool.end()));
