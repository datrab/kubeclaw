import { canonicalJson } from '@kubeclaw/plugin-sdk';

import { parseEchoReviewOutput, type ParsedEchoReviewOutput } from './echo-review-parser.ts';
import type { EchoReviewOutput, EvidenceRef, RequirementResult } from './echo-review-contract.ts';
import type { ReviewBundleContextItem } from './review-bundle-contract.ts';
import { reviewImportCandidates } from './review-context-production.ts';
import type { ReviewContextSelectionResult } from './review-context-selection.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { compareCodeUnits } from './review-ordering.ts';

export interface ReviewSlice {
  readonly id: string;
  readonly selection: ReviewContextSelectionResult;
}

function bytes(items: readonly ReviewBundleContextItem[]): number {
  return items.reduce((total, item) => total + Buffer.byteLength(item.content, 'utf8'), 0);
}

function assertGroupFitsSlice(
  group: readonly ReviewBundleContextItem[], fileLimit: number, byteLimit: number,
): void {
  const groupRoot = group[0]?.path ?? 'unknown';
  if (group.length > fileLimit) {
    throw new Error(`review slice connected group exceeds file limit: ${groupRoot}:${group.length}:${fileLimit}`);
  }
  const groupBytes = bytes(group);
  if (groupBytes > byteLimit) {
    throw new Error(`review slice connected group exceeds byte limit: ${groupRoot}:${groupBytes}:${byteLimit}`);
  }
}

function groupedItems(items: readonly ReviewBundleContextItem[]): readonly ReviewBundleContextItem[][] {
  const paths = new Set(items.map(({ path }) => path));
  const parents = new Map([...paths].map((path) => [path, path]));
  const find = (path: string): string => {
    const parent = parents.get(path) as string;
    if (parent === path) return path;
    const root = find(parent);
    parents.set(path, root);
    return root;
  };
  const connect = (left: string, right: string): void => {
    if (!paths.has(right)) return;
    const leftRoot = find(left), rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort();
    parents.set(second as string, first as string);
  };
  for (const item of items) {
    for (const reason of item.reasons) if (reason.sourcePath) connect(item.path, reason.sourcePath);
    for (const imported of reviewImportCandidates(item.path, item.content, paths)) connect(item.path, imported);
  }
  const groups = new Map<string, ReviewBundleContextItem[]>();
  for (const item of items) {
    const root = find(item.path), group = groups.get(root) ?? [];
    group.push(item);
    groups.set(root, group);
  }
  return [...groups.entries()].sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([, group]) => group.sort((left, right) => compareCodeUnits(left.path, right.path)));
}

