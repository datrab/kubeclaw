import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { REVIEW_CONTEXT_REASON_KINDS, type ReviewBundleContextItem, type ReviewBundleScope,
  type ReviewContextReason } from './review-bundle-contract.ts';
import { assertReviewContextContent } from './review-bundle-bounds.ts';
import { bundleArray, bundleCompare, bundleDeepFreeze, bundleDigest, bundleExact, bundlePath,
  bundleRecord, bundleSelection, bundleUnique } from './review-bundle-values.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import type { ReviewLimitPolicy } from './review-policy-contract.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { createReviewContextAuthorityController, resolveReviewContextAuthority } from './review-context-authority.ts';
const SELECTION_AUTHORITY = createReviewContextAuthorityController();
export interface ReviewContextCandidate extends ReviewBundleContextItem { readonly dependencyDepth: number }
export const REVIEW_CONTEXT_OMISSION_REASONS = [
  'dependency_depth', 'file_bytes', 'file_count', 'total_bytes', 'unreachable',
] as const;
export type ReviewContextOmissionReason = typeof REVIEW_CONTEXT_OMISSION_REASONS[number];

export interface ReviewContextOmission {
  readonly path: string;
  readonly reason: ReviewContextOmissionReason;
}

export interface ReviewContextSelectionResult {
  readonly candidateManifestDigest: `sha256:${string}`; readonly limitDigest: `sha256:${string}`;
  readonly policyDigest: `sha256:${string}`; readonly scopeDigest: `sha256:${string}`;
  readonly selected: readonly ReviewBundleContextItem[];
  readonly omitted: readonly ReviewContextOmission[];
  readonly expansionRound: 0 | 1;
}


export const REVIEW_CONTEXT_REASON_RANK = Object.freeze({
  changed: 0,
  contract: 1,
  schema: 2,
  configuration: 3,
  ownership: 4,
  public_export: 5,
  direct_import: 6,
  direct_caller: 7,
  test: 8,
  dependency: 9,
  context_expansion: 10,
} satisfies Record<(typeof REVIEW_CONTEXT_REASON_KINDS)[number], number>);

function inScope(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => prefix === '.' || path === prefix || path.startsWith(`${prefix}/`));
}

export function parseReviewContextReason(value: unknown, label: string): ReviewContextReason {
  const item = bundleRecord(value, label);
  bundleExact(item, ['kind'], ['sourcePath'], label);
  const kind = bundleSelection(item.kind, REVIEW_CONTEXT_REASON_KINDS, `${label}.kind`);
  if (kind === 'context_expansion') throw new Error(`${label}.kind is reserved for expansion`);
  const sourcePath = item.sourcePath === undefined
    ? undefined : bundlePath(item.sourcePath, `${label}.sourcePath`);
  if ((kind !== 'changed') !== Boolean(sourcePath)) {
    throw new Error(`${label}.sourcePath must exist only for relational reasons`);
  }
  return { kind, ...(sourcePath === undefined ? {} : { sourcePath }) };
}

function parseCandidate(value: unknown, index: number): ReviewContextCandidate {
  const label = `candidates[${index}]`;
  const item = bundleRecord(value, label);
  bundleExact(item, ['path', 'digest', 'content', 'reasons', 'dependencyDepth'], [], label);
  if (typeof item.content !== 'string') throw new Error(`${label}.content must be a string`);
  assertReviewContextContent(item.content, `${label}.content`);
  if (sha256Text(item.content) !== item.digest) throw new Error(`${label}.digest does not match content`);
  if (!Number.isInteger(item.dependencyDepth)
    || Number(item.dependencyDepth) < 0
    || Number(item.dependencyDepth) > REVIEW_HARD_LIMITS.contextDependencyDepth) {
    throw new Error(`${label}.dependencyDepth is invalid`);
  }
  const reasons = bundleArray(
    item.reasons, `${label}.reasons`, 1, REVIEW_HARD_LIMITS.contextCandidateReasonsPerFile,
  ).map((entry, reasonIndex) => parseReviewContextReason(entry, `${label}.reasons[${reasonIndex}]`));
  bundleUnique(reasons.map(({ kind, sourcePath }) => `${kind}\0${sourcePath ?? ''}`), `${label}.reasons`);
  return {
    path: bundlePath(item.path, `${label}.path`),
    digest: bundleDigest(item.digest, `${label}.digest`),
    content: item.content,
    reasons: [...reasons].sort((left, right) => bundleCompare(
      `${left.kind}\0${left.sourcePath ?? ''}`,
      `${right.kind}\0${right.sourcePath ?? ''}`,
    )),
    dependencyDepth: Number(item.dependencyDepth),
  };
}

