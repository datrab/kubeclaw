import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { migrate } from "../storage/index.ts";
import { ingest, search, expire, validateSource } from "../corpus/index.ts";
test("corpus ingestion is atomic, searchable, idempotent and rights aware", async () => {
  const db = new PGlite({ extensions: { vector } });
  await migrate(db as any);
  const input = {
    sourceKind: "internal-project" as const,
    title: "Dense deployment dashboard",
    summary: "Technical failure recovery",
    tags: ["dashboard", "technical"],
    rights: "full" as const,
  };
  const evidence = {
    embedding: [1, 0],
    model: "test",
    modelVersion: "1",
    sourceDigest: `sha256:${"a".repeat(64)}`,
  };
  const a = await ingest(db as any, input, evidence),
    b = await ingest(db as any, input, evidence);
  assert.equal(a.id, b.id);
  assert.equal(
    (
      await search(db as any, "deployment", 10, {
        embedding: [1, 0],
        model: "test",
      })
    ).length,
    1,
  );
  await expire(db as any, a.id);
  assert.equal((await search(db as any, "deployment")).length, 0);
  await db.close();
});
test("public acquisition blocks unsafe networks", () => {
  assert.throws(
    () =>
      validateSource({
        sourceKind: "public-web",
        locator: "https://127.0.0.1/x",
        title: "x",
        summary: "x",
        tags: [],
        rights: "temporary",
      }),
    /not allowed/,
  );
});
test("analysis-only material cannot enter design retrieval", async () => {
  const db = new PGlite({ extensions: { vector } });
  await migrate(db as any);
  await ingest(
    db as any,
    {
      sourceKind: "user-upload",
      title: "Restricted reference",
      summary: "Research only",
      tags: ["restricted"],
      rights: "analysis-only",
    },
    {
      embedding: [0, 1],
      model: "test",
      modelVersion: "1",
      sourceDigest: `sha256:${"b".repeat(64)}`,
    },
  );
  assert.equal((await search(db as any, "restricted")).length, 0);
  await db.close();
});

test("retrieval applies required, excluded, and source-family diversity rules", async () => {
  const db = new PGlite({ extensions: { vector } });
  await migrate(db as any);
  const evidence = {
    embedding: [1, 0],
    model: "test",
    modelVersion: "1",
    sourceDigest: `sha256:${"c".repeat(64)}`,
  };
  for (const [title, sourceFamily, surface, style] of [
    ["Calm admin dashboard", "family-a", "web", ["calm"]],
    ["Calm settings dashboard", "family-a", "web", ["calm"]],
    ["Calm mobile dashboard", "family-b", "mobile", ["calm"]],
    ["Loud admin dashboard", "family-c", "web", ["loud"]],
  ] as const) {
    await ingest(
      db as any,
      {
        sourceKind: "internal-project",
        title,
        summary: "dashboard reference",
        tags: ["dashboard"],
        sourceFamily,
        surface,
        style: [...style],
        rights: "full",
      },
      { ...evidence, sourceDigest: `${evidence.sourceDigest}-${title}` },
    );
  }
  const results = await search(db as any, "dashboard", 10, undefined, {
    required: { surface: "web" },
    preferred: { style: "calm" },
    avoid: { style: "loud" },
    sourceFamilyLimit: 1,
  });
  assert.equal(results.length, 1);
  assert.deepEqual((results[0] as any).explanation, {
    ranking: "text-v1",
    requiredMatched: true,
    preferredMatched: true,
    sourceFamily: "family-a",
    diversityCap: 1,
  });
  const preferred = await search(db as any, "dashboard", 1, undefined, {
    preferred: { surface: "mobile" },
  });
  assert.equal((preferred[0] as any).normalized.surface, "mobile");
  assert.equal((preferred[0] as any).explanation.preferredMatched, true);
  await db.close();
});
