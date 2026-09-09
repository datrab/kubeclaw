import { assertReviewCoverage } from './review-coverage.ts';
import { canonicalJson, type PluginInvocationContext } from '@kubeclaw/plugin-sdk';

import { buildSimplificationCandidateManifest } from './simplification-manifest.ts';
import { produceSimplificationFacts } from './simplification-fact-producer.ts';
import { REVIEW_BUNDLE_SCHEMA_VERSION, REVIEW_CONTEXT_SELECTION_VERSION,
  type ReviewBundle } from './review-bundle-contract.ts';
import { snapshotReviewBundle, type ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import { selectReviewContext, selectReviewContextForSlicing,
  type ReviewContextSelectionResult } from './review-context-selection.ts';
import { hydrateReviewContextCandidates, mergeReviewContextDescriptors,
  ReviewContextHydrationLimitError } from './review-context-candidates.ts';
import { produceReviewContextCandidates } from './review-context-production.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { freezeReviewRevision, readChangedScope, ReviewRepositoryProofError,
  type FrozenReviewRevision } from './review-repository.ts';
import type { ReviewStageInput } from './review-stage-input.ts';
import { buildReviewSlices } from './review-slicing.ts';

export class ReviewPreparationLimitError extends Error {}
export class ReviewPreparationIntegrityError extends Error {}

export interface PreparedReview {
  readonly repository: Awaited<ReturnType<typeof readChangedScope>>;
  readonly revision: FrozenReviewRevision;
  readonly candidates: readonly unknown[];
  readonly initial: ReviewContextSelectionResult;
  readonly snapshot: ReviewBundleSnapshot;
  readonly sliceSnapshots: readonly ReviewBundleSnapshot[];
}

interface SnapshotInput {
  readonly input: ReviewStageInput; readonly scope: ReviewBundle['scope'];
  readonly manifestDigest: `sha256:${string}`; readonly revision: FrozenReviewRevision;
  readonly selection: ReviewContextSelectionResult; readonly policy: ResolvedReviewPolicy;
  readonly evidenceSelection?: ReviewContextSelectionResult;
}

export function buildReviewSnapshot(values: SnapshotInput): ReviewBundleSnapshot {
  const { input, scope, manifestDigest, revision, selection, policy } = values;
  const evidenceSelection = values.evidenceSelection ?? selection;
  const identity = { base: input.revisions.base, head: revision.head, changedManifestDigest: manifestDigest };
  const generated = policy.policy.simplification.enabled
    ? [produceSimplificationFacts(identity, evidenceSelection.selected)] : [];
  const sourceEvidence = [...input.evidence, ...generated];
  const simplification = buildSimplificationCandidateManifest({ revision: identity, evidence: sourceEvidence,
    reviewedPaths: evidenceSelection.selected.map(({ path }) => path), policy });
  const evidence = [...sourceEvidence, ...(simplification ? [simplification.evidence] : [])];
  if (evidence.length > REVIEW_HARD_LIMITS.inspectedEvidence) {
    throw new ReviewPreparationLimitError('Simplification candidate evidence exceeds the review evidence limit');
  }
  const snapshot = snapshotReviewBundle({
    schemaVersion: REVIEW_BUNDLE_SCHEMA_VERSION, task: input.task,
    revisions: identity, scope, requirements: input.requirements, evidence, context: selection.selected,
    selection: { version: REVIEW_CONTEXT_SELECTION_VERSION,
      candidateManifestDigest: selection.candidateManifestDigest, expansionRound: selection.expansionRound },
    policyDigest: policy.digest,
  });
  const bytes = Buffer.byteLength(canonicalJson(snapshot.bundle), 'utf8');
  if (bytes > policy.policy.limits.maxBundleBytes) {
    throw new ReviewPreparationLimitError(`review bundle is ${bytes} bytes`);
  }
  return snapshot;
}

function missingChangedPaths(
  scope: ReviewBundle['scope'], selection: ReviewContextSelectionResult,
): readonly string[] {
  const selected = new Set(selection.selected.map(({ path }) => path));
  return scope.changedPaths.filter(({ status, path }) => status !== 'deleted' && !selected.has(path))
    .map(({ path }) => path);
}

async function reviewCandidates(
  input: ReviewStageInput, repository: PreparedReview['repository'], revision: FrozenReviewRevision,
  policy: ResolvedReviewPolicy, context: PluginInvocationContext,
): Promise<readonly unknown[]> {
  try {
    const descriptors = [...input.contextCandidates];
    const changed = new Set(repository.scope.changedPaths.map(({ path }) => path));
    let hydrated = await hydrateReviewContextCandidates(descriptors, repository.scope, revision, policy, context);
    for (let depth = 1; depth <= policy.policy.limits.maxDependencyDepth; depth += 1) {
      const produced = await produceReviewContextCandidates(hydrated, repository.scope, revision, context);
      const next = produced.filter((item) => item.dependencyDepth === depth && !changed.has(item.path));
      const merged = mergeReviewContextDescriptors(descriptors, next, repository.scope);
      if (!merged.changed) break;
      descriptors.splice(0, descriptors.length, ...merged.descriptors);
      hydrated = await hydrateReviewContextCandidates(descriptors, repository.scope, revision, policy, context);
    }
    return hydrated;
  } catch (error) {
    if (error instanceof ReviewContextHydrationLimitError) throw new ReviewPreparationLimitError(error.message);
    if (error instanceof ReviewRepositoryProofError) throw error;
    throw new ReviewPreparationIntegrityError(error instanceof Error ? error.message : String(error));
  }
}

function initialSelection(
  candidates: readonly unknown[], scope: ReviewBundle['scope'], policy: ResolvedReviewPolicy,
): ReviewContextSelectionResult {
  try {
    const focused = selectReviewContext(candidates, scope, policy);
    return missingChangedPaths(scope, focused).length === 0
      ? focused : selectReviewContextForSlicing(candidates, scope, policy);
  } catch (error) {
    throw new ReviewPreparationIntegrityError(error instanceof Error ? error.message : String(error));
  }
}

export async function prepareReview(
  input: ReviewStageInput, policy: ResolvedReviewPolicy, context: PluginInvocationContext,
): Promise<PreparedReview> {
  assertReviewCoverage(input);
  const revision = await freezeReviewRevision(context);
  if (input.revisions.head !== undefined && revision.head !== input.revisions.head) {
    throw new ReviewRepositoryProofError('REVIEW_CANDIDATE_CHANGED');
  }
  const repository = await readChangedScope(input.revisions.base, revision, input.scope.allowedPrefixes, context);
  const candidates = await reviewCandidates(input, repository, revision, policy, context);
  const initial = initialSelection(candidates, repository.scope, policy);
  const missing = missingChangedPaths(repository.scope, initial);
  if (missing.length > 0) throw new ReviewPreparationLimitError(`changed context was not selected: ${missing.join(', ')}`);
  const values = { input, scope: repository.scope, manifestDigest: repository.manifestDigest, revision, policy };
  const snapshot = buildReviewSnapshot({ ...values, selection: initial });
  let slices: ReturnType<typeof buildReviewSlices>;
  try { slices = buildReviewSlices(initial, policy); } catch (error) {
    throw new ReviewPreparationLimitError(error instanceof Error ? error.message : String(error));
  }
  const sliceSnapshots = slices.map(({ selection }) => buildReviewSnapshot({
    ...values, selection, evidenceSelection: initial,
  }));
  return { repository, revision, candidates, initial, snapshot, sliceSnapshots };
}
