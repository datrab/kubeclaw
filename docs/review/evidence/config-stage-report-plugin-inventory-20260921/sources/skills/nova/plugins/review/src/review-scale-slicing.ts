import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import type { ReviewGraph, ReviewGraphComponent } from './review-graph.ts';
import type { ReviewMapBoundaryRecord, ReviewMapSliceRecord } from './review-map-artifacts.ts';
import type { ReviewSnapshotInventory } from './review-snapshot-inventory.ts';
import { compareCodeUnits } from './review-ordering.ts';

export interface ReviewSliceBudget {
  readonly maxFiles: number;
  readonly maxBytes: number;
  readonly maxTokens: number;
}

export interface ReviewSliceOverflow {
  readonly componentId: string;
  readonly files: readonly string[];
  readonly bytes: number;
  readonly tokens: number;
  readonly reasons: readonly ('file_count' | 'byte_count' | 'token_count')[];
}

export interface ReviewCoverageLedger {
  readonly schemaVersion: 'review-coverage.v1';
  readonly filesTotal: number;
  readonly filesIncluded: number;
  readonly filesExcluded: number;
  readonly filesAssigned: number;
  readonly slices: number;
  readonly boundaries: number;
  readonly uncoveredFiles: readonly string[];
  readonly unresolvedRelations: number;
  readonly overflows: readonly ReviewSliceOverflow[];
  readonly complete: boolean;
  readonly digest: string;
}

export interface ScalableReviewPlan {
  readonly slices: readonly ReviewMapSliceRecord[];
  readonly boundaries: readonly ReviewMapBoundaryRecord[];
  readonly coverage: ReviewCoverageLedger;
}

function positive(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`review slice ${label} is invalid`);
  return value;
}

function enqueueUnvisited(queue: string[], visited: Set<string>, targets: readonly string[]): void {
  for (const target of targets) {
    if (visited.has(target)) continue;
    visited.add(target); queue.push(target);
  }
}

function traversalOrder(graph: ReviewGraph): readonly ReviewGraphComponent[] {
  const byId = new Map(graph.components.map((component) => [component.id, component]));
  const connected = new Map(graph.components.map(({ id }) => [id, new Set<string>()]));
  for (const edge of graph.componentEdges) {
    connected.get(edge.fromComponent)?.add(edge.toComponent);
    connected.get(edge.toComponent)?.add(edge.fromComponent);
  }
  const visited = new Set<string>();
  const ordered: ReviewGraphComponent[] = [];
  for (const root of [...byId.keys()].sort()) {
    if (visited.has(root)) continue;
    const queue = [root]; let cursor = 0; visited.add(root);
    while (cursor < queue.length) {
      const id = queue[cursor++] as string;
      const component = byId.get(id) as ReviewGraphComponent;
      if (component.filePaths.length > 0) ordered.push(component);
      enqueueUnvisited(queue, visited, [...(connected.get(id) ?? [])].sort());
    }
  }
  return ordered;
}

function componentTokens(component: ReviewGraphComponent, tokens: ReadonlyMap<string, number>): number {
  return component.filePaths.reduce((total, file) => {
    const value = tokens.get(file);
    if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`review token count is missing: ${file}`);
    return total + Number(value);
  }, 0);
}

function overflow(
  component: ReviewGraphComponent, tokens: number, budget: ReviewSliceBudget,
): ReviewSliceOverflow | undefined {
  const reasons: ReviewSliceOverflow['reasons'][number][] = [];
  if (component.filePaths.length > budget.maxFiles) reasons.push('file_count');
  if (component.sizeBytes > budget.maxBytes) reasons.push('byte_count');
  if (tokens > budget.maxTokens) reasons.push('token_count');
  return reasons.length === 0 ? undefined : Object.freeze({
    componentId: component.id, files: component.filePaths, bytes: component.sizeBytes, tokens,
    reasons: Object.freeze(reasons),
  });
}

function sliceRecord(components: readonly ReviewGraphComponent[], index: number): ReviewMapSliceRecord {
  const componentIds = components.map(({ id }) => id).sort();
  const files = components.flatMap(({ filePaths }) => filePaths).sort();
  const unsigned = { componentIds, files };
  const digest = sha256Text(canonicalJson(unsigned));
  return Object.freeze({ id: `slice-${String(index + 1).padStart(6, '0')}`, ...unsigned, digest });
}

