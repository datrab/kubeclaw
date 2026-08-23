import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { relationKey, type ReviewMapRelation } from './review-map-artifacts.ts';
import { compareCodeUnits } from './review-ordering.ts';
import type { ReviewSnapshotInventory } from './review-snapshot-inventory.ts';

export interface ReviewGraphNode {
  readonly id: string;
  readonly kind: 'file' | 'resource';
  readonly sizeBytes: number;
}

export interface ReviewGraphComponent {
  readonly id: string;
  readonly nodeIds: readonly string[];
  readonly filePaths: readonly string[];
  readonly sizeBytes: number;
  readonly riskTags: readonly string[];
  readonly digest: string;
}

export interface ReviewComponentEdge {
  readonly fromComponent: string;
  readonly toComponent: string;
  readonly relationKeys: readonly string[];
}

export interface ReviewGraph {
  readonly schemaVersion: 'review-graph.v1';
  readonly nodes: readonly ReviewGraphNode[];
  readonly relations: readonly ReviewMapRelation[];
  readonly components: readonly ReviewGraphComponent[];
  readonly componentEdges: readonly ReviewComponentEdge[];
  readonly unresolvedRelations: readonly ReviewMapRelation[];
  readonly digest: string;
}

function adjacency(nodes: readonly string[], relations: readonly ReviewMapRelation[], reverse = false): Map<string, string[]> {
  const output = new Map(nodes.map((node) => [node, [] as string[]]));
  for (const relation of relations) {
    const from = reverse ? relation.to : relation.from;
    const to = reverse ? relation.from : relation.to;
    const values = output.get(from);
    if (values && output.has(to)) values.push(to);
  }
  for (const values of output.values()) values.sort();
  return output;
}

function finishOrder(nodes: readonly string[], edges: ReadonlyMap<string, readonly string[]>): readonly string[] {
  const visited = new Set<string>();
  const finished: string[] = [];
  for (const root of nodes) {
    if (visited.has(root)) continue;
    visited.add(root);
    const stack: { node: string; index: number }[] = [{ node: root, index: 0 }];
    while (stack.length > 0) {
      const frame = stack.at(-1) as { node: string; index: number };
      const targets = edges.get(frame.node) ?? [];
      const next = targets[frame.index];
      if (next === undefined) { finished.push(frame.node); stack.pop(); continue; }
      frame.index += 1;
      if (visited.has(next)) continue;
      visited.add(next); stack.push({ node: next, index: 0 });
    }
  }
  return finished;
}

function addUnassigned(
  stack: string[], assigned: Set<string>, targets: readonly string[],
): void {
  for (const target of targets) {
    if (assigned.has(target)) continue;
    assigned.add(target); stack.push(target);
  }
}

function stronglyConnected(nodes: readonly string[], relations: readonly ReviewMapRelation[]): readonly string[][] {
  const forward = adjacency(nodes, relations);
  const reverse = adjacency(nodes, relations, true);
  const order = finishOrder(nodes, forward);
  const assigned = new Set<string>();
  const components: string[][] = [];
  for (const root of [...order].reverse()) {
    if (assigned.has(root)) continue;
    const component: string[] = [];
    const stack = [root]; assigned.add(root);
    while (stack.length > 0) {
      const node = stack.pop() as string; component.push(node);
      addUnassigned(stack, assigned, reverse.get(node) ?? []);
    }
    components.push(component.sort());
  }
  return components.sort((left, right) => compareCodeUnits(left[0] as string, right[0] as string));
}

const RISK_RELATIONS = new Set([
  'reads_secret', 'executes_command', 'uses_network', 'writes_state', 'grants_authority',
  'deletes_state', 'retries', 'recovers',
]);

function riskTypesByNode(relations: readonly ReviewMapRelation[]): ReadonlyMap<string, ReadonlySet<string>> {
  const output = new Map<string, Set<string>>();
  for (const { from, to, type } of relations) {
    if (!RISK_RELATIONS.has(type)) continue;
    for (const node of [from, to]) {
      const types = output.get(node) ?? new Set<string>();
      types.add(type); output.set(node, types);
    }
  }
  return output;
}

