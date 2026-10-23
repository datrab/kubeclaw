import {
  validatePrism,
  type PrismDocument,
} from "@kubeclaw/prism-contracts-v1";
import { type IncomingMessage, type ServerResponse } from "node:http";

import type { AuthenticatedControlContext } from "./control-context.ts";
import { body, json } from "./control-http.ts";
type RouteContext = Pick<
  AuthenticatedControlContext,
  "pool" | "repository" | "actor"
 | "config">;

export async function documentRoutes(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === "/v1/documents" && request.method === "POST") {
    await createDocument(context, request, response);
    return true;
  }
  return false;
}
async function createDocument(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { pool, repository, actor } = context;

  const input = (await body(request, context.config.maximumJsonBodyBytes)) as {
    projectId?: string;
    key?: string;
    document?: PrismDocument;
  };
  validatePrism<PrismDocument>("designDocument", input.document);
  if (!input.projectId || !input.key)
    throw new Error("projectId and key are required");
  const activeRequest = await pool.query<{ id: string }>(
    "SELECT id FROM prism.design_request WHERE project_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1",
    [input.projectId],
  );
  if (!activeRequest.rows[0])
    throw new Error(
      "active Prism design request is required before document creation",
    );
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

export async function documentHistoryRoutes(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const { repository, actor } = context;

  const current = /^\/v1\/documents\/([0-9a-f-]+)$/.exec(url.pathname);
  if (current && request.method === "GET") {
    json(response, 200, await repository.current(current[1]!));
    return true;
  }
  const revisions = /^\/v1\/documents\/([0-9a-f-]+)\/revisions$/.exec(
    url.pathname,
  );
  if (revisions && request.method === "GET") {
    json(response, 200, {
      items: await repository.history(revisions[1]!),
    });
    return true;
  }
  const restore =
    /^\/v1\/documents\/([0-9a-f-]+)\/revisions\/([0-9a-f-]+)\/restore$/.exec(
      url.pathname,
    );
  if (restore && request.method === "POST") {
    json(
      response,
      200,
      await repository.restore(restore[1]!, restore[2]!, actor.user),
    );
    return true;
  }
  const operations = /^\/v1\/documents\/([0-9a-f-]+)\/operations$/.exec(
    url.pathname,
  );
  if (operations && request.method === "POST") {
    json(
      response,
      200,
      await repository.apply(
        operations[1]!,
        (await body(request, context.config.maximumJsonBodyBytes)) as never,
        actor.user,
      ),
    );
    return true;
  }
  return false;
}