function chunkItems(
  items: readonly ReviewBundleContextItem[], fileLimit: number, byteLimit: number,
): ReviewBundleContextItem[][] {
  const chunks: ReviewBundleContextItem[][] = [];
  let current: ReviewBundleContextItem[] = [];
  for (const group of groupedItems(items)) {
    assertGroupFitsSlice(group, fileLimit, byteLimit);
    const overflows = current.length > 0
      && (current.length + group.length > fileLimit || bytes(current) + bytes(group) > byteLimit);
    if (overflows) { chunks.push(current); current = []; }
    current.push(...group);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function integrationItems(items: readonly ReviewBundleContextItem[]): readonly ReviewBundleContextItem[] {
  const structuralKinds = new Set(['contract', 'schema', 'configuration', 'ownership', 'public_export']);
  const changed = new Map(items.filter(({ reasons }) => reasons.some(({ kind }) => kind === 'changed'))
    .map((item) => [item.path, item]));
  const integration = new Map<string, ReviewBundleContextItem>();
  for (const item of items.filter(({ reasons }) => reasons.some(({ kind }) => structuralKinds.has(kind)))) {
    integration.set(item.path, item);
    for (const reason of item.reasons) {
      if (reason.sourcePath && changed.has(reason.sourcePath)) {
        integration.set(reason.sourcePath, changed.get(reason.sourcePath) as ReviewBundleContextItem);
      }
    }
  }
  return [...integration.values()].sort((left, right) => compareCodeUnits(left.path, right.path));
}

function sliceSelection(
  full: ReviewContextSelectionResult, selected: readonly ReviewBundleContextItem[], index: number,
): ReviewSlice {
  const paths = new Set(selected.map(({ path }) => path));
  return {
    id: `slice-${String(index + 1).padStart(3, '0')}`,
    selection: Object.freeze({
      ...full, selected: Object.freeze([...selected]),
      omitted: Object.freeze([
        ...full.omitted,
        ...full.selected.filter(({ path }) => !paths.has(path)).map(({ path }) => Object.freeze({ path, reason: 'file_count' as const })),
      ].sort((left, right) => compareCodeUnits(left.path, right.path))),
    }),
  };
}

export function buildReviewSlices(
  full: ReviewContextSelectionResult, policy: ResolvedReviewPolicy,
): readonly ReviewSlice[] {
  const limits = policy.policy.limits;
  if (full.selected.length <= limits.maxInitialContextFiles && bytes(full.selected) <= limits.maxInitialContextBytes) {
    return [sliceSelection(full, full.selected, 0)];
  }
  const chunks = chunkItems(full.selected, limits.maxInitialContextFiles, limits.maxInitialContextBytes);
  const integration = integrationItems(full.selected);
  if (chunks.length > 1 && integration.length > 0 && integration.length <= limits.maxInitialContextFiles
    && bytes(integration) <= limits.maxInitialContextBytes) chunks.push([...integration]);
  return Object.freeze(chunks.map((chunk, index) => sliceSelection(full, chunk, index)));
}

function evidenceKey(value: EvidenceRef): string { return `${value.kind}\0${value.digest}`; }
function uniqueEvidence(values: readonly EvidenceRef[]): readonly EvidenceRef[] {
  return [...new Map(values.map((value) => [evidenceKey(value), value])).values()]
    .sort((left, right) => compareCodeUnits(evidenceKey(left), evidenceKey(right)));
}

function mergeRequirement(values: readonly RequirementResult[]): RequirementResult {
  const assessment = values.some(({ assessment }) => assessment === 'violated') ? 'violated'
    : values.some(({ assessment }) => assessment === 'satisfied') ? 'satisfied' : 'unverified';
  const explanations = [...new Set(values.map(({ explanation }) => explanation))];
  return {
    assessment,
    explanation: explanations.join(' ').slice(0, 4096).trim() || 'No slice supplied an explanation.',
    evidence: uniqueEvidence(values.flatMap(({ evidence }) => evidence)),
  };
}

function mergedRequirementLimitError(
  ids: readonly string[], values: readonly EchoReviewOutput[],
): string | undefined {
  for (const id of ids) {
    const references = uniqueEvidence(values.flatMap(({ requirementAssessments }) => (
      requirementAssessments[id]?.evidence ?? []
    )));
    if (references.length > REVIEW_HARD_LIMITS.evidencePerRecord) {
      return `sliced requirement ${id} cited ${references.length} evidence items; maximum is ${REVIEW_HARD_LIMITS.evidencePerRecord}`;
    }
  }
  return undefined;
}

function mergedInspectedEvidence(
  cited: readonly EvidenceRef[], values: readonly EchoReviewOutput[],
): readonly EvidenceRef[] {
  const citedKeys = new Set(cited.map(evidenceKey));
  return [...uniqueEvidence([...cited, ...values.flatMap(({ inspectedEvidence }) => inspectedEvidence)])]
    .sort((left, right) => Number(citedKeys.has(evidenceKey(right))) - Number(citedKeys.has(evidenceKey(left)))
      || compareCodeUnits(evidenceKey(left), evidenceKey(right)))
    .slice(0, REVIEW_HARD_LIMITS.inspectedEvidence);
}

export function mergeSlicedEchoOutputs(outputs: readonly ParsedEchoReviewOutput[]): ParsedEchoReviewOutput {
  const failed = outputs.find((output) => !output.ok);
  if (failed) return failed;
  const values = outputs.map((output) => (output as Extract<ParsedEchoReviewOutput, { readonly ok: true }>).value);
  if (values.some(({ contextRequest }) => contextRequest !== undefined)) {
    return { ok: false, error: 'sliced review requested context expansion; deterministic slices must be complete' };
  }
  const requirementIds = [...new Set(values.flatMap(({ requirementAssessments }) => Object.keys(requirementAssessments)))].sort();
  const requirementError = mergedRequirementLimitError(requirementIds, values);
  if (requirementError) return { ok: false, error: requirementError };
  const findings = [...new Map(values.flatMap(({ proposedFindings }) => proposedFindings)
    .map((finding) => [canonicalJson(finding), finding])).values()];
  if (findings.length > REVIEW_HARD_LIMITS.proposedFindings) {
    return { ok: false, error: `sliced review produced ${findings.length} findings; maximum is ${REVIEW_HARD_LIMITS.proposedFindings}` };
  }
  const requirementAssessments = Object.fromEntries(requirementIds.map((id) => [id, mergeRequirement(
    values.flatMap(({ requirementAssessments: assessments }) => assessments[id] ? [assessments[id]] : []),
  )]));
  const cited = uniqueEvidence([
    ...Object.values(requirementAssessments).flatMap(({ evidence: references }) => references),
    ...findings.flatMap(({ evidence: references }) => references),
  ]);
  if (cited.length > REVIEW_HARD_LIMITS.inspectedEvidence) {
    return { ok: false, error: `sliced review cited ${cited.length} evidence items; maximum is ${REVIEW_HARD_LIMITS.inspectedEvidence}` };
  }
  const inspectedEvidence = mergedInspectedEvidence(cited, values);
  const merged: EchoReviewOutput = {
    schemaVersion: 'echo-review-output.v1',
    summary: values.map(({ summary }, index) => `Slice ${index + 1}: ${summary}`).join('\n').slice(0, 8192).trim(),
    inspectedEvidence,
    requirementAssessments,
    proposedFindings: findings,
  };
  return parseEchoReviewOutput(merged);
}
