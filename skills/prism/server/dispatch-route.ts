import { validatePrism } from "@kubeclaw/prism-contracts-v1";
import { authorizeProxiedSpiffePeer } from "@kubeclaw/worker-core";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { admitDesignAgent } from "../control/agent-admission.ts";
import {
  approvedRoundBaseline,
  assertArchitectureTransition,
  startDesignRound,
} from "../control/design-generations.ts";
import { authorizePipelinePreferenceSubject } from "../control/pipeline-preference-subject.ts";
import { inTransaction } from "../storage/index.ts";

import type { ControlContext } from "./control-context.ts";
import { json } from "./control-http.ts";
type RouteContext = Pick<ControlContext, "config" | "pool" | "artifacts">;

export async function dispatchRoute(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === "/v1/dispatch" && request.method === "POST") {
    await dispatchDesign(context, request, response);
    return true;
  }
  return false;
}
async function dispatchDesign(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const controlConfig = context.config;
  const { pool, artifacts } = context;
  const { trustedControlSpiffeId } = context.config;

  const { raw, key } = await authenticateDispatch(context.config, request);
  const payload = JSON.parse(raw.toString("utf8")) as DispatchPayload;
  const preferenceSubjectId = authorizePipelinePreferenceSubject(
    payload.preferenceSubjectId,
    controlConfig.pipelinePreferenceSubject,
  );
  const designRequest = validatePrism<DesignRequest>(
    "designRequest",
    payload.request,
  );
  const projectKey = designRequest.projectId;
  const project = await persistDesignRequest(pool, designRequest);
  if (!designRequest.approvalId) {
    const preferences = await startDesignRound(pool, {
      projectId: projectKey,
      subjectId: preferenceSubjectId,
      startKey: `dispatch:${key}`,
      architectureDigest: designRequest.architecture.contentDigest,
      architectureRevision: designRequest.architecture.revision,
    });
    const agent = await admitDesignAgent(
      pool,
      `${trustedControlSpiffeId}/prism/main/v2`,
      projectKey,
      preferences,
    );
    return json(response, 202, {
      result: { status: "waiting", projectId: project.rows[0]!.id },
      preferences,
      agent,
    });
  }
  const baseline = await approvedRoundBaseline(
    pool,
    project.rows[0]!.id,
    designRequest.approvalId,
  );
  if (!baseline.rows[0]) throw new Error("approved Prism baseline not found");
  return json(response, 200, {
    result: {
      bundleDigest: baseline.rows[0].bundle_digest,
      artifactId: baseline.rows[0].bundle_artifact_id,
      archiveBase64: Buffer.from(
        await artifacts.get(baseline.rows[0].bundle_artifact_id),
      ).toString("base64"),
    },
  });
}

async function authenticateDispatch(
  config: ControlContext["config"],
  request: IncomingMessage,
) {
  const {
    spiffeEnabled,
    dispatchSecret,
    trustedNovaSpiffeId,
    trustedPrismAgentSpiffeId,
    trustedTestRunnerSpiffeId,
  } = config;
  if (spiffeEnabled) {
    try {
      authorizeProxiedSpiffePeer(
        request.headers,
        request.socket.remoteAddress,
        new Set(
          [
            trustedNovaSpiffeId,
            trustedPrismAgentSpiffeId,
            trustedTestRunnerSpiffeId,
          ].filter(Boolean),
        ),
      );
    } catch {
      throw new Error("invalid dispatch identity");
    }
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
    if (size > config.maximumDispatchBodyBytes) throw new Error("request too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  const key = String(request.headers["idempotency-key"] ?? "");
  if (!key) throw new Error("invalid dispatch idempotency key");
  if (!spiffeEnabled) {
    const supplied = String(
      request.headers["x-kubeclaw-signature"] ?? "",
    ).replace(/^v1=/, "");
    const expected = createHmac("sha256", dispatchSecret)
      .update(`${key}.${raw.toString("utf8")}`)
      .digest();
    const actual = Buffer.from(supplied, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error("invalid dispatch signature");
  }
  return { raw, key };
}

type DesignRequest = {
  schema: "prism.design-request.v1";
  projectId: string;
  architecture: { artifactId: string; contentDigest: string; revision: number };
  architectureContent: Record<string, unknown>;
  approvalId?: string;
};
async function persistDesignRequest(
  pool: ControlContext["pool"],
  designRequest: DesignRequest,
) {
  const projectKey = designRequest.projectId;
  const project = await pool.query<{ id: string }>(
    "INSERT INTO prism.project(id,external_id,name) VALUES($1,$2,$3) ON CONFLICT(external_id) DO UPDATE SET updated_at=now() RETURNING id",
    [randomUUID(), projectKey, projectKey],
  );
  await inTransaction(pool, async (requestClient) => {
    await requestClient.query(
      "SELECT id FROM prism.project WHERE id=$1 FOR UPDATE",
      [project.rows[0]!.id],
    );
    const active = await requestClient.query<{
      architecture_digest: string;
      architecture_revision: number | string;
      request: Record<string, unknown>;
    }>(
      "SELECT architecture_digest,architecture_revision,request FROM prism.design_request WHERE project_id=$1 AND status='active' ORDER BY architecture_revision DESC LIMIT 1",
      [project.rows[0]!.id],
    );
    if (active.rows[0])
      assertArchitectureTransition(active.rows[0], designRequest);
    await requestClient.query(
      "UPDATE prism.design_request SET status='superseded' WHERE project_id=$1 AND architecture_revision<$2 AND status='active'",
      [project.rows[0]!.id, designRequest.architecture.revision],
    );
    await requestClient.query(
      "INSERT INTO prism.design_request(id,project_id,architecture_artifact_id,architecture_digest,architecture_revision,request,status) VALUES($1,$2,$3,$4,$5,$6::jsonb,'active') ON CONFLICT(project_id,architecture_revision) DO UPDATE SET architecture_artifact_id=excluded.architecture_artifact_id,architecture_digest=excluded.architecture_digest,request=excluded.request,status='active'",
      [
        randomUUID(),
        project.rows[0]!.id,
        designRequest.architecture.artifactId,
        designRequest.architecture.contentDigest,
        designRequest.architecture.revision,
        JSON.stringify(designRequest),
      ],
    );
  });
  return project;
}

interface DispatchPayload {
  preferenceSubjectId?: string;
  request?: {
    projectId?: string;
    approvalId?: string;
    schema?: string;
    architecture?: { artifactId?: string; contentDigest?: string };
    architectureContent?: unknown;
  };
}
