import type { EchoReviewVerificationResult } from './echo-review-verification-contract.ts';
import type { ParsedEchoReviewVerificationOutput } from './echo-review-verification-parser.ts';
import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import { isReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import type { ReviewProposalPreflight } from './review-proposal-preflight.ts';
import { isCertifiedReviewProposalPreflight } from './review-proposal-preflight.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { offeredReviewEvidenceKeys } from './review-evidence-authority.ts';

export interface ReconciledReviewVerification {
  readonly results: Readonly<Record<string, EchoReviewVerificationResult>>;
  readonly confirmedProposalIds: readonly `sha256:${string}`[];
  readonly rejectedProposalIds: readonly `sha256:${string}`[];
  readonly insufficientProposalIds: readonly `sha256:${string}`[];
  readonly integrityIssues: readonly string[];
}

interface ReconciliationProof {
  readonly snapshot: ReviewBundleSnapshot;
  readonly preflight: ReviewProposalPreflight;
  readonly policy: ResolvedReviewPolicy;
}

const CERTIFIED_RECONCILIATIONS = new WeakMap<object, ReconciliationProof>();

export function isCertifiedReviewVerificationReconciliation(
  value: unknown,
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight,
  policy: ResolvedReviewPolicy,
): value is ReconciledReviewVerification {
  if (!value || typeof value !== 'object') return false;
  const proof = CERTIFIED_RECONCILIATIONS.get(value);
  return isReviewBundleSnapshot(snapshot) && proof?.snapshot === snapshot
    && proof.preflight === preflight && proof.policy === policy;
}

function certified(
  value: ReconciledReviewVerification,
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight,
  policy: ResolvedReviewPolicy,
): ReconciledReviewVerification {
  const frozen = deepFreeze(value);
  CERTIFIED_RECONCILIATIONS.set(frozen, Object.freeze({ snapshot, preflight, policy }));
  return frozen;
}

function evidenceKey(kind: string, digest: string): string { return `${kind}\0${digest}`; }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Readonly<Record<string, unknown>>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function emptyVerification(integrityIssues: readonly string[]): ReconciledReviewVerification {
  return {
    results: {}, confirmedProposalIds: [], rejectedProposalIds: [],
    insufficientProposalIds: [], integrityIssues,
  };
}

function requestBindingIssues(
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight,
  policy: ResolvedReviewPolicy,
): string[] {
  const issues: string[] = [];
  if (!isReviewBundleSnapshot(snapshot)) issues.push('semantic verifier bundle snapshot is not certified');
  if (!isCertifiedReviewProposalPreflight(preflight, snapshot.bundle, policy)) {
    issues.push('semantic verifier preflight is not certified for the bundle snapshot');
  }
  return issues;
}

function responseBindingIssues(
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight,
  policy: ResolvedReviewPolicy,
  output: Extract<ParsedEchoReviewVerificationOutput, { readonly ok: true }>['value'],
): string[] {
  const issues: string[] = [];
  if (output.bundleDigest !== snapshot.digest) issues.push('semantic verifier bundle digest does not match request');
  if (output.policyDigest !== policy.digest) issues.push('semantic verifier policy digest does not match request');
  if (output.proposalSetDigest !== preflight.proposalSetDigest) {
    issues.push('semantic verifier proposal-set digest does not match request');
  }
  return issues;
}

function resultIntegrityIssues(
  snapshot: ReviewBundleSnapshot,
  expected: readonly `sha256:${string}`[],
  results: Readonly<Record<string, EchoReviewVerificationResult>>,
): string[] {
  const actual = Object.keys(results).sort();
  const missing = expected.filter((proposalId) => !Object.hasOwn(results, proposalId));
  const unknown = actual.filter((proposalId) => !expected.includes(proposalId as `sha256:${string}`));
  const offered = offeredReviewEvidenceKeys(snapshot.bundle);
  const foreign = Object.entries(results).filter(([, result]) => (
    result.evidence.some(({ kind, digest }) => !offered.has(evidenceKey(kind, digest)))
  ));
  return [
    ...(missing.length ? [`semantic verifier omitted ${missing.length} eligible proposal(s)`] : []),
    ...(unknown.length ? [`semantic verifier returned ${unknown.length} unknown proposal(s)`] : []),
    ...foreign.map(([proposalId]) => `semantic verifier result ${proposalId} cites evidence outside the frozen bundle`),
  ];
}

export function reconcileReviewVerification(
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight,
  policy: ResolvedReviewPolicy,
  parsed: ParsedEchoReviewVerificationOutput | undefined,
): ReconciledReviewVerification {
  const integrityIssues = requestBindingIssues(snapshot, preflight, policy);
  if (!parsed?.ok) {
    integrityIssues.push(`invalid semantic verifier output: ${parsed?.error ?? 'missing response'}`);
    return certified(emptyVerification(integrityIssues), snapshot, preflight, policy);
  }
  const output = parsed.value;
  const expected = [...preflight.eligibleProposalIds].sort();
  integrityIssues.push(...responseBindingIssues(snapshot, preflight, policy, output));
  integrityIssues.push(...resultIntegrityIssues(snapshot, expected, output.results));
  if (integrityIssues.length > 0) {
    return certified(emptyVerification(integrityIssues), snapshot, preflight, policy);
  }
  const ids = (verdict: EchoReviewVerificationResult['verdict']): readonly `sha256:${string}`[] => (
    expected.filter((proposalId) => output.results[proposalId]?.verdict === verdict)
  );
  return certified({
    results: output.results,
    confirmedProposalIds: ids('confirmed'),
    rejectedProposalIds: ids('rejected'),
    insufficientProposalIds: ids('insufficient_evidence'),
    integrityIssues,
  }, snapshot, preflight, policy);
}
