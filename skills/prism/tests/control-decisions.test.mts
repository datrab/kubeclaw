import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { validatePrism, type PrismDocument } from "@kubeclaw/prism-contracts-v1";
import { migrate, RevisionRepository } from "../storage/index.ts";
import { decideDirection, directionIdempotencyKey } from "../control/direction-decisions.ts";
import { recordPreference } from "../control/preferences.ts";
import type { PreferenceEvent } from "../preferences/index.ts";

async function fixture() {
  const db = new PGlite({extensions: {vector}});
  await migrate(db);
  const repository = new RevisionRepository(db);
  const project = await repository.createProject("project-control", "Control");
  const document = JSON.parse(await readFile(new URL("../../../contracts/prism/v1/fixtures/minimal-web.json", import.meta.url), "utf8")) as PrismDocument;
  const request = randomUUID();
  await db.query("INSERT INTO prism.design_request(id,project_id,architecture_artifact_id,architecture_digest,architecture_revision,request) VALUES($1,$2,'artifact','digest',1,'{}')", [request, project]);
  const ids: string[] = [];
  const documents: string[] = [];
  for (let i = 0; i < 3; i++) {
    const doc = await repository.createDocument(project, `choice-${i}`, document, "operator");
    await db.query("UPDATE prism.design_document SET design_request_id=$2 WHERE id=$1", [doc, request]);
    const revision = await repository.current(doc);
    const id = randomUUID(); ids.push(id); documents.push(doc);
    await db.query("INSERT INTO prism.direction(id,project_id,direction_key,title,summary,proposal,content_digest,state,source_document_id,source_revision_id) VALUES($1,$2,$3,'Choice','Summary',$4::jsonb,'digest','proposed',$5,$6)", [id, project, `choice-${i}`, JSON.stringify(document), doc, revision.id]);
  }
  return {db, repository, ids, documents};
}

async function rows(db: PGlite) { return (await db.query<{state: string}>("SELECT state FROM prism.direction ORDER BY direction_key")).rows.map((row) => row.state); }
async function eventCount(db: PGlite) { return (await db.query("SELECT id FROM prism.preference_event")).rows.length; }

test("direction selection rolls back on actual SQL insert failure and replays a committed response", async () => {
  const {db, ids, documents} = await fixture();
  try {
    await db.exec("CREATE FUNCTION prism.fail_preference() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected preference insert failure'; END $$; CREATE TRIGGER fail_preference BEFORE INSERT ON prism.preference_event FOR EACH ROW EXECUTE FUNCTION prism.fail_preference();");
    await assert.rejects(decideDirection(db, "user-operator", ids[0]!, "select-once", {action: "selected", documentId: documents[1]!}), /injected preference insert failure/);
    assert.deepEqual(await rows(db), ["proposed", "proposed", "proposed"]); assert.equal(await eventCount(db), 0);
    await db.exec("DROP TRIGGER fail_preference ON prism.preference_event;");
    const response = await decideDirection(db, "user-operator", ids[0]!, "select-once", {action: "selected", documentId: documents[1]!});
    assert.deepEqual(await rows(db), ["selected", "rejected", "rejected"]);
    assert.deepEqual(await decideDirection(db, "user-operator", ids[0]!, "select-once", {action: "selected", documentId: documents[1]!}), response);
    assert.equal(await eventCount(db), 1);
    await assert.rejects(decideDirection(db, "user-operator", ids[1]!, "select-once", {action: "selected", documentId: documents[1]!}), /conflicts/);
    const event = (await db.query<{id: string; wire_event_id: string; content: PreferenceEvent}>("SELECT id,wire_event_id,content FROM prism.preference_event")).rows[0]!;
    assert.match(event.id, /^[0-9a-f-]{36}$/); assert.match(event.wire_event_id, /^event-/);
    validatePrism("preferenceEvent", event.content);
  } finally { await db.close(); }
});

test("all feedback actions persist valid wire IDs, explicit retries deduplicate and fresh actions remain distinct", async () => {
  const {db, ids} = await fixture();
  try {
    for (const action of ["liked", "disliked", "preserved", "rejected"] as const) {
      const response = await decideDirection(db, "user-operator", ids[0]!, action, {action});
      assert.deepEqual(await decideDirection(db, "user-operator", ids[0]!, action, {action}), response);
    }
    assert.equal(await eventCount(db), 4);
    await decideDirection(db, "user-operator", ids[0]!, "second-like", {action: "liked"});
    assert.equal(await eventCount(db), 5);
    assert.equal((await rows(db))[0], "rejected");
    assert.throws(() => directionIdempotencyKey(undefined), /Idempotency-Key/);
    await assert.rejects(decideDirection(db, "user-operator", ids[1]!, "", {action: "liked"}), /Idempotency-Key/);
    assert.equal(await eventCount(db), 5);
  } finally { await db.close(); }
});

