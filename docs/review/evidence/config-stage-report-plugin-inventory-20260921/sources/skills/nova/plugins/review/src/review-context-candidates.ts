import { sha256Text, type PluginInvocationContext } from '@kubeclaw/plugin-sdk';

import type { ReviewBundleScope, ReviewContextReason } from './review-bundle-contract.ts';
import { bundleArray, bundleExact, bundlePath, bundleRecord, bundleUnique } from './review-bundle-values.ts';
import {
  parseReviewContextReason,
  REVIEW_CONTEXT_REASON_RANK,
  type ReviewContextCandidate,
} from './review-context-selection.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import { ReviewRepositoryProofError, type FrozenReviewRevision } from './review-repository.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { compareCodeUnits } from './review-ordering.ts';

export class ReviewContextHydrationLimitError extends Error {}

export interface CandidateDescriptor {
  readonly path: string;
  readonly reasons: readonly ReviewContextReason[];
  readonly dependencyDepth: number;
}

function boundedReasons(reasons: readonly ReviewContextReason[]): readonly ReviewContextReason[] {
  return [...reasons].sort((left, right) => {
    const rank = REVIEW_CONTEXT_REASON_RANK[left.kind] - REVIEW_CONTEXT_REASON_RANK[right.kind];
    if (rank !== 0) return rank;
    return compareCodeUnits(`${left.kind}\0${left.sourcePath ?? ''}`, `${right.kind}\0${right.sourcePath ?? ''}`);
  }).slice(0, REVIEW_HARD_LIMITS.contextCandidateReasonsPerFile);
}

export function mergeReviewContextDescriptors(
  input: unknown, additions: readonly unknown[], scope: ReviewBundleScope,
): { readonly descriptors: readonly CandidateDescriptor[]; readonly changed: boolean } {
  const current = bundleArray(input, 'contextCandidates', 0, REVIEW_HARD_LIMITS.contextCandidates).map(descriptor);
  const merged = new Map(current.map((candidate) => [candidate.path, candidate]));
  additions.forEach((value, index) => {
    const candidate = descriptor(value, current.length + index);
    const existing = merged.get(candidate.path);
    if (!existing) {
      merged.set(candidate.path, candidate);
      return;
    }
    const reasons = [...existing.reasons];
    for (const reason of candidate.reasons) {
      if (!reasons.some(({ kind, sourcePath }) => kind === reason.kind && sourcePath === reason.sourcePath)) {
        reasons.push(reason);
      }
    }
    const dependencyDepth = Math.min(existing.dependencyDepth, candidate.dependencyDepth);
    merged.set(candidate.path, { path: candidate.path, reasons, dependencyDepth });
  });
  const depths = new Map([
    ...scope.changedPaths.filter(({ status }) => status !== 'deleted').map(({ path }) => [path, 0] as const),
    ...[...merged.values()].map(({ path, dependencyDepth }) => [path, dependencyDepth] as const),
  ]);
  const output = [...merged.values()].map((candidate) => ({
    ...candidate,
    reasons: boundedReasons(candidate.reasons.filter(({ sourcePath }) => (
      sourcePath !== undefined && (depths.get(sourcePath) ?? Number.POSITIVE_INFINITY) < candidate.dependencyDepth
    ))),
  })).filter(({ reasons }) => reasons.length > 0)
    .sort((left, right) => compareCodeUnits(left.path, right.path));
  descriptors(output, scope);
  const before = [...current].sort((left, right) => compareCodeUnits(left.path, right.path));
  return { descriptors: output, changed: JSON.stringify(before) !== JSON.stringify(output) };
}

function inScope(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => prefix === '.' || path === prefix || path.startsWith(`${prefix}/`));
}

function descriptor(value: unknown, index: number): CandidateDescriptor {
  const label = `contextCandidates[${index}]`;
  const item = bundleRecord(value, label);
  bundleExact(item, ['path', 'reasons', 'dependencyDepth'], [], label);
  if (!Number.isInteger(item.dependencyDepth)
    || Number(item.dependencyDepth) < 1
    || Number(item.dependencyDepth) > REVIEW_HARD_LIMITS.contextDependencyDepth) {
    throw new Error(`${label}.dependencyDepth is invalid`);
  }
  return {
    path: bundlePath(item.path, `${label}.path`),
    reasons: bundleArray(
      item.reasons, `${label}.reasons`, 1, REVIEW_HARD_LIMITS.contextCandidateReasonsPerFile,
    ).map((reason, reasonIndex) => parseReviewContextReason(reason, `${label}.reasons[${reasonIndex}]`)),
    dependencyDepth: Number(item.dependencyDepth),
  };
}

