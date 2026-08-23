import type { EvidenceRef, ProposedFinding } from './echo-review-contract.ts';
import type { ScalableReviewSource } from './scalable-review-types.ts';
import type { VerificationVerdict } from './echo-review-verification-contract.ts';
import { REVIEWED_SOURCE_EVIDENCE_KIND } from './review-evidence-authority.ts';

export function verifierEvidenceMatchesSource(values: {
  readonly evidence: readonly EvidenceRef[];
  readonly verdict: VerificationVerdict;
  readonly locations: ProposedFinding['locations'];
  readonly source: readonly ScalableReviewSource[];
}): boolean {
  const sourceDigests = new Set(values.source.map(({ digest }) => digest));
  const verifiedDigests = new Set(values.evidence.map(({ digest }) => digest));
  if (values.evidence.some(({ kind, digest }) => (
    kind !== REVIEWED_SOURCE_EVIDENCE_KIND || !sourceDigests.has(digest)
  ))) return false;
  return values.verdict !== 'confirmed' || values.locations.every(({ path }) => {
    const source = values.source.find((item) => item.path === path);
    return Boolean(source && verifiedDigests.has(source.digest));
  });
}