function candidateRank(candidate: ReviewContextCandidate): readonly [number, number, string] {
  return [
    candidate.dependencyDepth,
    Math.min(...candidate.reasons.map(({ kind }) => REVIEW_CONTEXT_REASON_RANK[kind])),
    candidate.path,
  ];
}

function compareCandidates(left: ReviewContextCandidate, right: ReviewContextCandidate): number {
  const leftRank = candidateRank(left);
  const rightRank = candidateRank(right);
  if (leftRank[0] !== rightRank[0]) return leftRank[0] - rightRank[0];
  if (leftRank[1] !== rightRank[1]) return leftRank[1] - rightRank[1];
  return bundleCompare(leftRank[2], rightRank[2]);
}

function validateCandidate(
  candidate: ReviewContextCandidate,
  scope: ReviewBundleScope,
  changed: ReadonlySet<string>,
  deleted: ReadonlySet<string>,
  byPath: ReadonlyMap<string, ReviewContextCandidate>,
): void {
  if (!inScope(candidate.path, scope.allowedPrefixes)) throw new Error(`${candidate.path} is outside allowed scope`);
  if (deleted.has(candidate.path)) throw new Error(`${candidate.path} is deleted and cannot provide context`);
  const marksChanged = candidate.reasons.some(({ kind }) => kind === 'changed');
  if (marksChanged !== changed.has(candidate.path)) throw new Error(`${candidate.path} has invalid changed provenance`);
  if (marksChanged !== (candidate.dependencyDepth === 0)) throw new Error(`${candidate.path} has invalid dependency depth`);
  for (const reason of candidate.reasons) {
    if (!reason.sourcePath) continue;
    if (!inScope(reason.sourcePath, scope.allowedPrefixes)) throw new Error(`${candidate.path} has out-of-scope provenance`);
    const source = byPath.get(reason.sourcePath);
    if (!source || source.dependencyDepth >= candidate.dependencyDepth) {
      throw new Error(`${candidate.path} has invalid dependency provenance`);
    }
  }
}

function validateCandidateGraph(candidates: readonly ReviewContextCandidate[], scope: ReviewBundleScope): void {
  const changed = new Set(scope.changedPaths.filter(({ status }) => status !== 'deleted').map(({ path }) => path));
  const deleted = new Set(scope.changedPaths.filter(({ status }) => status === 'deleted').map(({ path }) => path));
  const byPath = new Map(candidates.map((candidate) => [candidate.path, candidate]));
  candidates.forEach((candidate) => validateCandidate(candidate, scope, changed, deleted, byPath));
}

function manifestDigest(candidates: readonly ReviewContextCandidate[]): `sha256:${string}` {
  return sha256Text(canonicalJson(candidates.map(({ path, digest, reasons, dependencyDepth }) => ({
    path, digest, reasons, dependencyDepth,
  }))));
}

function omission(path: string, reason: ReviewContextOmissionReason): ReviewContextOmission {
  return Object.freeze({ path, reason });
}