function assertCandidateSource(
  candidate: CandidateDescriptor,
  reason: ReviewContextReason,
  byPath: ReadonlyMap<string, CandidateDescriptor>,
  prefixes: readonly string[],
): void {
  if (!reason.sourcePath) return;
  if (!inScope(reason.sourcePath, prefixes)) {
    throw new Error(`${candidate.path} has out-of-scope provenance`);
  }
  const source = byPath.get(reason.sourcePath);
  if (!source || source.dependencyDepth >= candidate.dependencyDepth) {
    throw new Error(`${candidate.path} has invalid dependency provenance`);
  }
}

function assertCandidateProvenance(
  candidate: CandidateDescriptor,
  changedPaths: ReadonlySet<string>,
  deletedPaths: ReadonlySet<string>,
  byPath: ReadonlyMap<string, CandidateDescriptor>,
  prefixes: readonly string[],
): void {
  if (deletedPaths.has(candidate.path)) throw new Error(`${candidate.path} is deleted and cannot provide context`);
  const marksChanged = candidate.reasons.some(({ kind }) => kind === 'changed');
  if (marksChanged !== changedPaths.has(candidate.path) || marksChanged !== (candidate.dependencyDepth === 0)) {
    throw new Error(`${candidate.path} has invalid changed provenance`);
  }
  for (const reason of candidate.reasons) assertCandidateSource(candidate, reason, byPath, prefixes);
}

function descriptors(input: unknown, scope: ReviewBundleScope): readonly CandidateDescriptor[] {
  const supplied = bundleArray(
    input, 'contextCandidates', 0, REVIEW_HARD_LIMITS.contextCandidates,
  ).map(descriptor);
  for (const candidate of supplied) {
    if (!inScope(candidate.path, scope.allowedPrefixes)) {
      throw new Error(`${candidate.path} is outside allowed scope`);
    }
  }
  const changed = scope.changedPaths
    .filter(({ status }) => status !== 'deleted')
    .map(({ path }): CandidateDescriptor => ({
      path, reasons: [{ kind: 'changed' }], dependencyDepth: 0,
    }));
  const combined = [...changed, ...supplied].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  bundleUnique(combined.map(({ path }) => path), 'context candidate paths');
  const byPath = new Map(combined.map((candidate) => [candidate.path, candidate]));
  const changedPaths = new Set(changed.map(({ path }) => path));
  const deletedPaths = new Set(scope.changedPaths.filter(({ status }) => status === 'deleted').map(({ path }) => path));
  for (const candidate of combined) {
    assertCandidateProvenance(candidate, changedPaths, deletedPaths, byPath, scope.allowedPrefixes);
  }
  return combined;
}

function parsedHydratedCandidate(
  rawResponse: unknown,
  candidate: CandidateDescriptor,
  revision: FrozenReviewRevision,
): ReviewContextCandidate {
  const label = `revision response for ${candidate.path}`;
  try {
    const response = bundleRecord(rawResponse, label);
    bundleExact(response, ['path', 'head', 'content', 'sizeBytes', 'digest'], ['objectId'], label);
    const valid = response.path === candidate.path
      && response.head === revision.head
      && typeof response.content === 'string'
      && Number.isSafeInteger(response.sizeBytes)
      && response.sizeBytes === Buffer.byteLength(response.content, 'utf8')
      && (response.objectId === undefined || (typeof response.objectId === 'string'
        && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(response.objectId)))
      && response.digest === sha256Text(response.content);
    if (!valid) throw new Error(`revision proof for ${candidate.path} is invalid`);
    return {
      ...candidate,
      content: response.content as string,
      digest: response.digest as `sha256:${string}`,
      reasons: candidate.reasons,
    };
  } catch (error) {
    throw new ReviewRepositoryProofError(error instanceof Error ? error.message : String(error));
  }
}

