import { validatePrism } from "@kubeclaw/prism-contracts-v1";
import { type IncomingMessage, type ServerResponse } from "node:http";
import {
  preferenceEvents,
  setPersonalPreferences,
} from "../control/preference-snapshot.ts";
import { recordPreference } from "../control/preferences.ts";
import {
  projectPreferences,
  type PreferenceEvent,
} from "../preferences/index.ts";

import type { AuthenticatedControlContext } from "./control-context.ts";
import { body, json, userKey } from "./control-http.ts";
type RouteContext = Pick<AuthenticatedControlContext, "pool" | "actor" | "config">;

export async function preferenceRoutes(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === "/v1/preferences/policy" && request.method === "PUT") {
    await updatePreferencePolicy(context, request, response);
    return true;
  }
  if (url.pathname === "/v1/preferences" && request.method === "POST") {
    await recordPreferenceEvent(context, request, response);
    return true;
  }
  if (url.pathname === "/v1/preferences" && request.method === "GET") {
    await listPreferenceEvents(context, response, url);
    return true;
  }
  return false;
}
async function updatePreferencePolicy(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { pool, actor } = context;

  const input = (await body(request, context.config.maximumJsonBodyBytes)) as {
    projectId?: string;
    personalEnabled?: boolean;
  };
  if (!input.projectId || typeof input.personalEnabled !== "boolean")
    throw new Error("projectId and personalEnabled are required");
  await setPersonalPreferences(
    pool,
    userKey(actor.user),
    input.projectId,
    input.personalEnabled,
  );
  return json(response, 200, {
    projectId: input.projectId,
    personalEnabled: input.personalEnabled,
  });
}
async function recordPreferenceEvent(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { pool, actor } = context;

  const event = validatePrism<PreferenceEvent>(
    "preferenceEvent",
    await body(request, context.config.maximumJsonBodyBytes),
  );
  if (event.userId !== userKey(actor.user))
    throw new Error("preference user does not match the session");
  if (event.action === "retracted" && !event.retractsEventId)
    throw new Error("retraction target is required");
  await recordPreference(pool, event);
  return json(response, 201, { id: event.eventId });
}
async function listPreferenceEvents(
  context: RouteContext,
  response: ServerResponse,
  url: URL,
) {
  const { pool, actor } = context;

  const projectId = url.searchParams.get("project");
  const events = await preferenceEvents(pool, userKey(actor.user), projectId);
  return json(response, 200, {
    events,
    learned: projectPreferences(events),
  });
}
