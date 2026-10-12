import {
  isCertifiedRankedReviewClusters,
  type RankedReviewFindingCluster,
} from './review-cluster-ranking.ts';
import type { ReviewFindingCluster } from './review-clustering.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import type { VerifiedReviewFinding } from './review-reduction-state.ts';

export interface RepairBatchCluster {
  readonly clusterId: `sha256:${string}`;
  readonly score: number;
  readonly totalInstanceCount: number;
  readonly omittedInstanceCount: number;
  readonly findingFingerprints: readonly string[];
}

export interface ReviewRepairBatch {
  readonly totalRootCauseCount: number;
  readonly omittedRootCauseCount: number;
  readonly totalFindingCount: number;
  readonly omittedFindingCount: number;
  readonly clusters: readonly RepairBatchCluster[];
}

interface BatchProof {
  readonly ranked: readonly RankedReviewFindingCluster[];
  readonly policy: ResolvedReviewPolicy;
  readonly selectedFindings: readonly VerifiedReviewFinding[];
  readonly selectionDigest: `sha256:${string}`;
}

const CERTIFIED_BATCHES = new WeakMap<object, BatchProof>();

function selectionDigest(findings: readonly VerifiedReviewFinding[]): `sha256:${string}` {
  return sha256Text(canonicalJson(
    findings.map(({ fingerprint }) => fingerprint).sort(),
  ));
}

function batchCluster(
  cluster: RankedReviewFindingCluster,
  findings: readonly VerifiedReviewFinding[],
  maximum: number,
): RepairBatchCluster {
  const shown = findings.slice(0, maximum);
  return Object.freeze({
    clusterId: cluster.clusterId,
    score: cluster.score,
    totalInstanceCount: findings.length,
    omittedInstanceCount: findings.length - shown.length,
    findingFingerprints: Object.freeze(shown.map(({ fingerprint }) => fingerprint)),
  });
}

export function buildReviewRepairBatch(
  ranked: readonly RankedReviewFindingCluster[],
  clusters: readonly ReviewFindingCluster[],
  policy: ResolvedReviewPolicy,
  selectedFindings: readonly VerifiedReviewFinding[],
): ReviewRepairBatch {
  if (!isCertifiedRankedReviewClusters(ranked, clusters, policy)) {
    throw new Error('repair batches require a certified ranked-cluster set');
  }
  const included = new Set(selectedFindings.map(({ fingerprint }) => fingerprint));
  const eligible = ranked.flatMap((cluster) => {
    const findings = cluster.findings.filter(({ fingerprint }) => included.has(fingerprint));
    if (findings.length === 0) return [];
    return [{ cluster, findings }];
  });
  const displayed = eligible.slice(0, policy.policy.limits.maxRootCauses);
  const displayedFindingCount = displayed.reduce((total, { findings }) => (
    total + Math.min(findings.length, policy.policy.limits.maxInstancesPerCluster)
  ), 0);
  const totalFindingCount = eligible.reduce((total, { findings }) => total + findings.length, 0);
  const batch = Object.freeze({
    totalRootCauseCount: eligible.length,
    omittedRootCauseCount: eligible.length - displayed.length,
    totalFindingCount,
    omittedFindingCount: totalFindingCount - displayedFindingCount,
    clusters: Object.freeze(displayed.map(({ cluster, findings }) => (
      batchCluster(cluster, findings, policy.policy.limits.maxInstancesPerCluster)
    ))),
  });
  CERTIFIED_BATCHES.set(batch, Object.freeze({
    ranked, policy, selectedFindings, selectionDigest: selectionDigest(selectedFindings),
  }));
  return batch;
}

export function isCertifiedReviewRepairBatch(
  value: unknown,
  ranked: readonly RankedReviewFindingCluster[],
  policy: ResolvedReviewPolicy,
  selectedFindings: readonly VerifiedReviewFinding[],
): value is ReviewRepairBatch {
  if (!value || typeof value !== 'object') return false;
  const proof = CERTIFIED_BATCHES.get(value);
  return proof?.ranked === ranked && proof.policy === policy
    && proof.selectedFindings === selectedFindings
    && proof.selectionDigest === selectionDigest(selectedFindings);
}
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
