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

function nestedSource(): PrismDocument {
  const document = structuredClone(source);
  document.views.home!.root.children = [{ id: "parent", type: "stack", props: { direction: "vertical" }, children: [
    { id: "child", type: "stack", props: { direction: "vertical" }, children: [
      { id: "leaf", type: "heading", props: { content: "Content", level: 1 } }
    ] }
  ] }, { id: "sibling", type: "stack", props: { direction: "vertical" }, children: [] }];
  return document;
}

for (const parentId of ["parent", "child", "leaf"]) {
  test(`move rejects self/descendant target ${parentId} without mutating source`, () => {
    const document = nestedSource();
    const before = structuredClone(document);
    assert.throws(() => applyOperation(document, { type: "node.move", baseRevision: 1, nodeId: "parent", parentId, index: 0 }), /itself|descendant/);
    assert.deepEqual(document, before);
  });
}

test("legal sibling reorder and cross-view move preserve complete subtree", () => {
  const document = nestedSource();
  const before = structuredClone(document);
  document.views.other = { ...structuredClone(document.views.home!), root: { id: "other-root", type: "stack", props: { direction: "vertical" }, children: [] } };
  const reordered = applyOperation(document, { type: "node.move", baseRevision: 1, nodeId: "parent", parentId: "home-root", index: 1 });
  assert.deepEqual(reordered.views.home!.root.children!.map((node) => node.id), ["sibling", "parent"]);
  const moved = applyOperation(reordered, { type: "node.move", baseRevision: 2, nodeId: "parent", parentId: "other-root", index: 0 });
  assert.deepEqual(moved.views.other!.root.children![0], before.views.home!.root.children![0]);
  assert.deepEqual(moved.views.home!.root.children!.map((node) => node.id), ["sibling"]);
  assert.deepEqual(document.views.home, before.views.home);
  assert.throws(() => applyOperation(document, { type: "node.move", baseRevision: 1, nodeId: "parent", parentId: "home-root", index: 2 }), /index out of range/);
});

test("nested duplicate remaps IDs, patches and node-scoped actions deterministically", () => {
  const document = nestedSource();
  document.views.home!.states.default!.patches.leaf = { content: "State title" };
  document.views.home!.responsive.wide!.patches.leaf = { hidden: true };
  document.views.home!.root.children!.push({ id: "copy-parent-1", type: "heading", props: { content: "Collision", level: 1 } });
  document.flows.main = { title: "Main", goal: "Goal", start: { view: "home", state: "default" }, success: { view: "home", state: "default" }, recovery: [], transitions: [
    { id: "activate", from: { view: "home", state: "default" }, trigger: { actor: "user", action: "activate", node: "leaf" }, to: { view: "home", state: "default" } },
    { id: "global", from: { view: "home", state: "default" }, trigger: { actor: "system", action: "ready" }, to: { view: "home", state: "default" } }
  ] };
  const before = structuredClone(document);
  const operation = { type: "node.duplicate", baseRevision: 1, nodeId: "parent", newNodeId: "copy-parent" } as const;
  const next = applyOperation(document, operation);
  assert.deepEqual(next, applyOperation(document, operation));
  assert.deepEqual(document, before);
  const copy = next.views.home!.root.children![1]!;
  assert.equal(copy.id, "copy-parent");
  assert.equal(copy.children![0]!.id, "copy-parent-2");
  const leaf = copy.children![0]!.children![0]!;
  assert.equal(leaf.id, "copy-parent-3");
  assert.deepEqual(leaf.props, { content: "Content", level: 1 });
  assert.deepEqual(next.views.home!.states.default!.patches[leaf.id], { content: "State title" });
  assert.deepEqual(next.views.home!.responsive.wide!.patches[leaf.id], { hidden: true });
  const transitions = (next.flows.main as { transitions: Array<{ trigger: { node?: string; action: string } }> }).transitions;
  assert.equal(transitions.length, 3);
  assert.deepEqual(transitions[2]!.trigger, { actor: "user", action: "activate", node: leaf.id });
  assert.throws(() => applyOperation(document, { ...operation, newNodeId: "sibling" }), /duplicate node ID/);
});

test("leaf duplicate and maximum-length root ID remain supported", () => {
  const newNodeId = `a${"b".repeat(79)}`;
  const next = applyOperation(nestedSource(), { type: "node.duplicate", baseRevision: 1, nodeId: "parent", newNodeId });
  assert.equal(next.views.home!.root.children![1]!.id, newNodeId);
  assert.equal(next.views.home!.root.children![1]!.children![0]!.id.length, 80);
  const leaf = applyOperation(source, { type: "node.duplicate", baseRevision: 1, nodeId: "title", newNodeId: "copy-title" });
  assert.deepEqual(leaf.views.home!.root.children![1], { ...source.views.home!.root.children![0], id: "copy-title" });
});

for (const viewport of ["compact", "regular", "wide"] as const) {
  test(`${viewport} patches merge by property with base < state < viewport precedence`, () => {
    const document = structuredClone(source);
    document.views.home!.states.default!.patches.title = { content: "State title", hidden: false };
    document.views.home!.responsive[viewport]!.patches.title = { hidden: true };
    const before = structuredClone(document);
    assert.deepEqual(resolveView(document, "home", "default", viewport).children![0]!.props, { content: "State title", level: 1, hidden: true });
    assert.equal(resolveView(document, "home", "missing", viewport).children![0]!.props!.content, "Deployments");
    document.views.home!.responsive[viewport]!.patches.title = { content: "Viewport title" };
    assert.equal(resolveView(document, "home", "default", viewport).children![0]!.props!.content, "Viewport title");
    document.views.home!.responsive[viewport]!.patches = {};
    assert.equal(resolveView(document, "home", "default", viewport).children![0]!.props!.content, "State title");
    document.views.home!.responsive[viewport]!.patches = before.views.home!.responsive[viewport]!.patches;
    assert.deepEqual(document, before);
  });
}
