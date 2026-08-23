import { sha256Text, type WaitRequest } from '@kubeclaw/plugin-sdk';

import { ECHO_REVIEW_VERIFICATION_PROTOCOL } from './echo-review-verification-contract.ts';
import type { ParsedEchoReviewOutput } from './echo-review-parser.ts';
import { SIMPLIFICATION_CANDIDATES_EVIDENCE_KIND } from './simplification-contract.ts';
import { parseSimplificationCandidateManifest } from './simplification-parser.ts';
import type { ReviewBundle } from './review-bundle-contract.ts';
import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import {
  isCertifiedReviewProposalPreflight,
  type ReviewProposalPreflight,
} from './review-proposal-preflight.ts';
import {
  certifyReviewReductionInput,
  type ReviewReductionInput,
  type ReviewSimplificationEvaluation,
  type VerifiedReviewFinding,
} from './review-reduction-state.ts';
import {
  isCertifiedReviewVerificationReconciliation,
  type ReconciledReviewVerification,
} from './review-verification-reconciliation.ts';
import { isCertifiedVerifiedReviewFindings } from './review-verified-findings.ts';
import { buildReviewFindingGovernance } from './review-finding-governance.ts';
import { offeredReviewEvidenceKeys } from './review-evidence-authority.ts';
import {
  isCertifiedReviewVerdictPolicyMapping,
  type ReviewVerdictPolicyMapping,
} from './review-verdict-policy.ts';

type EchoValue = Extract<ParsedEchoReviewOutput, { readonly ok: true }>['value'];

interface SimplificationState {
  readonly evaluation?: ReviewSimplificationEvaluation;
  readonly integrityIssues: readonly string[];
}

type CandidateEvidence = ReviewBundle['evidence'][number];

function selectedSimplificationEvidence(
  snapshot: ReviewBundleSnapshot,
  policy: ResolvedReviewPolicy,
): CandidateEvidence | SimplificationState {
  const evidence = snapshot.bundle.evidence.filter(
    ({ kind }) => kind === SIMPLIFICATION_CANDIDATES_EVIDENCE_KIND,
  );
  if (!policy.policy.simplification.enabled) {
    return evidence.length === 0
      ? { integrityIssues: [] }
      : { integrityIssues: ['disabled Simplification policy received a candidate manifest'] };
  }
  if (evidence.length !== 1) {
    return { integrityIssues: ['enabled Simplification policy requires exactly one candidate manifest'] };
  }
  const [item] = evidence;
  return item ?? { integrityIssues: ['enabled Simplification policy requires a candidate manifest'] };
}

function simplificationState(snapshot: ReviewBundleSnapshot, policy: ResolvedReviewPolicy): SimplificationState {
  const selected = selectedSimplificationEvidence(snapshot, policy);
  if ('integrityIssues' in selected) return selected;
  const item = selected;
  if (sha256Text(item.content) !== item.digest) {
    return { integrityIssues: ['Simplification candidate manifest digest is invalid'] };
  }
  let decoded: unknown;
  try { decoded = JSON.parse(item.content); } catch {
    return { integrityIssues: ['Simplification candidate manifest is not valid JSON'] };
  }
  const parsed = parseSimplificationCandidateManifest(decoded);
  if (!parsed.ok) return { integrityIssues: [`Simplification candidate manifest is invalid: ${parsed.error}`] };
  const { revision } = parsed.value;
  const expected = snapshot.bundle.revisions;
  if (revision.base !== expected.base || revision.head !== expected.head
    || revision.changedManifestDigest !== expected.changedManifestDigest) {
    return { integrityIssues: ['Simplification candidate manifest revision does not match the review bundle'] };
  }
  if (parsed.value.registryVersion !== policy.policy.simplification.registryVersion) {
    return { integrityIssues: ['Simplification candidate manifest registry does not match review policy'] };
  }
  return {
    integrityIssues: [],
    evaluation: {
      registryVersion: parsed.value.registryVersion,
      enabledRuleCount: policy.policy.simplification.enabledRules.length,
      minimumConfidence: policy.policy.simplification.minimumConfidence,
      candidateCount: parsed.value.candidates.length,
      diagnosticCount: parsed.value.diagnostics.length,
    },
  };
}

export interface ReviewVerificationBoundaryInput {
  readonly snapshot: ReviewBundleSnapshot;
  readonly parsed: ParsedEchoReviewOutput;
  readonly policy: ResolvedReviewPolicy;
  readonly preflight?: ReviewProposalPreflight;
  readonly reconciliation?: ReconciledReviewVerification;
  readonly orchestratorWait?: WaitRequest;
  readonly findings?: readonly VerifiedReviewFinding[];
  readonly verdictMapping?: ReviewVerdictPolicyMapping;
  readonly verifierAttemptId?: string;
}

