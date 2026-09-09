import { createHash, randomUUID } from "node:crypto";
import type { Queryable } from "../storage/index.ts";
import { projectPreferences, type PreferenceEvent } from "../preferences/index.ts";

export async function preferenceEvents(db: Queryable, subjectId: string, projectId: string | null) {
  const rows = await db.query<{content: PreferenceEvent}>("SELECT e.content FROM prism.preference_event e LEFT JOIN prism.project p ON p.id=e.project_id WHERE e.subject_id=$1 AND ($2::text IS NULL OR e.consent_scope='personal' OR p.external_id=$2) ORDER BY e.occurred_at,e.wire_event_id", [subjectId, projectId]);
  return rows.rows.map(row => row.content);
}

export async function setPersonalPreferences(db: Queryable, subjectId: string, projectId: string, enabled: boolean) {
  const result = await db.query("INSERT INTO prism.preference_project_policy(project_id,subject_id,personal_enabled) SELECT id,$2,$3 FROM prism.project WHERE external_id=$1 ON CONFLICT(project_id,subject_id) DO UPDATE SET personal_enabled=excluded.personal_enabled RETURNING project_id", [projectId, subjectId, enabled]);
  if (!result.rows.length) throw new Error("preference project is not available");
}

export async function createPreferenceGeneration(db: Queryable, subjectId: string | null, projectId: string, now = Date.now(), target: Record<string, unknown> = {}) {
  const project = await db.query<{id: string}>("SELECT id FROM prism.project WHERE external_id=$1", [projectId]);
  if (!project.rows[0]) throw new Error("preference project is not available");
  const policy = await db.query<{personal_enabled: boolean}>("SELECT personal_enabled FROM prism.preference_project_policy WHERE project_id=$1 AND subject_id=$2", [project.rows[0].id, subjectId]);
  const personalEnabled = subjectId !== null && (policy.rows[0]?.personal_enabled ?? true);
  const events = subjectId ? await preferenceEvents(db, subjectId, projectId) : [];
  const eligible = events.filter(event => event.learningScope !== "personal" || personalEnabled);
  const profile = projectPreferences(eligible, now);
  const projectTraits = new Set(Object.values(profile).filter(e => e.scope === "project").map(e => JSON.stringify([e.context,e.trait])));
  const effective = Object.fromEntries(Object.entries(profile).filter(([,e]) => e.scope === "project" || !projectTraits.has(JSON.stringify([e.context,e.trait]))));
  const snapshot = {target, policyVersion: "prism.preferences.v1.decay180-project-override", subjectId, projectId, personalEnabled, referenceTime: new Date(now).toISOString(), events: eligible, profile, effective};
  const snapshotDigest = `sha256:${createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")}`;
  const generationId = randomUUID();
  await db.query("INSERT INTO prism.preference_generation(id,project_id,subject_id,snapshot_digest,snapshot) VALUES($1,$2,$3,$4,$5::jsonb)", [generationId,project.rows[0].id,subjectId,snapshotDigest,JSON.stringify(snapshot)]);
  return {generationId,snapshotDigest,snapshot};
}

export async function requirePreferenceGeneration(db: Queryable, generationId: string | undefined, projectId: string, target?: Record<string, unknown>) {
  if (!generationId) throw new Error("generationId is required");
  const result = await db.query<{snapshot_digest: string; snapshot: {target: Record<string, unknown>}}>("SELECT g.snapshot_digest,g.snapshot FROM prism.preference_generation g JOIN prism.project p ON p.id=g.project_id WHERE g.id=$1 AND p.external_id=$2", [generationId,projectId]);
  if (!result.rows[0]) throw new Error("preference generation does not belong to the project");
  if (target && Object.entries(target).some(([key,value]) => result.rows[0]!.snapshot.target[key] !== value)) throw new Error("preference generation target mismatch");
  return {generationId,snapshotDigest:result.rows[0].snapshot_digest};
}