function parseCandidates(candidateInput: unknown): readonly ReviewContextCandidate[] {
  const raw = bundleArray(candidateInput, 'candidates', 0, REVIEW_HARD_LIMITS.contextCandidates);
  let candidateBytes = 0;
  raw.forEach((value, index) => {
    const item = bundleRecord(value, `candidates[${index}]`);
    if (typeof item.content !== 'string') throw new Error(`candidates[${index}].content must be a string`);
    candidateBytes += assertReviewContextContent(item.content, `candidates[${index}].content`);
  });
  if (candidateBytes > REVIEW_HARD_LIMITS.contextCandidateBytes) {
    throw new Error(`candidate content exceeds ${REVIEW_HARD_LIMITS.contextCandidateBytes} UTF-8 bytes`);
  }
  const candidates = raw.map(parseCandidate).sort(compareCandidates);
  bundleUnique(candidates.map(({ path }) => path), 'candidate paths');
  return candidates;
}

function candidateOmission(
  candidate: ReviewContextCandidate,
  limits: ReviewLimitPolicy,
  state: Readonly<{
    selectedCount: number;
    selectedBytes: number;
    selectedPaths: ReadonlySet<string>;
  }>,
  capacity: Readonly<{ fileLimit: number; byteLimit: number }>,
): ReviewContextOmissionReason | undefined {
  const bytes = Buffer.byteLength(candidate.content, 'utf8');
  if (candidate.dependencyDepth > limits.maxDependencyDepth) return 'dependency_depth';
  if (bytes > limits.maxContextFileBytes) return 'file_bytes';
  if (state.selectedCount >= capacity.fileLimit) return 'file_count';
  if (state.selectedBytes + bytes > capacity.byteLimit) return 'total_bytes';
  if (candidate.dependencyDepth > 0
    && !candidate.reasons.some(({ sourcePath }) => sourcePath && state.selectedPaths.has(sourcePath))) return 'unreachable';
  return undefined;
}

export function selectReviewContext(
  candidateInput: unknown,
  scope: ReviewBundleScope,
  resolvedPolicy: ResolvedReviewPolicy,
): ReviewContextSelectionResult {
  return selectReviewContextWithCapacity(candidateInput, scope, resolvedPolicy, 'initial');
}

export function selectReviewContextForSlicing(
  candidateInput: unknown,
  scope: ReviewBundleScope,
  resolvedPolicy: ResolvedReviewPolicy,
): ReviewContextSelectionResult {
  return selectReviewContextWithCapacity(candidateInput, scope, resolvedPolicy, 'total');
}

function selectReviewContextWithCapacity(
  candidateInput: unknown,
  scope: ReviewBundleScope,
  resolvedPolicy: ResolvedReviewPolicy,
  capacityMode: 'initial' | 'total',
): ReviewContextSelectionResult {
  const authority = resolveReviewContextAuthority(scope, resolvedPolicy);
  const { limits } = authority;
  const candidates = parseCandidates(candidateInput);
  validateCandidateGraph(candidates, scope);
  const selected: ReviewBundleContextItem[] = [], omitted: ReviewContextOmission[] = [];
  const selectedPaths = new Set<string>(); let selectedBytes = 0;
  for (const candidate of candidates) {
    const bytes = Buffer.byteLength(candidate.content, 'utf8');
    const reason = candidateOmission(candidate, limits, { selectedCount: selected.length, selectedBytes, selectedPaths },
      capacityMode === 'initial'
        ? { fileLimit: limits.maxInitialContextFiles, byteLimit: limits.maxInitialContextBytes }
        : { fileLimit: limits.maxContextFiles, byteLimit: limits.maxContextBytes },
    );
    if (reason) {
      omitted.push(omission(candidate.path, reason));
      continue;
    }
    selected.push(Object.freeze({
      path: candidate.path, digest: candidate.digest, content: candidate.content,
      reasons: candidate.reasons,
    }));
    selectedPaths.add(candidate.path);
    selectedBytes += bytes;
  }
  const result = bundleDeepFreeze({
    candidateManifestDigest: manifestDigest(candidates),
    limitDigest: authority.limitDigest, policyDigest: authority.policyDigest,
    scopeDigest: authority.scopeDigest,
    selected,
    omitted: omitted.sort((left, right) => bundleCompare(left.path, right.path)),
    expansionRound: 0 as const,
  });
  return SELECTION_AUTHORITY.certify(result);
}
function expandedReasons(candidate: ReviewContextCandidate): readonly ReviewContextReason[] {
  return [...candidate.reasons, { kind: 'context_expansion' as const }].sort((left, right) => bundleCompare(
    `${left.kind}\0${left.sourcePath ?? ''}`,
    `${right.kind}\0${right.sourcePath ?? ''}`,
  ));
}