function buildComponents(
  groups: readonly string[][], nodes: ReadonlyMap<string, ReviewGraphNode>, relations: readonly ReviewMapRelation[],
): readonly ReviewGraphComponent[] {
  const risks = riskTypesByNode(relations);
  return groups.map((nodeIds) => {
    const filePaths = nodeIds.filter((id) => nodes.get(id)?.kind === 'file');
    const sizeBytes = nodeIds.reduce((total, id) => total + (nodes.get(id)?.sizeBytes ?? 0), 0);
    const riskTags = [...new Set(nodeIds.flatMap((id) => [...(risks.get(id) ?? [])]))].sort();
    const unsigned = { nodeIds, filePaths, sizeBytes, riskTags };
    const digest = sha256Text(canonicalJson(unsigned));
    return Object.freeze({ id: `component-${digest.slice(7, 23)}`, ...unsigned, digest });
  });
}

function componentEdges(
  components: readonly ReviewGraphComponent[], relations: readonly ReviewMapRelation[],
): readonly ReviewComponentEdge[] {
  const owner = new Map(components.flatMap(({ id, nodeIds }) => nodeIds.map((node) => [node, id] as const)));
  const grouped = new Map<string, { fromComponent: string; toComponent: string; relationKeys: string[] }>();
  for (const value of relations) {
    const fromComponent = owner.get(value.from), toComponent = owner.get(value.to);
    if (!fromComponent || !toComponent || fromComponent === toComponent) continue;
    const key = `${fromComponent}\0${toComponent}`;
    const group = grouped.get(key) ?? { fromComponent, toComponent, relationKeys: [] };
    group.relationKeys.push(relationKey(value)); grouped.set(key, group);
  }
  return [...grouped.values()].map((edge) => Object.freeze({ ...edge,
    relationKeys: Object.freeze([...new Set(edge.relationKeys)].sort()),
  })).sort((left, right) => compareCodeUnits(
    `${left.fromComponent}\0${left.toComponent}`, `${right.fromComponent}\0${right.toComponent}`,
  ));
}

export function buildReviewGraph(
  snapshot: ReviewSnapshotInventory, inputRelations: readonly ReviewMapRelation[],
): ReviewGraph {
  const nodes = new Map<string, ReviewGraphNode>();
  for (const file of snapshot.files.filter(({ included }) => included)) {
    nodes.set(file.path, Object.freeze({ id: file.path, kind: 'file', sizeBytes: file.sizeBytes }));
  }
  for (const relation of inputRelations) for (const id of [relation.from, relation.to]) {
    if (!nodes.has(id) && id.startsWith('resource:')) nodes.set(id, Object.freeze({ id, kind: 'resource', sizeBytes: 0 }));
  }
  const relations = [...inputRelations].sort((left, right) => compareCodeUnits(relationKey(left), relationKey(right)));
  const unresolvedRelations = relations.filter(({ from, to }) => !nodes.has(from) || !nodes.has(to));
  const unresolvedKeys = new Set(unresolvedRelations.map(relationKey));
  const resolved = relations.filter((value) => !unresolvedKeys.has(relationKey(value)));
  const sortedNodes = [...nodes.values()].sort((left, right) => compareCodeUnits(left.id, right.id));
  const components = buildComponents(stronglyConnected(sortedNodes.map(({ id }) => id), resolved), nodes, resolved);
  const edges = componentEdges(components, resolved);
  const unsigned = {
    schemaVersion: 'review-graph.v1' as const, nodes: Object.freeze(sortedNodes),
    relations: Object.freeze(relations), components: Object.freeze(components),
    componentEdges: Object.freeze(edges), unresolvedRelations: Object.freeze(unresolvedRelations),
  };
  return Object.freeze({ ...unsigned, digest: sha256Text(canonicalJson(unsigned)) });
}
