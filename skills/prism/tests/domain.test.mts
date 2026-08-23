import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyOperation, resolveView } from "../domain/index.ts";
import type { PrismDocument } from "@kubeclaw/prism-contracts-v1";

const source = JSON.parse(await readFile(new URL("../../../contracts/prism/v1/fixtures/minimal-web.json", import.meta.url), "utf8")) as PrismDocument;
test("operations are immutable and reject stale revisions", () => {
  const next = applyOperation(source, { type: "node.props.set", baseRevision: 1, nodeId: "title", props: { content: "Services" } });
  assert.equal(source.views.home!.root.children![0]!.props!.content, "Deployments");
  assert.equal(next.views.home!.root.children![0]!.props!.content, "Services");
  assert.equal(next.meta.revision, 2);
  assert.throws(() => applyOperation(next, { type: "node.remove", baseRevision: 1, nodeId: "title" }), /revision conflict/);
});
test("batch fails without partial mutation", () => {
  assert.throws(() => applyOperation(source, { type: "operation.batch", baseRevision: 1, operations: [
    { type: "node.props.set", baseRevision: 1, nodeId: "title", props: { content: "Changed" } },
    { type: "node.move", baseRevision: 1, nodeId: "missing", parentId: "home-root", index: 0 }
  ] }), /missing node/);
  assert.equal(source.views.home!.root.children![0]!.props!.content, "Deployments");
});
test("responsive patches resolve without changing canonical source", () => {
  const next = applyOperation(source, { type: "responsive.props.set", baseRevision: 1, nodeId: "title", viewport: "compact", props: { content: "Compact" } });
  assert.equal(resolveView(next, "home", "default", "compact").children![0]!.props!.content, "Compact");
  assert.equal(resolveView(next, "home", "default", "wide").children![0]!.props!.content, "Deployments");
});
