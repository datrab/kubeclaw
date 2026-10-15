import { randomUUID } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { baselineArchive } from "./baseline-archive.ts";
import type { BaselineInput } from "./baseline-validation.ts";
import {
  baselineSpecification,
  validateBaseline,
} from "./baseline-validation.ts";

import type { AuthenticatedControlContext } from "./control-context.ts";
import { body, json } from "./control-http.ts";
type RouteContext = Pick<
  AuthenticatedControlContext,
  "pool" | "repository" | "artifacts" | "runWorker"
 | "config">;

export async function baselineRoute(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === "/v1/baselines" && request.method === "POST") {
    await publishBaseline(context, request, response);
    return true;
  }
  return false;
}
async function publishBaseline(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { pool } = context;

  const input = (await body(request, context.config.maximumJsonBodyBytes)) as {
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
  const publication = input as BaselineInput;
  const validated = await validateBaseline(context, publication);
  const evidence = await baselineSpecification(
    pool,
    publication,
    validated.currentDocument,
  );
  const assembled = await baselineArchive(
    context,
    publication.approvalId,
    validated,
    evidence,
  );
  return json(
    response,
    201,
    await persistBaseline(
      context,
      publication,
      validated.currentDocument,
      assembled,
    ),
  );
}

import type { CurrentDocument } from "./baseline-validation.ts";
import type { ControlContext } from "./control-context.ts";
export async function persistBaseline(
  context: Pick<ControlContext, "pool" | "artifacts">,
  input: BaselineInput,
  currentDocument: CurrentDocument,
  assembled: Awaited<ReturnType<typeof baselineArchive>>,
) {
  const { pool, artifacts } = context;
  const { manifest, checksums, bundleDigest } = assembled;
  const bundle = await artifacts.put(assembled.bytes);
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
  return {
    bundleDigest,
    artifactId: bundle.artifactId,
    manifest,
  };
}
