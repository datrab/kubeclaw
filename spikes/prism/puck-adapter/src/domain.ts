export type PrismNode = {
  id: string;
  type: "stack" | "grid" | "split" | "heading" | "text" | "button" | "status";
  props: Record<string, unknown>;
  children?: PrismNode[];
};

export type PrismDocument = {
  revision: number;
  root: PrismNode;
};

export type PrismOperation =
  | { type: "node.insert"; parentId: string; index: number; node: PrismNode }
  | { type: "node.remove"; nodeId: string }
  | { type: "node.duplicate"; nodeId: string; newNodeId: string }
  | { type: "node.move"; nodeId: string; parentId: string; index: number }
  | { type: "node.props.set"; nodeId: string; props: Record<string, unknown> };

const findNode = (node: PrismNode, id: string): PrismNode | undefined => {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const match = findNode(child, id);
    if (match) return match;
  }
  return undefined;
};

const findParent = (node: PrismNode, id: string): PrismNode | undefined => {
  if ((node.children ?? []).some((child) => child.id === id)) return node;
  for (const child of node.children ?? []) {
    const match = findParent(child, id);
    if (match) return match;
  }
  return undefined;
};

const cloneNode = (node: PrismNode): PrismNode => structuredClone(node);

const cloneSubtreeWithFreshIds = (node: PrismNode, rootId: string): PrismNode => {
  const duplicate = cloneNode(node);
  let descendant = 0;
  const assign = (candidate: PrismNode, id: string): void => {
    candidate.id = id;
    for (const child of candidate.children ?? []) {
      descendant += 1;
      assign(child, `${rootId}-copy-${descendant.toString(36)}`);
    }
  };
  assign(duplicate, rootId);
  return duplicate;
};

export const applyOperation = (document: PrismDocument, operation: PrismOperation): PrismDocument => {
  const next = structuredClone(document);
  if (operation.type === "node.insert") {
    const parent = findNode(next.root, operation.parentId);
    if (!parent || !["stack", "grid", "split"].includes(parent.type)) throw new Error("invalid insert parent");
    if (findNode(next.root, operation.node.id)) throw new Error("duplicate node id");
    parent.children ??= [];
    parent.children.splice(operation.index, 0, cloneNode(operation.node));
  } else if (operation.type === "node.remove") {
    const parent = findParent(next.root, operation.nodeId);
    if (!parent) throw new Error("node has no removable parent");
    parent.children = (parent.children ?? []).filter((child) => child.id !== operation.nodeId);
  } else if (operation.type === "node.duplicate") {
    const source = findNode(next.root, operation.nodeId);
    const parent = findParent(next.root, operation.nodeId);
    if (!source || !parent || findNode(next.root, operation.newNodeId)) throw new Error("invalid duplicate");
    const index = (parent.children ?? []).findIndex((child) => child.id === operation.nodeId);
    const duplicate = cloneSubtreeWithFreshIds(source, operation.newNodeId);
    const duplicateIds: string[] = [];
    const collectIds = (node: PrismNode): void => {
      duplicateIds.push(node.id);
      node.children?.forEach(collectIds);
    };
    collectIds(duplicate);
    if (duplicateIds.some((id) => findNode(next.root, id))) throw new Error("invalid duplicate");
    parent.children!.splice(index + 1, 0, duplicate);
  } else if (operation.type === "node.move") {
    const source = findNode(next.root, operation.nodeId);
    const oldParent = findParent(next.root, operation.nodeId);
    const newParent = findNode(next.root, operation.parentId);
    if (!source || !oldParent || !newParent || !["stack", "grid", "split"].includes(newParent.type)) {
      throw new Error("invalid move");
    }
    oldParent.children = (oldParent.children ?? []).filter((child) => child.id !== operation.nodeId);
    newParent.children ??= [];
    newParent.children.splice(operation.index, 0, source);
  } else {
    const node = findNode(next.root, operation.nodeId);
    if (!node) throw new Error("invalid property target");
    node.props = { ...node.props, ...structuredClone(operation.props) };
  }
  next.revision += 1;
  return next;
};
