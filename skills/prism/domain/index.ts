import { validatePrism, type PrismDocument, type PrismNode } from "@kubeclaw/prism-contracts-v1";

import { duplicateSubtree } from "./duplicate.ts";

export type Viewport = "compact" | "regular" | "wide";
export type PrismOperation =
  | { type: "node.insert"; baseRevision: number; parentId: string; index: number; node: PrismNode }
  | { type: "node.remove"; baseRevision: number; nodeId: string }
  | { type: "node.duplicate"; baseRevision: number; nodeId: string; newNodeId: string }
  | { type: "node.move"; baseRevision: number; nodeId: string; parentId: string; index: number }
  | { type: "node.props.set"; baseRevision: number; nodeId: string; props: Record<string, unknown> }
  | { type: "responsive.props.set"; baseRevision: number; nodeId: string; viewport: Viewport; props: Record<string, unknown> }
  | { type: "operation.batch"; baseRevision: number; operations: PrismOperation[] };

const clone = <T>(value: T): T => structuredClone(value);

function nodes(document: PrismDocument): PrismNode[] {
  return Object.values(document.views).flatMap((view) => {
    const result: PrismNode[] = [];
    const visit = (node: PrismNode): void => { result.push(node); node.children?.forEach(visit); };
    visit(view.root);
    return result;
  });
}

function findNode(document: PrismDocument, id: string): PrismNode {
  const matches = nodes(document).filter((node) => node.id === id);
  if (matches.length !== 1) throw new Error(matches.length ? `duplicate node ID: ${id}` : `missing node: ${id}`);
  return matches[0]!;
}

function findParent(document: PrismDocument, id: string): PrismNode | undefined {
  return nodes(document).find((node) => node.children?.some((child) => child.id === id));
}

function ensureUnique(document: PrismDocument): void {
  const seen = new Set<string>();
  for (const node of nodes(document)) {
    if (seen.has(node.id)) throw new Error(`duplicate node ID: ${node.id}`);
    seen.add(node.id);
  }
}

function containsNode(root: PrismNode, id: string): boolean {
  return root.id === id || Boolean(root.children?.some((child) => containsNode(child, id)));
}

function moveNode(document: PrismDocument, node: PrismNode, parent: PrismNode, operation: Extract<PrismOperation, { type: "node.move" }>): void {
  const target = findNode(document, operation.parentId);
  if (containsNode(node, target.id)) throw new Error("node cannot move into itself or its descendant");
  const targetLength = (target.children?.length ?? 0) - (target === parent ? 1 : 0);
  if (operation.index > targetLength) throw new Error("move index out of range");
  const sourceIndex = parent.children!.findIndex((child) => child.id === node.id);
  parent.children!.splice(sourceIndex, 1);
  target.children ??= [];
  target.children.splice(operation.index, 0, node);
  ensureUnique(document);
}

function setResponsiveProps(document: PrismDocument, operation: Extract<PrismOperation, { type: "responsive.props.set" }>): void {
  const view = Object.values(document.views).find((candidate) => containsNode(candidate.root, operation.nodeId));
  if (!view) throw new Error(`missing node: ${operation.nodeId}`);
  const patches = view.responsive[operation.viewport]!.patches;
  patches[operation.nodeId] = { ...(patches[operation.nodeId] ?? {}), ...operation.props };
}

function applyMutable(document: PrismDocument, operation: PrismOperation): void {
  if (operation.type === "operation.batch") {
    for (const child of operation.operations) {
      if (child.baseRevision !== operation.baseRevision) throw new Error("batch revision mismatch");
      applyMutable(document, child);
    }
    return;
  }
  if (operation.type === "responsive.props.set") {
    setResponsiveProps(document, operation);
    return;
  }
  if (operation.type === "node.props.set") {
    const node = findNode(document, operation.nodeId);
    node.props = { ...(node.props ?? {}), ...operation.props };
    return;
  }
  if (operation.type === "node.insert") {
    const parent = findNode(document, operation.parentId);
    parent.children ??= [];
    if (operation.index > parent.children.length) throw new Error("insert index out of range");
    parent.children.splice(operation.index, 0, clone(operation.node));
    ensureUnique(document);
    return;
  }
  const node = findNode(document, operation.nodeId);
  const parent = findParent(document, operation.nodeId);
  if (!parent?.children) throw new Error("root node cannot be moved or removed");
  const sourceIndex = parent.children.findIndex((child) => child.id === operation.nodeId);
  if (operation.type === "node.remove") { parent.children.splice(sourceIndex, 1); return; }
  if (operation.type === "node.duplicate") {
    const copy = duplicateSubtree(document, node, operation.newNodeId);
    parent.children.splice(sourceIndex + 1, 0, copy); ensureUnique(document); return;
  }
  moveNode(document, node, parent, operation);
}

export function applyOperation(source: PrismDocument, input: PrismOperation): PrismDocument {
  validatePrism("operation", input);
  if (source.meta.revision !== input.baseRevision) throw new Error(`revision conflict: expected ${source.meta.revision}`);
  const next = clone(source);
  applyMutable(next, input);
  next.meta.revision += 1;
  next.meta.updatedAt = new Date(Date.parse(source.meta.updatedAt) + 1).toISOString();
  ensureUnique(next);
  return validatePrism<PrismDocument>("designDocument", next);
}

export function resolveView(document: PrismDocument, viewId: string, state = "default", viewport: Viewport = "wide"): PrismNode {
  const view = document.views[viewId];
  if (!view) throw new Error(`missing view: ${viewId}`);
  const root = clone(view.root);
  const statePatches = view.states[state]?.patches ?? {};
  const viewportPatches = view.responsive[viewport]?.patches ?? {};
  const visit = (node: PrismNode): void => {
    if (statePatches[node.id] || viewportPatches[node.id]) {
      node.props = { ...(node.props ?? {}), ...statePatches[node.id], ...viewportPatches[node.id] };
    }
    node.children?.forEach(visit);
  };
  visit(root);
  return root;
}

export function transition(document: PrismDocument, flowId: string, current: { view: string; state: string }, action: string): { view: string; state: string } {
  const flow = document.flows[flowId] as { transitions?: Array<{ from: { view: string; state: string }; trigger: { action: string }; to: { view: string; state: string } }> } | undefined;
  const match = flow?.transitions?.find((item) => item.from.view === current.view && item.from.state === current.state && item.trigger.action === action);
  if (!match) throw new Error(`undeclared transition: ${action}`);
  return clone(match.to);
}
