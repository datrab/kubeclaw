import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import { reviewClusterId } from './review-cluster-identity.ts';
import type { ReviewProposalPreflight } from './review-proposal-preflight.ts';
import type { VerifiedReviewFinding } from './review-reduction-state.ts';
import type { ReconciledReviewVerification } from './review-verification-reconciliation.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { isCertifiedVerifiedReviewFindings } from './review-verified-findings.ts';
import { compareCodeUnits } from './review-ordering.ts';

export interface ReviewFindingCluster {
  readonly clusterId: `sha256:${string}`;
  readonly representative: VerifiedReviewFinding;
  readonly findings: readonly VerifiedReviewFinding[];
}

interface ClusterProof {
  readonly snapshot: ReviewBundleSnapshot;
  readonly findings: readonly VerifiedReviewFinding[];
  readonly policy: ResolvedReviewPolicy;
}

const CERTIFIED_CLUSTERS = new WeakMap<object, ClusterProof>();

export function buildReviewFindingClusters(
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight,
  reconciliation: ReconciledReviewVerification,
  findings: readonly VerifiedReviewFinding[],
  policy: ResolvedReviewPolicy,
): readonly ReviewFindingCluster[] {
  if (!isCertifiedVerifiedReviewFindings(findings, snapshot, preflight, reconciliation, policy)) {
    throw new Error('finding clusters require a certified verified-finding set');
  }
  const grouped = new Map<string, VerifiedReviewFinding[]>();
  for (const finding of findings) {
    const clusterId = reviewClusterId(snapshot.bundle.revisions.base, finding);
    grouped.set(clusterId, [...(grouped.get(clusterId) ?? []), finding]);
  }
  const clusters = [...grouped.entries()].map(([clusterId, members]) => {
    const sorted = [...members].sort((left, right) => compareCodeUnits(left.fingerprint, right.fingerprint));
    const representative = sorted[0];
    if (!representative) throw new Error(`cluster ${clusterId} has no representative`);
    return Object.freeze({
      clusterId: clusterId as `sha256:${string}`,
      representative,
      findings: Object.freeze(sorted),
    });
  }).sort((left, right) => compareCodeUnits(left.clusterId, right.clusterId));
  const certified = Object.freeze(clusters);
  CERTIFIED_CLUSTERS.set(certified, Object.freeze({ snapshot, findings, policy }));
  return certified;
}

export function isCertifiedReviewFindingClusters(
  value: unknown,
  snapshot: ReviewBundleSnapshot,
  findings: readonly VerifiedReviewFinding[],
  policy: ResolvedReviewPolicy,
): value is readonly ReviewFindingCluster[] {
  if (!value || typeof value !== 'object') return false;
  const proof = CERTIFIED_CLUSTERS.get(value);
  return proof?.snapshot === snapshot && proof.findings === findings && proof.policy === policy;
}
