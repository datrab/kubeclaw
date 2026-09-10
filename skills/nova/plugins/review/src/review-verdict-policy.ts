import { isResolvedReviewPolicy, assertReviewPolicyBundle, type ResolvedReviewPolicy } from './review-policy-resolver.ts';
import {
  isCertifiedReviewVerificationReconciliation,
  type ReconciledReviewVerification,
} from './review-verification-reconciliation.ts';
import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import type { ReviewProposalPreflight } from './review-proposal-preflight.ts';

export interface ReviewVerdictPolicyMapping {
  readonly confirmedProposalIds: readonly `sha256:${string}`[];
  readonly rejectedProposalIds: readonly `sha256:${string}`[];
  readonly ignoredInsufficientProposalIds: readonly `sha256:${string}`[];
  readonly followUpProposalIds: readonly `sha256:${string}`[];
  readonly orchestratorProposalIds: readonly `sha256:${string}`[];
}

interface MappingProof {
  readonly reconciliation: ReconciledReviewVerification;
  readonly policy: ResolvedReviewPolicy;
}

const CERTIFIED_MAPPINGS = new WeakMap<object, MappingProof>();

function frozenIds(ids: readonly `sha256:${string}`[]): readonly `sha256:${string}`[] {
  return Object.freeze([...ids]);
}

export function mapReviewVerificationVerdicts(
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight,
  reconciliation: ReconciledReviewVerification,
  policy: ResolvedReviewPolicy,
): ReviewVerdictPolicyMapping {
  assertReviewPolicyBundle(policy, snapshot.bundle);
  if (!isResolvedReviewPolicy(policy)
    || !isCertifiedReviewVerificationReconciliation(reconciliation, snapshot, preflight, policy)) {
    throw new Error('verifier verdict policy mapping requires certified inputs');
  }
  const insufficient = reconciliation.insufficientProposalIds;
  const action = policy.policy.verification.insufficientFindingEvidence;
  const result = Object.freeze({
    confirmedProposalIds: frozenIds(reconciliation.confirmedProposalIds),
    rejectedProposalIds: frozenIds(reconciliation.rejectedProposalIds),
    ignoredInsufficientProposalIds: frozenIds(action === 'reject' ? insufficient : []),
    followUpProposalIds: frozenIds(action === 'follow_up' ? insufficient : []),
    orchestratorProposalIds: frozenIds(action === 'orchestrator_required' ? insufficient : []),
  });
  CERTIFIED_MAPPINGS.set(result, Object.freeze({ reconciliation, policy }));
  return result;
}

export function isCertifiedReviewVerdictPolicyMapping(
  value: unknown,
  reconciliation: ReconciledReviewVerification,
  policy: ResolvedReviewPolicy,
): value is ReviewVerdictPolicyMapping {
  if (!value || typeof value !== 'object') return false;
  const proof = CERTIFIED_MAPPINGS.get(value);
  return proof?.reconciliation === reconciliation && proof.policy === policy;
}
