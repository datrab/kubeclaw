import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import { rankReviewFindingClusters, type RankedReviewFindingCluster } from './review-cluster-ranking.ts';
import { buildReviewFindingClusters, type ReviewFindingCluster } from './review-clustering.ts';
import type { ReviewProposalPreflight } from './review-proposal-preflight.ts';
import type { VerifiedReviewFinding } from './review-reduction-state.ts';
import type { ReconciledReviewVerification } from './review-verification-reconciliation.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';

export interface ReviewFindingGovernance {
  readonly clusters: readonly ReviewFindingCluster[];
  readonly ranked: readonly RankedReviewFindingCluster[];
}

interface GovernanceProof {
  readonly findings: readonly VerifiedReviewFinding[];
  readonly policy: ResolvedReviewPolicy;
}

const CERTIFIED_GOVERNANCE = new WeakMap<object, GovernanceProof>();

export function buildReviewFindingGovernance(
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight,
  reconciliation: ReconciledReviewVerification,
  findings: readonly VerifiedReviewFinding[],
  policy: ResolvedReviewPolicy,
): ReviewFindingGovernance {
  const clusters = buildReviewFindingClusters(snapshot, preflight, reconciliation, findings, policy);
  const ranked = rankReviewFindingClusters(clusters, snapshot, findings, policy);
  const governance = Object.freeze({ clusters, ranked });
  CERTIFIED_GOVERNANCE.set(governance, Object.freeze({ findings, policy }));
  return governance;
}

export function isCertifiedReviewFindingGovernance(
  value: unknown,
  findings: readonly VerifiedReviewFinding[],
  policy: ResolvedReviewPolicy,
): value is ReviewFindingGovernance {
  if (!value || typeof value !== 'object') return false;
  const proof = CERTIFIED_GOVERNANCE.get(value);
  return proof?.findings === findings && proof.policy === policy;
}
