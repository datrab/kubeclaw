import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../../contracts/prism/v1/fixtures/minimal-web.json" with { type: "json" };
import { projectPreferences } from "../preferences/index.ts";
import { evaluate } from "../evaluation/index.ts";
test("preferences stay contextual, explain evidence, and support retraction", () => {
  const base = {
    schema: "prism.preference-event.v1" as const,
    userId: "user-one",
    context: { domain: "dashboard" },
    source: "explicit" as const,
    learningScope: "personal" as const,
    occurredAt: "2026-08-21T00:00:00Z",
  };
  const events = [
    {
      ...base,
      eventId: "event-one",
      action: "selected" as const,
      traits: ["dense"],
    },
    {
      ...base,
      eventId: "event-two",
      action: "rejected" as const,
      traits: ["dense"],
    },
    {
      ...base,
      eventId: "event-three",
      action: "retracted" as const,
      retractsEventId: "event-two",
    },
  ];
  assert.deepEqual(
    projectPreferences(events, Date.parse("2026-08-21T00:00:00Z"))[
      "personal:personal:dashboard:dense"
    ],
    {
      positive: ["event-one"],
      negative: [],
      retained: [],
      score: 1,
      effectiveScore: 1,
      scope: "personal",
      projection: "personal",
      context: "dashboard",
      lastEvidenceAt: "2026-08-21T00:00:00Z",
    },
  );
});
test("quality report keeps objective findings separate", () => {
  assert.equal(evaluate(fixture as any).status, "needs-attention");
  const empty = { ...fixture, views: {} };
  assert.equal(evaluate(empty as any).status, "blocked");
});
test("quality blocks a meaningful icon without alternative text", () => {
  const document = structuredClone(fixture) as any;
  document.assets["status-icon"] = {
    kind: "icon",
    artifact: `artifact:sha256:${"a".repeat(64)}`,
    mediaType: "image/svg+xml",
    role: "status",
  };
  document.views.home.root.children.push({
    id: "status-icon-node",
    type: "icon",
    props: { asset: "status-icon", decorative: false },
  });
  assert.equal(evaluate(document).status, "blocked");
});
test("preference projections decay and remain retractable", () => {
  const events = [
    {
      schema: "prism.preference-event.v1" as const,
      eventId: "old",
      userId: "user-one",
      action: "liked" as const,
      traits: ["restrained"],
      context: { domain: "tools", preferenceType: "domain" },
      source: "explicit" as const,
      learningScope: "personal" as const,
      occurredAt: "2025-08-21T00:00:00Z",
    },
    {
      schema: "prism.preference-event.v1" as const,
      eventId: "new",
      userId: "user-one",
      action: "liked" as const,
      traits: ["precise"],
      context: { domain: "tools", preferenceType: "craft" },
      source: "explicit" as const,
      learningScope: "personal" as const,
      occurredAt: "2026-08-21T00:00:00Z",
    },
  ];
  const projected = projectPreferences(
    events,
    Date.parse("2026-08-21T00:00:00Z"),
  );
  assert.equal(
    projected["domain:personal:tools:restrained"]?.projection,
    "domain",
  );
  assert(
    (projected["domain:personal:tools:restrained"]?.effectiveScore ?? 1) < 0.3,
  );
  assert.equal(projected["craft:personal:tools:precise"]?.projection, "craft");
});
