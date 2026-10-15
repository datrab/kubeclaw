import { randomBytes } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";
import {
  exchangeTailscaleIdentity,
  verifySession,
} from "../control/session.ts";

import type { ControlContext } from "./control-context.ts";
import { json, userKey } from "./control-http.ts";
type RouteContext = Pick<ControlContext, "config">;

export async function sessionRoutes(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === "/v1/session" && request.method === "POST") {
    await createSession(context, request, response);
    return true;
  }
  return false;
}
async function createSession(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { sessionSecret, ingressSecret } = context.config;

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
    context.config.sessionLifetimeSeconds,
  );
  const csrf = randomBytes(24).toString("base64url");
  response.setHeader("set-cookie", [
    `prism_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${context.config.sessionLifetimeSeconds}`,
    `prism_csrf=${encodeURIComponent(csrf)}; Secure; SameSite=Strict; Path=/; Max-Age=${context.config.sessionLifetimeSeconds}`,
  ]);
  return json(response, 201, {
    csrf,
    userId: userKey(verifySession(token, sessionSecret).user),
  });
}
