import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import type { ProposedFinding, SourceLocation } from './echo-review-contract.ts';
import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import { isReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import type { PreflightedReviewProposal, ReviewProposalPreflight } from './review-proposal-preflight.ts';
import { isCertifiedReviewProposalPreflight } from './review-proposal-preflight.ts';
import type { VerifiedReviewFinding } from './review-reduction-state.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import type { ReconciledReviewVerification } from './review-verification-reconciliation.ts';
import { isCertifiedReviewVerificationReconciliation } from './review-verification-reconciliation.ts';
import {
  classifyRepair,
  sharedRootCauseHint,
  type VerifiedRootCause,
} from './review-cluster-contract.ts';

interface FindingSetProof {
  readonly snapshot: ReviewBundleSnapshot;
  readonly preflight: ReviewProposalPreflight;
  readonly reconciliation: ReconciledReviewVerification;
  readonly policy: ResolvedReviewPolicy;
}

const VERIFIED_FINDING_SET_PROOFS = new WeakMap<object, FindingSetProof>();
const VERIFIED_ROOT_CAUSES = new WeakMap<object, string>();

function certifyVerifiedRootCause(value: VerifiedRootCause, findingFingerprint: string): VerifiedRootCause {
  const certified = Object.freeze({ ...value });
  VERIFIED_ROOT_CAUSES.set(certified, findingFingerprint);
  return certified;
}

export function isCertifiedVerifiedRootCause(
  value: unknown,
  category: ProposedFinding['category'],
  findingFingerprint: string,
): value is VerifiedRootCause {
  if (!value || typeof value !== 'object' || VERIFIED_ROOT_CAUSES.get(value) !== findingFingerprint) return false;
  const cause = value as VerifiedRootCause;
  return Object.isFrozen(value) && cause.category === category;
}

function locationIdentity(location: SourceLocation): Readonly<Record<string, unknown>> {
  return { path: location.path, ...(location.symbol === undefined ? {} : { symbol: location.symbol }) };
}

function sortedUnique<T>(values: readonly T[]): readonly T[] {
  const unique = new Map(values.map((value) => [canonicalJson(value), value]));
  return [...unique.values()].sort((left, right) => {
    const a = canonicalJson(left), b = canonicalJson(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function fingerprint(
  snapshot: ReviewBundleSnapshot,
  proposal: PreflightedReviewProposal,
): `sha256:${string}` {
  const finding = proposal.finding;
  return sha256Text(canonicalJson({
    version: 'verified-review-finding.v1',
    repositoryBase: snapshot.bundle.revisions.base,
    category: finding.category,
    priority: finding.priority,
    claim: finding.claim,
    impact: finding.impact,
    locations: sortedUnique(finding.locations.map(locationIdentity)),
    evidence: sortedUnique(finding.evidence),
    recommendedFix: finding.recommendedFix,
    changeRelation: proposal.changeRelation,
    scopeRelation: proposal.scopeRelation,
    evidenceStrength: finding.evidenceStrength,
    ...(finding.rootCauseHint === undefined ? {} : { rootCauseHint: finding.rootCauseHint }),
    ...(finding.simplification === undefined ? {} : { simplification: finding.simplification }),
  }));
}

function repairable(snapshot: ReviewBundleSnapshot, proposal: PreflightedReviewProposal): boolean {
  const reviewedPaths = new Set(snapshot.bundle.context.map(({ path }) => path));
  return proposal.scopeRelation === 'inside'
    && proposal.finding.locations.some(({ path }) => reviewedPaths.has(path));
}

function verifiedFinding(
  snapshot: ReviewBundleSnapshot,
  proposal: PreflightedReviewProposal,
): VerifiedReviewFinding {
  const finding: ProposedFinding = proposal.finding;
  if (finding.evidenceStrength === 'insufficient') {
    throw new Error(`confirmed proposal ${proposal.proposalId} has insufficient evidence strength`);
  }
  const primary = [...finding.locations].sort((left, right) => {
    const a = canonicalJson(locationIdentity(left)), b = canonicalJson(locationIdentity(right));
    return a < b ? -1 : a > b ? 1 : 0;
  })[0];
  if (!primary) throw new Error(`confirmed proposal ${proposal.proposalId} has no location`);
  const sharedHint = sharedRootCauseHint(finding.rootCauseHint);
  const findingFingerprint = fingerprint(snapshot, proposal);
  return {
    fingerprint: findingFingerprint,
    category: finding.category,
    priority: finding.priority,
    message: finding.claim,
    recommendedFix: finding.recommendedFix,
    changeRelation: proposal.changeRelation,
    scopeRelation: proposal.scopeRelation,
    evidenceStrength: finding.evidenceStrength,
    repairable: repairable(snapshot, proposal),
    verified: true,
    rootCause: certifyVerifiedRootCause({
      category: finding.category,
      ...(sharedHint === undefined ? {} : { sharedHint }),
      primaryPath: primary.path,
      ...(primary.symbol === undefined ? {} : { primarySymbol: primary.symbol }),
      repairClass: classifyRepair(finding.recommendedFix),
    }, findingFingerprint),
  };
}

export function buildVerifiedReviewFindings(
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight,
  reconciliation: ReconciledReviewVerification,
  policy: ResolvedReviewPolicy,
): readonly VerifiedReviewFinding[] {
  if (!isReviewBundleSnapshot(snapshot)) {
    throw new Error('verified findings require a certified review bundle snapshot');
  }
  if (!isCertifiedReviewProposalPreflight(preflight, snapshot.bundle, policy)) {
    throw new Error('verified findings require certified proposal preflight');
  }
  if (!isCertifiedReviewVerificationReconciliation(reconciliation, snapshot, preflight, policy)) {
    throw new Error('verified findings require certified verifier reconciliation');
  }
  if (reconciliation.integrityIssues.length > 0) return Object.freeze([]);
  const unique = new Map<string, VerifiedReviewFinding>();
  for (const proposalId of reconciliation.confirmedProposalIds) {
    const proposal = preflight.proposals[proposalId];
    if (!proposal) throw new Error(`confirmed proposal ${proposalId} is missing from preflight`);
    const finding = verifiedFinding(snapshot, proposal);
    if (!unique.has(finding.fingerprint)) unique.set(finding.fingerprint, finding);
  }
  const findings = [...unique.values()].sort(
    (left, right) => left.fingerprint < right.fingerprint ? -1 : left.fingerprint > right.fingerprint ? 1 : 0,
  );
  const certified = Object.freeze(findings.map((finding) => Object.freeze(finding)));
  VERIFIED_FINDING_SET_PROOFS.set(certified, Object.freeze({
    snapshot,
    preflight,
    reconciliation,
    policy,
  }));
  return certified;
}

export function isCertifiedVerifiedReviewFindings(
  value: unknown,
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight,
  reconciliation: ReconciledReviewVerification,
  policy: ResolvedReviewPolicy,
): value is readonly VerifiedReviewFinding[] {
  if (!value || typeof value !== 'object') return false;
  const proof = VERIFIED_FINDING_SET_PROOFS.get(value);
  return isReviewBundleSnapshot(snapshot)
    && proof?.snapshot === snapshot
    && proof.preflight === preflight
    && proof.reconciliation === reconciliation
    && proof.policy === policy;
}
