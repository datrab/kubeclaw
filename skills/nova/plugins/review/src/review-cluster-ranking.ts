import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import {
  isCertifiedReviewFindingClusters,
  type ReviewFindingCluster,
} from './review-clustering.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import type { VerifiedReviewFinding } from './review-reduction-state.ts';
import { compareCodeUnits } from './review-ordering.ts';

export interface RankedReviewFindingCluster extends ReviewFindingCluster {
  readonly score: number;
}

interface RankingProof {
  readonly clusters: readonly ReviewFindingCluster[];
  readonly policy: ResolvedReviewPolicy;
}

const CERTIFIED_RANKINGS = new WeakMap<object, RankingProof>();

export function reviewFindingScore(
  finding: VerifiedReviewFinding,
  policy: ResolvedReviewPolicy,
): number {
  const ranking = policy.policy.ranking;
  return ranking.priorityWeights[finding.priority]
    + ranking.categoryWeights[finding.category]
    + (finding.changeRelation === 'introduced' ? ranking.introducedByDiffBonus : 0)
    + (finding.evidenceStrength === 'direct' ? ranking.directEvidenceBonus : 0);
}

export function rankReviewFindingClusters(
  clusters: readonly ReviewFindingCluster[],
  snapshot: ReviewBundleSnapshot,
  findings: readonly VerifiedReviewFinding[],
  policy: ResolvedReviewPolicy,
): readonly RankedReviewFindingCluster[] {
  if (!isCertifiedReviewFindingClusters(clusters, snapshot, findings, policy)) {
    throw new Error('cluster ranking requires a certified finding-cluster set');
  }
  const ranked = clusters.map((cluster) => {
    const members = [...cluster.findings].sort((left, right) => {
      const score = reviewFindingScore(right, policy) - reviewFindingScore(left, policy);
      return score || compareCodeUnits(left.fingerprint, right.fingerprint);
    });
    const representative = members[0];
    if (!representative) throw new Error(`cluster ${cluster.clusterId} has no representative`);
    return Object.freeze({
      clusterId: cluster.clusterId,
      representative,
      findings: Object.freeze(members),
      score: reviewFindingScore(representative, policy),
    });
  }).sort((left, right) => (right.score - left.score) || compareCodeUnits(left.clusterId, right.clusterId));
  const certified = Object.freeze(ranked);
  CERTIFIED_RANKINGS.set(certified, Object.freeze({ clusters, policy }));
  return certified;
}

export function isCertifiedRankedReviewClusters(
  value: unknown,
  clusters: readonly ReviewFindingCluster[],
  policy: ResolvedReviewPolicy,
): value is readonly RankedReviewFindingCluster[] {
  if (!value || typeof value !== 'object') return false;
  const proof = CERTIFIED_RANKINGS.get(value);
  return proof?.clusters === clusters && proof.policy === policy;
}
