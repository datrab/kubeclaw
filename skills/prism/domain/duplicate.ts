import type { PrismDocument, PrismNode } from "@kubeclaw/prism-contracts-v1";

type FlowTransition = {
  id: string;
  from: { view: string; state: string };
  trigger: { actor: string; action: string; node?: string };
};

function collect(root: PrismNode): PrismNode[] {
  return [root, ...(root.children ?? []).flatMap(collect)];
}

// The explicit newNodeId is the seed. Preorder allocation is deterministic and
// reserves existing IDs, including those in other views. Keep IDs schema-valid.
function allocateId(seed: string, occupied: Set<string>, ordinal: number): string {
  let counter = ordinal;
  let id: string;
  do {
    const suffix = `-${counter++}`;
    id = `${seed.slice(0, 80 - suffix.length)}${suffix}`;
  } while (occupied.has(id));
  occupied.add(id);
  return id;
}

function copyPatches(view: PrismDocument["views"][string], remap: Map<string, string>): void {
  for (const group of [...Object.values(view.states), ...Object.values(view.responsive)]) {
    for (const [oldId, newId] of remap) {
      if (Object.hasOwn(group.patches, oldId)) group.patches[newId] = structuredClone(group.patches[oldId]!);
    }
  }
}

function copyTransitions(document: PrismDocument, viewId: string, remap: Map<string, string>, seed: string): void {
  for (const raw of Object.values(document.flows)) {
    const flow = raw as { transitions: FlowTransition[] };
    const occupied = new Set(flow.transitions.map((transition) => transition.id));
    const copies: FlowTransition[] = [];
    for (const transition of flow.transitions) {
      const newId = transition.trigger.node && remap.get(transition.trigger.node);
      if (transition.from.view !== viewId || !newId) continue;
      const copy = structuredClone(transition);
      copy.id = allocateId(seed, occupied, copies.length + 1);
      copy.trigger.node = newId;
      copies.push(copy);
    }
    flow.transitions.push(...copies);
  }
}

export function duplicateSubtree(document: PrismDocument, node: PrismNode, newNodeId: string): PrismNode {
  const views = Object.entries(document.views);
  const occupied = new Set(views.flatMap(([, view]) => collect(view.root).map((item) => item.id)));
  if (occupied.has(newNodeId)) throw new Error(`duplicate node ID: ${newNodeId}`);
  occupied.add(newNodeId);
  const copy = structuredClone(node);
  const remap = new Map<string, string>();
  collect(copy).forEach((item, index) => {
    const id = index === 0 ? newNodeId : allocateId(newNodeId, occupied, index);
    remap.set(item.id, id);
    item.id = id;
  });
  const [viewId, view] = views.find(([, candidate]) => collect(candidate.root).some((item) => item === node))!;
  copyPatches(view, remap);
  copyTransitions(document, viewId, remap, newNodeId);
  // Action names, component IDs and component-local override keys are separate
  // identities, not view node references, and therefore remain unchanged.
  return copy;
}