function evidenceKey(kind: string, digest: string): string { return `${kind}\0${digest}`; }

function evidenceIntegrityIssues(input: ReviewBundle, output: EchoValue): string[] {
  const offered = offeredReviewEvidenceKeys(input);
  const inspected = new Set(output.inspectedEvidence.map(({ kind, digest }) => evidenceKey(kind, digest)));
  const citations = [
    ...Object.values(output.requirementAssessments).flatMap(({ evidence }) => evidence),
    ...output.proposedFindings.flatMap(({ evidence }) => evidence),
  ];
  const issues: string[] = [];
  if (output.inspectedEvidence.some(({ kind, digest }) => !offered.has(evidenceKey(kind, digest)))) {
    issues.push('Echo inspected evidence that was not supplied');
  }
  if (citations.some(({ kind, digest }) => !offered.has(evidenceKey(kind, digest)))) {
    issues.push('Echo cited evidence that was not supplied');
  }
  if (citations.some(({ kind, digest }) => !inspected.has(evidenceKey(kind, digest)))) {
    issues.push('Echo cited evidence that it did not inspect');
  }
  return issues;
}

function requirementState(bundle: ReviewBundle, output: EchoValue) {
  const declared = bundle.requirements.map(({ id }) => id);
  const assessed = Object.keys(output.requirementAssessments);
  const integrity = declared.length === assessed.length && declared.every((id) => assessed.includes(id))
    ? [] : ['Echo requirement assessments do not match the declared requirement set'];
  if (Object.values(output.requirementAssessments).some(({ assessment }) => assessment === 'violated')
    && output.proposedFindings.length === 0) {
    integrity.push('Echo reported a violated requirement without a proposed finding');
  }
  return {
    integrity,
    unverified: declared.filter((id) => output.requirementAssessments[id]?.assessment === 'unverified'),
  };
}

function absentPreflightState(output: EchoValue, policy: ResolvedReviewPolicy) {
  const overLimit = output.proposedFindings.length > policy.policy.limits.maxProposals;
  const unverified = !overLimit && output.proposedFindings.length > 0;
  return {
    integrity: unverified ? ['Echo findings require semantic verification before reduction'] : [],
    limits: overLimit ? [`proposed finding count ${output.proposedFindings.length} exceeds policy limit`] : [],
    mappingCertified: false,
  };
}

function mappingIsCertified(values: ReviewVerificationBoundaryInput): boolean {
  return Boolean(values.reconciliation && isCertifiedReviewVerdictPolicyMapping(
    values.verdictMapping, values.reconciliation, values.policy,
  ));
}

function missingVerificationIssues(values: ReviewVerificationBoundaryInput): string[] {
  const preflightReady = values.preflight?.eligibleProposalIds.length
    && values.preflight.integrityIssues.length === 0
    && values.preflight.limitViolations.length === 0;
  return preflightReady && !values.reconciliation
    ? ['Echo findings require semantic verification before reduction'] : [];
}

function missingMappingIssues(values: ReviewVerificationBoundaryInput, mappingCertified: boolean): string[] {
  const reconciliation = values.reconciliation;
  if (!reconciliation || reconciliation.integrityIssues.length > 0 || mappingCertified) return [];
  const verdictCount = reconciliation.confirmedProposalIds.length
    + reconciliation.insufficientProposalIds.length;
  return verdictCount > 0 ? ['semantic verifier verdicts lack certified policy mapping'] : [];
}

function preflightIntegrity(values: ReviewVerificationBoundaryInput, mappingCertified: boolean): string[] {
  const { preflight, reconciliation } = values;
  if (!preflight) return [];
  return [
    ...preflight.integrityIssues,
    ...missingVerificationIssues(values),
    ...(reconciliation?.integrityIssues ?? []),
    ...missingMappingIssues(values, mappingCertified),
  ];
}

function proposalState(values: ReviewVerificationBoundaryInput, output: EchoValue) {
  if (!values.preflight) return absentPreflightState(output, values.policy);
  if (!isCertifiedReviewProposalPreflight(values.preflight, values.snapshot.bundle, values.policy)) {
    return {
      integrity: ['semantic verifier preflight is not certified for the bundle snapshot'],
      limits: [],
      mappingCertified: false,
    };
  }
  const requiresReconciliation = values.preflight.eligibleProposalIds.length > 0
    && values.preflight.integrityIssues.length === 0
    && values.preflight.limitViolations.length === 0;
  if (requiresReconciliation && (!values.reconciliation
    || !isCertifiedReviewVerificationReconciliation(
      values.reconciliation, values.snapshot, values.preflight, values.policy,
    ))) {
    return {
      integrity: ['semantic verifier reconciliation is not certified for the proposal preflight'],
      limits: values.preflight.limitViolations,
      mappingCertified: false,
    };
  }
  const mappingCertified = mappingIsCertified(values);
  return {
    integrity: preflightIntegrity(values, mappingCertified),
    limits: values.preflight.limitViolations,
    mappingCertified,
  };
}

