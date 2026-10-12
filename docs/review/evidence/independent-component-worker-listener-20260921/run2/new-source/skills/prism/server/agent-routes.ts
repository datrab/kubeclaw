import {
  validatePrism,
  type PrismDocument,
} from "@kubeclaw/prism-contracts-v1";
import { authorizeProxiedSpiffePeer } from "@kubeclaw/worker-core";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { requirePreferenceGeneration } from "../control/preference-snapshot.ts";
import { assertMaterialDirectionDiversity } from "../directions/index.ts";
import { handleAgentJobs } from "./agent-job-routes.ts";

import type { ControlContext } from "./control-context.ts";
import { body, json } from "./control-http.ts";
type RouteContext = Pick<ControlContext, "config" | "pool" | "repository">;

export async function agentRoutes(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const { pool } = context;
  const { spiffeEnabled, trustedPrismAgentSpiffeId } = context.config;

  if (
    await handleAgentJobs(request, response, url, {
      db: pool,
      spiffeEnabled,
      trustedAgentId: trustedPrismAgentSpiffeId,
      readBody: body,
    })
  )
    return true;
  if (url.pathname === "/v1/agent/design-sets" && request.method === "POST") {
    await createAgentDesignSet(context, request, response);
    return true;
  }
  if (url.pathname === "/v1/agent/revisions" && request.method === "POST") {
    await reviseAgentDocument(context, request, response);
    return true;
  }
  return false;
}
async function createAgentDesignSet(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { pool, repository } = context;
  const { spiffeEnabled, trustedPrismAgentSpiffeId, studioPublicUrl } =
    context.config;

  if (!spiffeEnabled)
    throw new Error("Prism agent tools require SPIFFE worker trust");
  authorizeProxiedSpiffePeer(
    request.headers,
    request.socket.remoteAddress,
    new Set([trustedPrismAgentSpiffeId]),
  );
  const input = (await body(request)) as DesignSetInput;
  if (!input.projectId || input.designs?.length !== 3)
    throw new Error("exactly three Prism designs are required");
  if (new Set(input.designs.map((item) => item.key)).size !== 3)
    throw new Error("Prism direction keys must be unique");
  const generation = await requirePreferenceGeneration(
    pool,
    input.generationId,
    input.projectId,
    { operation: "design-set" },
  );
  const documents = input.designs.map((item) =>
    validatePrism<PrismDocument>("designDocument", item.document),
  );
  assertMaterialDirectionDiversity(documents);
  const designs = input.designs.map((item, index) => {
    if (!item.key || !item.title || !item.summary)
      throw new Error("each Prism design requires key, title, and summary");
    return {
      key: item.key,
      title: item.title,
      summary: item.summary,
      document: documents[index]!,
      evidence: { ...item.evidence, ...generation },
    };
  });
  const result = await repository.createDirectionSet(
    input.projectId,
    input.generationId!,
    designs,
    { jobId: input.jobId, fence: input.fence, payload: input },
  );
  return json(response, result.status === "created" ? 201 : 200, {
    ...result,
    studioUrl: `${studioPublicUrl}?project=${result.projectId}&document=${result.documentId}`,
  });
}
async function reviseAgentDocument(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { pool, repository } = context;
  const { spiffeEnabled, trustedPrismAgentSpiffeId } = context.config;

  if (!spiffeEnabled)
    throw new Error("Prism agent tools require SPIFFE worker trust");
  authorizeProxiedSpiffePeer(
    request.headers,
    request.socket.remoteAddress,
    new Set([trustedPrismAgentSpiffeId]),
  );
  const input = (await body(request)) as AgentRevisionInput;
  if (
    !input.projectId ||
    !input.documentId ||
    !input.instruction ||
    !Number.isSafeInteger(input.expectedRevision)
  )
    throw new Error("complete Prism revision input is required");
  const owner = await pool.query<{ external_id: string }>(
    "SELECT p.external_id FROM prism.design_document d JOIN prism.project p ON p.id=d.project_id WHERE d.id=$1",
    [input.documentId],
  );
  if (owner.rows[0]?.external_id !== input.projectId)
    throw new Error("document does not belong to the Prism project");
  const generation = await requirePreferenceGeneration(
    pool,
    input.generationId,
    input.projectId,
    {
      operation: "revise",
      documentId: input.documentId,
      expectedRevision: input.expectedRevision,
    },
  );
  const current = await repository.revision(
    input.documentId,
    input.expectedRevision!,
  );
  const document = validatePrism<PrismDocument>(
    "designDocument",
    input.document,
  );
  if (document.meta.revision !== input.expectedRevision! + 1)
    throw new Error(
      "Prism agent must increment the document revision exactly once",
    );
  const updated = await repository.replace(
    input.documentId,
    current.id,
    document,
    { type: "agent.revision", instruction: input.instruction, ...generation },
    "agent:prism",
    { jobId: input.jobId, fence: input.fence, payload: input },
  );
  return json(response, 200, { status: "updated", document: updated });
}

interface DesignSetInput {
  projectId?: string;
  generationId?: string;
  jobId: string;
  fence: string;
  designs?: Array<{
    key?: string;
    title?: string;
    summary?: string;
    document?: PrismDocument;
    evidence?: Record<string, unknown>;
  }>;
}
interface AgentRevisionInput {
  jobId: string;
  fence: string;
  generationId?: string;
  projectId?: string;
  documentId?: string;
  expectedRevision?: number;
  instruction?: string;
  document?: PrismDocument;
}
