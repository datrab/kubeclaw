export type PreferenceAction =
  | "selected"
  | "rejected"
  | "liked"
  | "disliked"
  | "preserved"
  | "changed"
  | "reverted"
  | "retracted";
export type PreferenceEvent = {
  schema: "prism.preference-event.v1";
  eventId: string;
  userId: string;
  projectId?: string;
  action: PreferenceAction;
  target?: Record<string, unknown>;
  alternatives?: unknown[];
  traits?: readonly string[];
  context: Record<string, unknown>;
  source: "explicit" | "observed";
  learningScope: "project" | "personal";
  retractsEventId?: string;
  occurredAt: string;
};
export type PreferenceEvidence = {
  userId: string;
  projectId?: string;
  trait: string;
  origins: Array<{eventId: string; userId: string; projectId?: string}>;
  positive: string[];
  negative: string[];
  retained: string[];
  score: number;
  effectiveScore: number;
  scope: "personal" | "project";
  projection: "personal" | "project" | "domain" | "craft" | "novelty";
  context: string;
  lastEvidenceAt: string;
};
export type PreferenceProfile = Record<string, PreferenceEvidence>;

function identity(event: PreferenceEvent, id = event.eventId) {
  return JSON.stringify([event.userId, event.learningScope, event.projectId ?? null, id]);
}
function uniqueEvents(events: PreferenceEvent[]) {
  const unique = new Map<string, PreferenceEvent>();
  for (const event of events) {
    validatePrism<PreferenceEvent>("preferenceEvent", event);
    if (event.learningScope === "project" && !event.projectId) throw new Error("project preference requires projectId");
    const prior = unique.get(identity(event));
    if (prior && JSON.stringify(prior) !== JSON.stringify(event)) throw new Error("conflicting preference event identity");
    unique.set(identity(event), event);
  }
  return [...unique.values()].sort((a,b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
}
function addEvidence(result: PreferenceProfile, event: PreferenceEvent, trait: string) {
  const surface = event.context.surface ?? "general";
  const context = String(event.context.domain ?? surface);
  const requested = String(event.context.preferenceType ?? event.learningScope);
  const projection = (["personal", "project", "domain", "craft", "novelty"].includes(requested) ? requested : event.learningScope) as PreferenceEvidence["projection"];
  const key = JSON.stringify([event.userId, projection, event.learningScope, event.learningScope === "project" ? event.projectId : null, context, trait]);
  const evidence = result[key] ?? {
    userId: event.userId,
    ...(event.learningScope === "project" ? {projectId: event.projectId} : {}),
    trait, origins: [], positive: [], negative: [], retained: [], score: 0, effectiveScore: 0,
    scope: event.learningScope, projection, context, lastEvidenceAt: event.occurredAt,
  };
  evidence.origins.push({eventId:event.eventId,userId:event.userId,...(event.projectId ? {projectId:event.projectId} : {})});
  if (["selected","liked"].includes(event.action)) evidence.positive.push(event.eventId);
  else if (["rejected","disliked","reverted"].includes(event.action)) evidence.negative.push(event.eventId);
  else if (event.action === "preserved") evidence.retained.push(event.eventId);
  evidence.score = evidence.positive.length + evidence.retained.length * 0.5 - evidence.negative.length;
  evidence.lastEvidenceAt = event.occurredAt > evidence.lastEvidenceAt ? event.occurredAt : evidence.lastEvidenceAt;
  result[key] = evidence;
}
export function projectPreferences(events: PreferenceEvent[], now = Date.now()): PreferenceProfile {
  events = uniqueEvents(events);
  const retracted = new Set(events.filter(event => event.action === "retracted" && event.retractsEventId).map(event => identity(event,event.retractsEventId)));
  const result: PreferenceProfile = {};
  for (const event of events) {
    if (event.action === "retracted" || retracted.has(identity(event))) continue;
    for (const trait of new Set(event.traits ?? [])) addEvidence(result,event,trait);
  }
  for (const evidence of Object.values(result)) {
    const ageDays = Math.max(0,(now - Date.parse(evidence.lastEvidenceAt)) / 86_400_000);
    evidence.effectiveScore = Number((evidence.score * Math.pow(0.5,ageDays / 180)).toFixed(4));
  }
  return result;
}
import { validatePrism } from "@kubeclaw/prism-contracts-v1";
