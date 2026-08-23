import type { EvidenceRef } from './echo-review-contract.ts';
import type { ReviewBundle, ReviewBundleContextItem } from './review-bundle-contract.ts';

export const REVIEWED_SOURCE_EVIDENCE_KIND = 'reviewed-source' as const;
export const REVIEWED_TOPOLOGY_EVIDENCE_KIND = 'reviewed-topology' as const;

export function reviewedSourceEvidence(item: ReviewBundleContextItem): EvidenceRef {
  return Object.freeze({ kind: REVIEWED_SOURCE_EVIDENCE_KIND, digest: item.digest });
}

export function offeredReviewEvidence(bundle: ReviewBundle): readonly EvidenceRef[] {
  return Object.freeze([
    ...bundle.evidence.map(({ kind, digest }) => Object.freeze({ kind, digest })),
    ...bundle.context.map(reviewedSourceEvidence),
  ]);
}

export function offeredReviewEvidenceKeys(bundle: ReviewBundle): ReadonlySet<string> {
  return new Set(offeredReviewEvidence(bundle).map(({ kind, digest }) => `${kind}\0${digest}`));
}