export function expandReviewContext(
  candidateInput: unknown,
  initial: ReviewContextSelectionResult,
  requestedPathInput: unknown,
  scope: ReviewBundleScope,
  resolvedPolicy: ResolvedReviewPolicy,
): ReviewContextSelectionResult {
  const authority = resolveReviewContextAuthority(scope, resolvedPolicy);
  const { limits } = authority;
  SELECTION_AUTHORITY.assertExpansion(initial, authority);
  const requestedPaths = bundleArray(
    requestedPathInput, 'requestedPaths', 1, limits.maxExpansionFiles,
  ).map((entry, index) => bundlePath(entry, `requestedPaths[${index}]`));
  bundleUnique(requestedPaths, 'requestedPaths');
  const candidates = parseCandidates(candidateInput);
  validateCandidateGraph(candidates, scope);
  if (manifestDigest(candidates) !== initial.candidateManifestDigest) {
    throw new Error('context candidate manifest changed after initial selection');
  }
  const omittedPaths = new Set(initial.omitted.map(({ path }) => path));
  if (requestedPaths.some((path) => !omittedPaths.has(path))) {
    throw new Error('context expansion may request only known omitted candidates');
  }
  SELECTION_AUTHORITY.consume(initial);
  const requested = new Set(requestedPaths);
  return applyExpansion(candidates, initial, requested, limits);
}

function applyExpansion(
  candidates: readonly ReviewContextCandidate[],
  initial: ReviewContextSelectionResult,
  requested: ReadonlySet<string>,
  limits: ReviewLimitPolicy,
): ReviewContextSelectionResult {
  const selected = [...initial.selected];
  const selectedPaths = new Set(selected.map(({ path }) => path));
  let selectedBytes = selected.reduce((total, item) => total + Buffer.byteLength(item.content, 'utf8'), 0);
  const expansionOmissions = new Map<string, ReviewContextOmissionReason>();
  for (const candidate of candidates.filter(({ path }) => requested.has(path))) {
    const reason = candidateOmission(
      candidate, limits,
      { selectedCount: selected.length, selectedBytes, selectedPaths },
      { fileLimit: limits.maxContextFiles, byteLimit: limits.maxContextBytes },
    );
    if (reason) {
      expansionOmissions.set(candidate.path, reason);
      continue;
    }
    selected.push(Object.freeze({
      path: candidate.path, digest: candidate.digest, content: candidate.content,
      reasons: expandedReasons(candidate),
    }));
    selectedPaths.add(candidate.path);
    selectedBytes += Buffer.byteLength(candidate.content, 'utf8');
  }
  const omitted = initial.omitted
    .filter(({ path }) => !selectedPaths.has(path))
    .map(({ path, reason }) => omission(path, expansionOmissions.get(path) ?? reason));
  const result = bundleDeepFreeze({
    candidateManifestDigest: initial.candidateManifestDigest,
    limitDigest: initial.limitDigest, policyDigest: initial.policyDigest,
    scopeDigest: initial.scopeDigest,
    selected,
    omitted: omitted.sort((left, right) => bundleCompare(left.path, right.path)),
    expansionRound: 1 as const,
  });
  return SELECTION_AUTHORITY.certify(result);
}
