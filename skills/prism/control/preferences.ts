import { randomUUID } from "node:crypto";
import { inTransaction, type Database, type Queryable } from "../storage/index.ts";
import type { PreferenceEvent } from "../preferences/index.ts";

export async function lockPreference(connection: Queryable, wireId: string): Promise<void> {
  await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`prism-preference:${wireId}`]);
}

export async function insertPreference(connection: Queryable, event: PreferenceEvent, receipt?: { digest: string; response: unknown }): Promise<void> {
  const project = event.projectId ? await connection.query<{id: string}>("SELECT id FROM prism.project WHERE external_id=$1", [event.projectId]) : null;
  if (event.projectId && !project?.rows[0]) throw new Error("preference project is not available");
  await connection.query(
    "INSERT INTO prism.preference_event(id,wire_event_id,project_id,subject_id,event_type,content,consent_scope,occurred_at,request_digest,decision_response) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb)",
    [randomUUID(), event.eventId, project?.rows[0]?.id ?? null, event.userId, event.action, JSON.stringify(event), event.learningScope, event.occurredAt, receipt?.digest ?? null, receipt ? JSON.stringify(receipt.response) : null],
  );
}

export async function recordPreference(db: Database, event: PreferenceEvent): Promise<void> {
  await inTransaction(db, async (connection) => {
    await lockPreference(connection, event.eventId);
    const prior = await connection.query<{matches: boolean}>("SELECT e.content=$2::jsonb AND e.subject_id=$3 AND p.external_id IS NOT DISTINCT FROM $4::text AS matches FROM prism.preference_event e LEFT JOIN prism.project p ON p.id=e.project_id WHERE e.wire_event_id=$1", [event.eventId, JSON.stringify(event), event.userId, event.projectId ?? null]);
    if (prior.rows[0]) {
      if (!prior.rows[0].matches) throw new Error("preference event ID conflicts with recorded evidence");
      return;
    }
    await insertPreference(connection, event);
  });
}
