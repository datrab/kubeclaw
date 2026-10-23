import { randomUUID } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { agentReceipt } from "../control/agent-admission.ts";
import { agentJob } from "../control/agent-jobs.ts";
import { inTransaction } from "../storage/index.ts";

import type { AuthenticatedControlContext } from "./control-context.ts";
import { body, json } from "./control-http.ts";
type RouteContext = Pick<
  AuthenticatedControlContext,
  "pool" | "artifacts" | "actor"
 | "config">;

export async function projectRoutes(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const { pool } = context;

  const agentStatus = /^\/v1\/agent-jobs\/([0-9a-f-]+)$/.exec(url.pathname);
  if (agentStatus && request.method === "GET") {
    json(response, 200, agentReceipt(await agentJob(pool, agentStatus[1]!)));
    return true;
  }
  if (url.pathname === "/v1/projects" && request.method === "GET") {
    await listProjects(context, response);
    return true;
  }
  const projectBrief = /^\/v1\/projects\/([0-9a-f-]+)\/brief$/.exec(
    url.pathname,
  );
  if (projectBrief && request.method === "GET") {
    await readProjectBrief(context, response, projectBrief);
    return true;
  }
  if (url.pathname === "/v1/projects" && request.method === "POST") {
    await createProject(context, request, response);
    return true;
  }
  return false;
}
async function listProjects(context: RouteContext, response: ServerResponse) {
  const { pool } = context;

  const result = await pool.query<{
    id: string;
    external_id: string;
    name: string;
    document_id: string | null;
    direction_count: number;
  }>(
    "SELECT p.id,p.external_id,p.name,(SELECT d.source_document_id FROM prism.direction d JOIN prism.design_document doc ON doc.id=d.source_document_id JOIN prism.design_request r ON r.id=doc.design_request_id AND r.status='active' AND doc.design_round_id IS NOT DISTINCT FROM r.current_round_id WHERE d.project_id=p.id ORDER BY d.created_at,d.id LIMIT 1) AS document_id,(SELECT count(*)::int FROM prism.direction d JOIN prism.design_document doc ON doc.id=d.source_document_id JOIN prism.design_request r ON r.id=doc.design_request_id AND r.status='active' AND doc.design_round_id IS NOT DISTINCT FROM r.current_round_id WHERE d.project_id=p.id) AS direction_count FROM prism.project p ORDER BY p.updated_at DESC,p.id",
  );
  return json(response, 200, { items: result.rows });
}
async function readProjectBrief(
  context: RouteContext,
  response: ServerResponse,
  projectBrief: RegExpExecArray,
) {
  const { pool } = context;

  const result = await pool.query(
    "SELECT architecture_artifact_id,architecture_digest,request,created_at FROM prism.design_request WHERE project_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1",
    [projectBrief[1]],
  );
  if (!result.rows[0]) throw new Error("active Prism design request not found");
  return json(response, 200, result.rows[0]);
}
async function createProject(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { pool, artifacts } = context;

  const input = (await body(request, context.config.maximumJsonBodyBytes)) as {
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
  const projectId = await inTransaction(pool, async (client) => {
    const project = await client.query<{ id: string }>(
      "INSERT INTO prism.project(id,external_id,name) VALUES($1,$2,$3) RETURNING id",
      [randomUUID(), input.externalId, input.name],
    );
    const projectId = project.rows[0]!.id;
    await client.query(
      "INSERT INTO prism.design_request(id,project_id,architecture_artifact_id,architecture_digest,architecture_revision,request,status) VALUES($1,$2,$3,$4,1,$5::jsonb,'active')",
      [
        randomUUID(),
        projectId,
        architecture.artifactId,
        architecture.digest,
        JSON.stringify(designRequest),
      ],
    );
    return projectId;
  });
  return json(response, 201, { id: projectId });
}
