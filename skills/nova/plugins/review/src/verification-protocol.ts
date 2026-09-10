import type { AttemptIdentity } from '@kubeclaw/plugin-sdk';

import {
  ECHO_REVIEW_VERIFICATION_PROTOCOL,
  echoReviewVerificationOutputSchema,
  type EchoReviewVerificationRequest,
} from './echo-review-verification-contract.ts';
import type { ProposedFinding } from './echo-review-contract.ts';
import type { ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import type { ReviewProposalPreflight } from './review-proposal-preflight.ts';
import { assertReviewPolicyBundle, type ResolvedReviewPolicy } from './review-policy-resolver.ts';
import { REVIEWED_SOURCE_EVIDENCE_KIND } from './review-evidence-authority.ts';

function verificationTask(
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight,
): string {
  return [
    '# KubeClaw semantic verification protocol v1', '',
    'Independently check only the supplied Echo proposals against the frozen review bundle.',
    'Do not search for new findings. Do not rewrite, merge, reprioritize, or reclassify a proposal.',
    'For every supplied proposal ID, return exactly one verdict: confirmed, rejected, or insufficient_evidence.',
    'A confirmed verdict confirms the complete proposal, including rootCauseHint when it is present.',
    'Confirm a deterministic source-backed contradiction when the cited code directly violates the stated identity, authority, contract, or lifecycle invariant. Runtime reproduction is not required for such a contradiction.',
    'Use insufficient_evidence only when the frozen bundle lacks the code or contract needed to decide the claim.',
    'Reject only when supplied immutable evidence directly disproves the proposal. Name that counter-evidence and the exact part of the claim it disproves in the reason.',
    'Do not reject merely because tests pass, runtime reproduction is absent, or the proposed impact is not demonstrated by an execution trace.',
    'Reject a proposal when its rootCauseHint claims a different root cause than the supplied evidence supports.',
    'Cite only immutable evidence references from the supplied bundle.',
    `A reviewed source context item is immutable evidence. Cite it as kind ${REVIEWED_SOURCE_EVIDENCE_KIND} with that item's digest.`,
    'Do not return PASS, FAIL, request_fix, or any pipeline outcome.',
    'Do not request more context and do not inspect repository material outside this request.', '',
    `Bundle digest: ${snapshot.digest}`,
    `Proposal-set digest: ${preflight.proposalSetDigest}`, '',
    'Return raw JSON matching outputContract exactly. Unknown fields are forbidden.',
  ].join('\n');
}

export function buildVerificationDispatchRequest(
  agent: string,
  identity: AttemptIdentity,
  snapshot: ReviewBundleSnapshot,
  preflight: ReviewProposalPreflight,
  policy: ResolvedReviewPolicy,
): EchoReviewVerificationRequest {
  assertReviewPolicyBundle(policy, snapshot.bundle);
  const proposals: Record<string, ProposedFinding> = {};
  for (const proposalId of preflight.eligibleProposalIds) {
    const proposal = preflight.proposals[proposalId];
    if (!proposal) throw new Error(`eligible proposal ${proposalId} is missing from preflight`);
    proposals[proposalId] = proposal.finding;
  }
  return {
    protocol: ECHO_REVIEW_VERIFICATION_PROTOCOL,
    agent,
    role: 'semantic-verifier',
    identity: {
      runId: identity.runId,
      stageId: identity.stageId,
      attemptId: identity.attemptId,
      attemptNumber: identity.attemptNumber,
    },
    task: verificationTask(snapshot, preflight),
    verification: {
      bundle: snapshot.bundle,
      bundleDigest: snapshot.digest,
      policyDigest: policy.digest,
      proposalSetDigest: preflight.proposalSetDigest,
      proposals,
    },
    outputContract: echoReviewVerificationOutputSchema,
  };
}
