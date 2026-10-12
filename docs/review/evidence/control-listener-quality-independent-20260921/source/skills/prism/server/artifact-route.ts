import { type IncomingMessage, type ServerResponse } from "node:http";

import type { AuthenticatedControlContext } from "./control-context.ts";
type RouteContext = Pick<AuthenticatedControlContext, "artifacts">;

export async function artifactRoute(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const artifact = /^\/v1\/artifacts\/(sha256:[a-f0-9]{64})$/.exec(
    url.pathname,
  );
  if (artifact && request.method === "GET") {
    await downloadArtifact(context, response, artifact);
    return true;
  }
  return false;
}
async function downloadArtifact(
  context: RouteContext,
  response: ServerResponse,
  artifact: RegExpExecArray,
) {
  const { artifacts } = context;

  const content = await artifacts.get(`artifact:${artifact[1]}`);
  response.writeHead(200, { "content-type": "application/octet-stream" });
  return response.end(content);
}
