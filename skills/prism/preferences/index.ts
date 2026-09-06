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

export function projectPreferences(
  events: PreferenceEvent[],
  now = Date.now(),
): PreferenceProfile {
  for (const event of events) {
    validatePrism<PreferenceEvent>("preferenceEvent", event);
  }
  const retracted = new Set(
    events
      .filter((event) => event.action === "retracted")
      .map((event) => event.retractsEventId)
      .filter((value): value is string => Boolean(value)),
  );
  const result: PreferenceProfile = {};
  const referenceTime = now;
  for (const event of events) {
    if (event.action === "retracted" || retracted.has(event.eventId)) continue;
    const context = String(
      event.context.domain ?? event.context.surface ?? "general",
    );
    for (const trait of event.traits ?? []) {
      const requestedProjection = String(
        event.context.preferenceType ?? event.learningScope,
      );
      const projection = (
        ["personal", "project", "domain", "craft", "novelty"].includes(
          requestedProjection,
        )
          ? requestedProjection
          : event.learningScope
      ) as PreferenceEvidence["projection"];
      const key = `${projection}:${event.learningScope}:${context}:${trait}`;
      const evidence = result[key] ?? {
        positive: [],
        negative: [],
        retained: [],
        score: 0,
        effectiveScore: 0,
        scope: event.learningScope,
        projection,
        context,
        lastEvidenceAt: event.occurredAt,
      };
      if (["selected", "liked"].includes(event.action))
        evidence.positive.push(event.eventId);
      else if (["rejected", "disliked", "reverted"].includes(event.action))
        evidence.negative.push(event.eventId);
      else if (event.action === "preserved")
        evidence.retained.push(event.eventId);
      evidence.score =
        evidence.positive.length +
        evidence.retained.length * 0.5 -
        evidence.negative.length;
      evidence.lastEvidenceAt =
        event.occurredAt > evidence.lastEvidenceAt
          ? event.occurredAt
          : evidence.lastEvidenceAt;
      result[key] = evidence;
    }
  }
  for (const evidence of Object.values(result)) {
    const ageDays = Math.max(
      0,
      (referenceTime - Date.parse(evidence.lastEvidenceAt)) / 86_400_000,
    );
    evidence.effectiveScore = Number(
      (evidence.score * Math.pow(0.5, ageDays / 180)).toFixed(4),
    );
  }
  return result;
}
import { validatePrism } from "@kubeclaw/prism-contracts-v1";
