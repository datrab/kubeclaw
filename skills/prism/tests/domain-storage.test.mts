import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import type { PrismDocument } from "@kubeclaw/prism-contracts-v1";
import { RevisionRepository, migrate } from "../storage/index.ts";

test("rejected descendant move commits nothing; duplicated subtree survives revision restore", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await migrate(db);
    const repository = new RevisionRepository(db);
    const project = await repository.createProject("domain-regression", "Domain regression");
    const fixture = JSON.parse(await readFile(new URL("../../../contracts/prism/v1/fixtures/minimal-web.json", import.meta.url), "utf8")) as PrismDocument;
    fixture.views.home!.root.children = [{ id: "parent", type: "stack", props: { direction: "vertical" }, children: [
      { id: "child", type: "heading", props: { content: "Preserved", level: 1 } }
    ] }];
    const documentId = await repository.createDocument(project, "primary", fixture, "operator");
    const original = await repository.current(documentId);
    await assert.rejects(repository.apply(documentId, { type: "node.move", baseRevision: 1, nodeId: "parent", parentId: "child", index: 0 }, "operator"), /descendant/);
    assert.deepEqual(await repository.current(documentId), original);
    assert.equal((await repository.history(documentId)).length, 1);
    const duplicated = await repository.apply(documentId, { type: "node.duplicate", baseRevision: 1, nodeId: "parent", newNodeId: "copy-parent" }, "operator");
    const duplicateRevision = await repository.current(documentId);
    assert.deepEqual(duplicateRevision.document, duplicated);
    assert.equal(duplicated.views.home!.root.children![1]!.children![0]!.id, "copy-parent-1");
    const restored = await repository.restore(documentId, original.id, "operator");
    assert.deepEqual(restored.views, original.document.views);
    assert.equal(restored.meta.revision, 3);
    const redone = await repository.restore(documentId, duplicateRevision.id, "operator");
    assert.deepEqual(redone.views, duplicated.views);
    assert.equal(redone.meta.revision, 4);
    assert.equal((await repository.history(documentId)).length, 4);
  } finally {
    await db.close();
  }
});
