import { randomBytes } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { evaluate } from "../evaluation/index.ts";

import type { AuthenticatedControlContext } from "./control-context.ts";
import { body, json } from "./control-http.ts";
type RouteContext = Pick<
  AuthenticatedControlContext,
  "pool" | "repository" | "actor"
>;

export async function approvalRoute(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === "/v1/approvals" && request.method === "POST") {
    await approveDocument(context, request, response);
    return true;
  }
  return false;
}
async function approveDocument(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { pool, repository, actor } = context;

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
  const activeRequest = await pool.query<{ architecture_digest: string }>(
    "SELECT r.architecture_digest FROM prism.design_request r JOIN prism.design_document d ON d.design_request_id=r.id WHERE r.project_id=$1 AND r.status='active' AND d.design_round_id IS NOT DISTINCT FROM r.current_round_id AND d.id=$2 ORDER BY r.created_at DESC LIMIT 1",
    [input.projectId, input.documentId],
  );
  if (!activeRequest.rows[0])
    throw new Error("active Prism design request is required for approval");
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