function pack(
  graph: ReviewGraph, budget: ReviewSliceBudget, tokens: ReadonlyMap<string, number>,
): { slices: readonly ReviewMapSliceRecord[]; overflows: readonly ReviewSliceOverflow[]; componentSlice: ReadonlyMap<string, string> } {
  const slices: ReviewMapSliceRecord[] = [], overflows: ReviewSliceOverflow[] = [];
  let current: ReviewGraphComponent[] = [], files = 0, bytes = 0, tokenCount = 0;
  const flush = (): void => { if (current.length > 0) slices.push(sliceRecord(current, slices.length)); current = []; files = 0; bytes = 0; tokenCount = 0; };
  for (const component of traversalOrder(graph)) {
    const requiredTokens = componentTokens(component, tokens);
    const tooLarge = overflow(component, requiredTokens, budget);
    if (tooLarge) { flush(); overflows.push(tooLarge); continue; }
    const exceeds = current.length > 0 && (files + component.filePaths.length > budget.maxFiles
      || bytes + component.sizeBytes > budget.maxBytes || tokenCount + requiredTokens > budget.maxTokens);
    if (exceeds) flush();
    current.push(component); files += component.filePaths.length; bytes += component.sizeBytes; tokenCount += requiredTokens;
  }
  flush();
  const componentSlice = new Map(slices.flatMap(({ id, componentIds }) => componentIds.map((component) => [component, id] as const)));
  return { slices: Object.freeze(slices), overflows: Object.freeze(overflows), componentSlice };
}

function boundaryRecords(graph: ReviewGraph, componentSlice: ReadonlyMap<string, string>): readonly ReviewMapBoundaryRecord[] {
  const grouped = new Map<string, { fromSlice: string; toSlice: string; relationKeys: string[] }>();
  for (const edge of graph.componentEdges) {
    const fromSlice = componentSlice.get(edge.fromComponent) ?? `external:${edge.fromComponent}`;
    const toSlice = componentSlice.get(edge.toComponent) ?? `external:${edge.toComponent}`;
    if (fromSlice === toSlice) continue;
    const key = `${fromSlice}\0${toSlice}`;
    const value = grouped.get(key) ?? { fromSlice, toSlice, relationKeys: [] };
    value.relationKeys.push(...edge.relationKeys); grouped.set(key, value);
  }
  return [...grouped.values()].sort((left, right) => compareCodeUnits(
    `${left.fromSlice}\0${left.toSlice}`, `${right.fromSlice}\0${right.toSlice}`,
  )).map((value, index) => {
    const relationKeys = [...new Set(value.relationKeys)].sort();
    const unsigned = { fromSlice: value.fromSlice, toSlice: value.toSlice, relationKeys };
    const digest = sha256Text(canonicalJson(unsigned));
    return Object.freeze({ id: `boundary-${String(index + 1).padStart(6, '0')}`, ...unsigned, digest });
  });
}

export function buildScalableReviewPlan(
  snapshot: ReviewSnapshotInventory, graph: ReviewGraph, tokenCounts: ReadonlyMap<string, number>,
  inputBudget: ReviewSliceBudget,
): ScalableReviewPlan {
  const budget = {
    maxFiles: positive(inputBudget.maxFiles, 'file budget'),
    maxBytes: positive(inputBudget.maxBytes, 'byte budget'),
    maxTokens: positive(inputBudget.maxTokens, 'token budget'),
  };
  const packed = pack(graph, budget, tokenCounts);
  const boundaries = boundaryRecords(graph, packed.componentSlice);
  const assigned = new Set(packed.slices.flatMap(({ files }) => files));
  const included = snapshot.files.filter(({ included: value }) => value).map(({ path }) => path);
  const uncoveredFiles = included.filter((file) => !assigned.has(file)).sort();
  const coverageUnsigned = {
    schemaVersion: 'review-coverage.v1' as const,
    filesTotal: snapshot.files.length, filesIncluded: included.length,
    filesExcluded: snapshot.files.length - included.length, filesAssigned: assigned.size,
    slices: packed.slices.length, boundaries: boundaries.length,
    uncoveredFiles: Object.freeze(uncoveredFiles), unresolvedRelations: graph.unresolvedRelations.length,
    overflows: packed.overflows,
    complete: uncoveredFiles.length === 0 && graph.unresolvedRelations.length === 0 && packed.overflows.length === 0,
  };
  const coverage = Object.freeze({ ...coverageUnsigned, digest: sha256Text(canonicalJson(coverageUnsigned)) });
  return Object.freeze({ slices: packed.slices, boundaries: Object.freeze(boundaries), coverage });
}