test("failed rejection retains proposed state; stale and historical partial selections do not invent receipts", async () => {
  const {db, repository, ids, documents} = await fixture();
  try {
    await db.exec("CREATE FUNCTION prism.fail_preference() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'reject insert failed'; END $$; CREATE TRIGGER fail_preference BEFORE INSERT ON prism.preference_event FOR EACH ROW EXECUTE FUNCTION prism.fail_preference();");
    await assert.rejects(decideDirection(db, "user-operator", ids[0]!, "reject-once", {action: "rejected"}), /reject insert failed/);
    assert.deepEqual(await rows(db), ["proposed", "proposed", "proposed"]);
    await db.exec("DROP TRIGGER fail_preference ON prism.preference_event;");
    await repository.apply(documents[0]!, {type: "node.props.set", baseRevision: 1, nodeId: "title", props: {content: "Changed"}}, "operator");
    await assert.rejects(decideDirection(db, "user-operator", ids[0]!, "stale", {action: "selected", documentId: documents[0]!}), /stale/);
    await db.query("UPDATE prism.direction SET state='selected' WHERE id=$1", [ids[1]]);
    await assert.rejects(decideDirection(db, "user-operator", ids[1]!, "legacy", {action: "selected", documentId: documents[1]!}), /not available/);
    assert.equal(await eventCount(db), 0);
    assert.deepEqual(await rows(db), ["proposed", "selected", "proposed"]);
  } finally { await db.close(); }
});

test("wire preference IDs replay only exact owner and content while preserving internal UUIDs", async () => {
  const {db} = await fixture();
  try {
    const event: PreferenceEvent = {schema: "prism.preference-event.v1", eventId: "event-client-one", userId: "user-operator", projectId: "project-control", action: "liked", traits: ["layout"], context: {surface: "direction"}, source: "explicit", learningScope: "project", occurredAt: new Date().toISOString()};
    validatePrism("preferenceEvent", event);
    await recordPreference(db, event); await recordPreference(db, {...event});
    assert.equal(await eventCount(db), 1);
    for (const patch of [{userId: "user-other"}, {projectId: "project-other"}, {action: "disliked" as const}]) await assert.rejects(recordPreference(db, {...event, ...patch}), /conflicts/);
    await recordPreference(db, {...event, eventId: "event-retract-one", action: "retracted", retractsEventId: event.eventId});
    assert.equal(await eventCount(db), 2);
  } finally { await db.close(); }
});

test("wire ID migration preserves legacy UUID/content and refuses ambiguous historical wire identities", async () => {
  const {db} = await fixture();
  try {
    await db.exec("ALTER TABLE prism.preference_event DROP COLUMN wire_event_id; ALTER TABLE prism.preference_event DROP COLUMN request_digest; ALTER TABLE prism.preference_event DROP COLUMN decision_response; DELETE FROM prism.schema_migration WHERE name='011_preference_wire_ids.sql';");
    const id = randomUUID(); const content = {eventId: "event-legacy", actorEvidence: "unchanged"};
    await db.query("INSERT INTO prism.preference_event(id,subject_id,event_type,content,consent_scope,occurred_at) VALUES($1,'legacy','liked',$2::jsonb,'personal',now())", [id, JSON.stringify(content)]);
    await migrate(db);
    const row = (await db.query<{id: string; content: unknown; wire_event_id: string; request_digest: unknown}>("SELECT * FROM prism.preference_event")).rows[0]!;
    assert.equal(row.id, id); assert.deepEqual(row.content, content); assert.equal(row.wire_event_id, "event-legacy"); assert.equal(row.request_digest, null);
    await db.exec("ALTER TABLE prism.preference_event DROP COLUMN wire_event_id; ALTER TABLE prism.preference_event DROP COLUMN request_digest; ALTER TABLE prism.preference_event DROP COLUMN decision_response; DELETE FROM prism.schema_migration WHERE name='011_preference_wire_ids.sql';");
    await db.query("INSERT INTO prism.preference_event(id,subject_id,event_type,content,consent_scope,occurred_at) VALUES($1,'other','liked',$2::jsonb,'personal',now())", [randomUUID(), JSON.stringify(content)]);
    await assert.rejects(migrate(db), /unique|duplicate/);
    assert.equal(await eventCount(db), 2);
  } finally { await db.close(); }
});