async function hydrate(
  candidate: CandidateDescriptor,
  revision: FrozenReviewRevision,
  allowedPrefixes: readonly string[],
  maxBytes: number,
  context: PluginInvocationContext,
): Promise<ReviewContextCandidate> {
  let rawResponse: unknown;
  try {
    rawResponse = await context.invoke('git.repository.read', {
      operation: 'read_revision_text',
      resource: { type: 'git.repository.path', canonicalId: candidate.path },
      payload: { head: revision.head, proof: revision.proof, allowedPrefixes, maxBytes },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('REPOSITORY_FILE_TOO_LARGE')) {
      throw new ReviewContextHydrationLimitError(`${candidate.path} exceeds the context file byte limit`);
    }
    throw error;
  }
  return parsedHydratedCandidate(rawResponse, candidate, revision);
}

function orderedDescriptors(input: unknown, scope: ReviewBundleScope): readonly CandidateDescriptor[] {
  return [...descriptors(input, scope)].sort((left, right) => {
    if (left.dependencyDepth !== right.dependencyDepth) return left.dependencyDepth - right.dependencyDepth;
    const leftReason = Math.min(...left.reasons.map(({ kind }) => REVIEW_CONTEXT_REASON_RANK[kind]));
    const rightReason = Math.min(...right.reasons.map(({ kind }) => REVIEW_CONTEXT_REASON_RANK[kind]));
    if (leftReason !== rightReason) return leftReason - rightReason;
    return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
  });
}

async function hydrateCandidatePool(
  values: readonly CandidateDescriptor[],
  scope: ReviewBundleScope,
  revision: FrozenReviewRevision,
  policy: ResolvedReviewPolicy,
  context: PluginInvocationContext,
): Promise<readonly ReviewContextCandidate[]> {
  const limits = policy.policy.limits;
  const changedCount = values.filter(({ dependencyDepth }) => dependencyDepth === 0).length;
  if (changedCount > limits.maxContextFiles) {
    throw new ReviewContextHydrationLimitError('changed files exceed the context file limit');
  }
  const hydrated: ReviewContextCandidate[] = [];
  let hydratedBytes = 0;
  let inspected = 0;
  for (const candidate of values) {
    if (candidate.dependencyDepth > limits.maxDependencyDepth) continue;
    // The total file limit defines the deterministic candidate pool for both
    // initial selection and cumulative expansion. Lower-ranked descriptors
    // cannot fit into the same cumulative review and are never read.
    if (inspected >= limits.maxContextFiles) break;
    inspected += 1;
    let value: ReviewContextCandidate;
    try {
      value = await hydrate(
        candidate, revision, scope.allowedPrefixes, limits.maxContextFileBytes, context,
      );
    } catch (error) {
      if (error instanceof ReviewContextHydrationLimitError && candidate.dependencyDepth > 0) continue;
      throw error;
    }
    const bytes = Buffer.byteLength(value.content, 'utf8');
    if (hydratedBytes + bytes > REVIEW_HARD_LIMITS.contextCandidateBytes) {
      if (candidate.dependencyDepth === 0) {
        throw new ReviewContextHydrationLimitError('changed files exceed the hard candidate byte limit');
      }
      break;
    }
    hydrated.push(value);
    hydratedBytes += bytes;
  }
  return hydrated;
}

function closeCandidateProvenance(
  candidates: readonly ReviewContextCandidate[],
): readonly ReviewContextCandidate[] {
  let closed = candidates;
  for (;;) {
    const paths = new Set(closed.map(({ path }) => path));
    const next = closed.filter((candidate) => candidate.reasons.every(
      ({ sourcePath }) => sourcePath === undefined || paths.has(sourcePath),
    ));
    if (next.length === closed.length) return closed;
    closed = next;
  }
}

export async function hydrateReviewContextCandidates(
  input: unknown,
  scope: ReviewBundleScope,
  revision: FrozenReviewRevision,
  policy: ResolvedReviewPolicy,
  context: PluginInvocationContext,
): Promise<readonly ReviewContextCandidate[]> {
  const values = orderedDescriptors(input, scope);
  const hydrated = await hydrateCandidatePool(values, scope, revision, policy, context);
  return closeCandidateProvenance(hydrated);
}
