import { type IncomingMessage, type ServerResponse } from "node:http";
import { admitDesignAgent, agentReceipt } from "../control/agent-admission.ts";
import { agentJob } from "../control/agent-jobs.ts";
import { startDesignRound } from "../control/design-generations.ts";
import {
  decideDirection,
  directionIdempotencyKey,
} from "../control/direction-decisions.ts";

import type { AuthenticatedControlContext } from "./control-context.ts";
import { body, json, userKey } from "./control-http.ts";
type RouteContext = Pick<
  AuthenticatedControlContext,
  "pool" | "actor" | "config"
>;

export async function directionRoutes(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const directions = /^\/v1\/projects\/([0-9a-f-]+)\/directions$/.exec(
    url.pathname,
  );
  if (directions && request.method === "GET") {
    await listDirections(context, response, directions);
    return true;
  }
  if (directions && request.method === "POST") {
    await startDirectionRound(context, request, response, directions);
    return true;
  }
  const directionFeedback = /^\/v1\/directions\/([0-9a-f-]+)\/feedback$/.exec(
    url.pathname,
  );
  if (directionFeedback && request.method === "POST") {
    await recordDirectionFeedback(
      context,
      request,
      response,
      directionFeedback,
    );
    return true;
  }
  const selectDirection = /^\/v1\/directions\/([0-9a-f-]+)\/select$/.exec(
    url.pathname,
  );
  if (selectDirection && request.method === "POST") {
    await selectDesignDirection(context, request, response, selectDirection);
    return true;
  }
  return false;
}
async function listDirections(
  context: RouteContext,
  response: ServerResponse,
  directions: RegExpExecArray,
) {
  const { pool } = context;

  const activeJob = await pool.query<{ id: string }>(
    "SELECT j.id FROM prism.agent_job j JOIN prism.design_request r ON r.current_round_id=j.id WHERE r.project_id=$1 AND r.status='active'",
    [directions[1]],
  );
  if (activeJob.rows[0])
    agentReceipt(await agentJob(pool, activeJob.rows[0].id));
  const result = await pool.query(
    "SELECT d.id,doc.design_round_id AS generation_id,d.source_document_id,d.direction_key,d.title,d.summary,d.proposal,d.state,d.content_digest,d.evidence FROM prism.direction d JOIN prism.design_document doc ON doc.id=d.source_document_id JOIN prism.design_request r ON r.id=doc.design_request_id AND r.status='active' AND doc.design_round_id IS NOT DISTINCT FROM r.current_round_id WHERE d.project_id=$1 ORDER BY d.created_at,d.id",
    [directions[1]],
  );
  return json(response, 200, { items: result.rows });
}
async function startDirectionRound(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  directions: RegExpExecArray,
) {
  const { pool, actor } = context;
  const { trustedControlSpiffeId } = context.config;

  const input = (await body(request)) as {
    documentId?: string;
    expectedRevision?: number;
    parentRoundId?: string;
    idempotencyKey?: string;
  };
  if (
    !input.documentId ||
    !Number.isSafeInteger(input.expectedRevision) ||
    !input.idempotencyKey
  )
    throw new Error(
      "documentId, expectedRevision and idempotencyKey are required",
    );
  const project = await pool.query<{ external_id: string }>(
    "SELECT external_id FROM prism.project WHERE id=$1",
    [directions[1]],
  );
  const requestResult = await pool.query<{
    request: Record<string, unknown>;
    architecture_digest: string;
    architecture_revision: number;
  }>(
    "SELECT request,architecture_digest,architecture_revision FROM prism.design_request WHERE project_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1",
    [directions[1]],
  );
  if (!project.rows[0] || !requestResult.rows[0])
    throw new Error("active Prism project not found");
  const preferences = await startDesignRound(pool, {
    projectId: project.rows[0].external_id,
    subjectId: userKey(actor.user),
    startKey: `studio:${userKey(actor.user)}:${input.idempotencyKey}`,
    architectureDigest: requestResult.rows[0].architecture_digest,
    architectureRevision: Number(requestResult.rows[0].architecture_revision),
    parentRoundId: input.parentRoundId,
    documentId: input.documentId,
    expectedRevision: input.expectedRevision,
  });
  return json(
    response,
    202,
    await admitDesignAgent(
      pool,
      `${trustedControlSpiffeId}/prism/main/v2`,
      project.rows[0].external_id,
      preferences,
    ),
  );
}
async function recordDirectionFeedback(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  directionFeedback: RegExpExecArray,
) {
  const { pool, actor } = context;

  const input = (await body(request)) as {
    action?: "rejected" | "liked" | "disliked" | "preserved";
    trait?: string;
  };
  if (
    !input.action ||
    !["rejected", "liked", "disliked", "preserved"].includes(input.action)
  )
    throw new Error("supported direction feedback action is required");
  const result = await decideDirection(
    pool,
    userKey(actor.user),
    directionFeedback[1]!,
    directionIdempotencyKey(request.headers["idempotency-key"]),
    {
      action: input.action,
      ...(input.trait === undefined ? {} : { trait: input.trait }),
    },
  );
  return json(response, 201, result);
}
async function selectDesignDirection(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  selectDirection: RegExpExecArray,
) {
  const { pool, actor } = context;

  const input = (await body(request)) as { documentId?: string };
  if (!input.documentId) throw new Error("documentId is required");
  const result = await decideDirection(
    pool,
    userKey(actor.user),
    selectDirection[1]!,
    directionIdempotencyKey(request.headers["idempotency-key"]),
    { action: "selected", documentId: input.documentId },
  );
  return json(response, 200, result);
}
