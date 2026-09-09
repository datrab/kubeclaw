import { createHash } from "node:crypto";
import { inTransaction, RevisionRepository, type Database, type Queryable } from "../storage/index.ts";
import type { PreferenceEvent } from "../preferences/index.ts";
import { insertPreference, lockPreference } from "./preferences.ts";

type Decision = { action: "selected"; documentId: string } | { action: "rejected" | "liked" | "disliked" | "preserved"; trait?: string };
type Direction = { project_id: string; external_id: string; direction_key: string; state: string; source_document_id: string; source_revision_id: string };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function directionIdempotencyKey(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new Error("Idempotency-Key is required and must contain at most 200 characters");
  return value;
}

async function lockedDirection(connection: Queryable, id: string): Promise<Direction> {
  const project = await connection.query<{project_id: string}>("SELECT project_id FROM prism.direction WHERE id=$1", [id]);
  if (!project.rows[0]) throw new Error("direction is not available");
  await connection.query("SELECT id FROM prism.project WHERE id=$1 FOR UPDATE", [project.rows[0].project_id]);
  const result = await connection.query<Direction>("SELECT d.project_id,p.external_id,d.direction_key,d.state,d.source_document_id,d.source_revision_id FROM prism.direction d JOIN prism.project p ON p.id=d.project_id WHERE d.id=$1 FOR UPDATE OF d", [id]);
  if (!result.rows[0]) throw new Error("direction is not available");
  return result.rows[0];
}

async function applyDecision(connection: Queryable, direction: Direction, id: string, input: Decision): Promise<unknown> {
  if (input.action !== "selected") {
    if (input.action === "rejected") {
      if (direction.state !== "proposed") throw new Error("only a proposed direction can be rejected");
      await connection.query("UPDATE prism.direction SET state='rejected' WHERE id=$1", [id]);
    }
    return { state: input.action === "rejected" ? "rejected" : "recorded" };
  }
  if (direction.state !== "proposed") throw new Error("direction is not available");
  await connection.query("SELECT id FROM prism.design_document WHERE id=$1 FOR UPDATE", [direction.source_document_id]);
  const current = await new RevisionRepository(connection).current(direction.source_document_id);
  if (direction.source_revision_id !== current.id) throw new Error("direction is stale; generate new directions from the current revision");
  const updated = await connection.query<{id: string}>("UPDATE prism.direction SET state=CASE WHEN id=$1 THEN 'selected' ELSE 'rejected' END WHERE project_id=$2 AND source_document_id IN (SELECT d.id FROM prism.design_document d JOIN prism.design_request r ON r.id=d.design_request_id AND r.status='active' WHERE d.project_id=$2) AND state IN ('proposed','selected') RETURNING id", [id, direction.project_id]);
  if (!updated.rows.some((row) => row.id === id)) throw new Error("direction is not part of the active design request");
  return { document: current.document, documentId: direction.source_document_id, directionKey: direction.direction_key };
}

export async function decideDirection(db: Database, userId: string, id: string, key: string, input: Decision): Promise<unknown> {
  directionIdempotencyKey(key);
  const eventId = `event-${digest([userId, key])}`;
  const requestDigest = digest([userId, id, input]);
  return inTransaction(db, async (connection) => {
    await lockPreference(connection, eventId);
    const prior = await connection.query<{subject_id: string; request_digest: string | null; decision_response: unknown}>("SELECT subject_id,request_digest,decision_response FROM prism.preference_event WHERE wire_event_id=$1", [eventId]);
    if (prior.rows[0]) {
      if (prior.rows[0].subject_id !== userId || prior.rows[0].request_digest !== requestDigest) throw new Error("Idempotency-Key conflicts with a recorded decision");
      return prior.rows[0].decision_response;
    }
    const direction = await lockedDirection(connection, id);
    const result = await applyDecision(connection, direction, id, input);
    const response = input.action === "selected" ? result : { ...(result as object), eventId };
    const event: PreferenceEvent = { schema: "prism.preference-event.v1", eventId, userId, projectId: direction.external_id, action: input.action, target: {directionId: id}, traits: [input.action === "selected" ? direction.direction_key : input.trait?.trim() || direction.direction_key], context: {surface: "direction"}, source: "explicit", learningScope: "project", occurredAt: new Date().toISOString() };
    await insertPreference(connection, event, {digest: requestDigest, response});
    return response;
  });
}