function certifiedFindings(values: ReviewVerificationBoundaryInput, integrity: string[]) {
  const findings = values.findings ?? [];
  const certified = Boolean(values.preflight && values.reconciliation
    && isCertifiedVerifiedReviewFindings(
      findings, values.snapshot, values.preflight, values.reconciliation, values.policy,
    ));
  if (values.reconciliation?.confirmedProposalIds.length && !certified) {
    integrity.push('verified finding set is not certified by confirmed proposal reconciliation');
  }
  return certified ? findings : [];
}

function verificationFacts(values: ReviewVerificationBoundaryInput) {
  const { preflight, reconciliation, verifierAttemptId, policy } = values;
  if (!preflight || !reconciliation || reconciliation.integrityIssues.length > 0 || !verifierAttemptId) return {};
  return { verification: {
    protocol: ECHO_REVIEW_VERIFICATION_PROTOCOL,
    mode: policy.policy.verification.semanticVerifier,
    attemptId: verifierAttemptId,
    eligibleCount: preflight.eligibleProposalIds.length,
    confirmedCount: reconciliation.confirmedProposalIds.length,
    rejectedCount: reconciliation.rejectedProposalIds.length,
    insufficientCount: reconciliation.insufficientProposalIds.length,
  } } as const;
}

function invalidEchoReduction(
  values: ReviewVerificationBoundaryInput,
  simplification: SimplificationState,
): ReviewReductionInput {
  if (values.parsed.ok) throw new Error('invalid Echo reduction requires a parse failure');
  return certifyReviewReductionInput({
    resolvedPolicy: values.policy,
    integrityIssues: [`invalid Echo output: ${values.parsed.error}`, ...simplification.integrityIssues],
    unverifiedRequirements: [], limitViolations: [], findings: [],
    orchestratorWait: values.orchestratorWait,
    ...(simplification.evaluation === undefined ? {} : { simplification: simplification.evaluation }),
  });
}

function findingGovernance(
  values: ReviewVerificationBoundaryInput,
  findings: readonly VerifiedReviewFinding[],
) {
  const { preflight, reconciliation, snapshot, policy } = values;
  if (!preflight || !reconciliation) return undefined;
  if (!isCertifiedVerifiedReviewFindings(findings, snapshot, preflight, reconciliation, policy)) {
    return undefined;
  }
  return buildReviewFindingGovernance(snapshot, preflight, reconciliation, findings, policy);
}

function verifiedEchoReduction(
  values: ReviewVerificationBoundaryInput,
  simplification: SimplificationState,
): ReviewReductionInput {
  if (!values.parsed.ok) throw new Error('verified Echo reduction requires parsed output');
  const { snapshot, policy, reconciliation, verdictMapping, orchestratorWait } = values;
  const requirements = requirementState(snapshot.bundle, values.parsed.value);
  const proposals = proposalState(values, values.parsed.value);
  const integrity = [
    ...simplification.integrityIssues,
    ...evidenceIntegrityIssues(snapshot.bundle, values.parsed.value),
    ...requirements.integrity,
    ...proposals.integrity,
  ];
  const findings = certifiedFindings(values, integrity);
  const governance = findingGovernance(values, findings);
  const mapping = proposals.mappingCertified && verdictMapping ? verdictMapping : undefined;
  return certifyReviewReductionInput({
    resolvedPolicy: policy, integrityIssues: integrity,
    unverifiedRequirements: requirements.unverified, limitViolations: proposals.limits, findings,
    followUpProposalIds: mapping?.followUpProposalIds ?? [],
    orchestratorProposalIds: mapping?.orchestratorProposalIds ?? [],
    ...verificationFacts(values), orchestratorWait,
    ...(simplification.evaluation === undefined ? {} : { simplification: simplification.evaluation }),
    ...(governance === undefined ? {} : { governance }),
  });
}

export function verifyEchoReviewForReduction(values: ReviewVerificationBoundaryInput): ReviewReductionInput {
  const simplification = simplificationState(values.snapshot, values.policy);
  return values.parsed.ok
    ? verifiedEchoReduction(values, simplification)
    : invalidEchoReduction(values, simplification);
}
