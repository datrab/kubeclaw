import type { DecisionFacts } from '@kubeclaw/plugin-sdk';

import { ECHO_REVIEW_SCHEMA_VERSION } from './echo-review-contract.ts';
import { REVIEW_POLICY_SCHEMA_VERSION } from './review-policy-contract.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';
import type {
  ReviewSimplificationEvaluation,
  ReviewVerificationEvaluation,
} from './review-reduction-state.ts';

export const REVIEW_DECISION_MODEL_VERSION = 'review-decision.v1' as const;

export interface ReviewEvaluationCounts {
  readonly findingCount: number;
  readonly followUpCount: number;
  readonly integrityIssueCount: number;
  readonly unverifiedRequirementCount: number;
  readonly limitViolationCount: number;
}

export interface ReviewGovernanceEvaluation {
  readonly rootCauseCount: number;
  readonly sharedRootCauseCount: number;
  readonly rankedFindingCount: number;
}

function simplificationFacts(simplification: ReviewSimplificationEvaluation | undefined): DecisionFacts {
  return simplification === undefined ? {} : {
    'review.simplification_candidate_count': simplification.candidateCount,
    'review.simplification_diagnostic_count': simplification.diagnosticCount,
  };
}

function verifierFacts(verification: ReviewVerificationEvaluation | undefined): DecisionFacts {
  return verification === undefined ? {} : {
    'review.verifier_protocol': verification.protocol,
    'review.verifier_mode': verification.mode,
    'review.verifier_attempt': verification.attemptId,
    'review.verifier_eligible_count': verification.eligibleCount,
    'review.verifier_confirmed_count': verification.confirmedCount,
    'review.verifier_rejected_count': verification.rejectedCount,
    'review.verifier_insufficient_count': verification.insufficientCount,
  };
}

function governanceFacts(governance: ReviewGovernanceEvaluation | undefined): DecisionFacts {
  return governance === undefined ? {} : {
    'review.root_cause_count': governance.rootCauseCount,
    'review.shared_root_cause_count': governance.sharedRootCauseCount,
    'review.ranked_finding_count': governance.rankedFindingCount,
  };
}

export function buildReviewEvaluationFacts(
  resolved: ResolvedReviewPolicy,
  counts: ReviewEvaluationCounts,
  verification?: ReviewVerificationEvaluation,
  simplification?: ReviewSimplificationEvaluation,
  governance?: ReviewGovernanceEvaluation,
): DecisionFacts {
  return {
    'review.decision_model': REVIEW_DECISION_MODEL_VERSION,
    'review.output_schema': ECHO_REVIEW_SCHEMA_VERSION,
    'review.policy_schema': REVIEW_POLICY_SCHEMA_VERSION,
    'review.policy_digest': resolved.digest,
    'review.policy_profile': resolved.policy.profile,
    'review.policy_source': resolved.selectedSource,
    'review.simplification_registry': resolved.policy.simplification.registryVersion,
    'review.semantic_verifier': resolved.policy.verification.semanticVerifier,
    'review.finding_count': counts.findingCount,
    'review.follow_up_count': counts.followUpCount,
    'review.integrity_issue_count': counts.integrityIssueCount,
    'review.unverified_requirement_count': counts.unverifiedRequirementCount,
    'review.limit_violation_count': counts.limitViolationCount,
    'review.simplification_enabled': resolved.policy.simplification.enabled,
    'review.simplification_enabled_rule_count': resolved.policy.simplification.enabledRules.length,
    'review.simplification_minimum_confidence': resolved.policy.simplification.minimumConfidence,
    ...simplificationFacts(simplification),
    ...verifierFacts(verification),
    ...governanceFacts(governance),
  };
}
