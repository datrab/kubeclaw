import type { StageResult } from '@kubeclaw/plugin-sdk';

import type { ReviewPolicy } from './review-policy-contract.ts';
import { buildReviewEvaluationFacts } from './review-evaluation-metadata.ts';
import {
  isResolvedReviewPolicy,
} from './review-policy-resolver.ts';
import {
  isCertifiedReviewReductionInput,
  isCertifiedReductionPolicy,
  validReviewWait,
  type ReviewReductionInput,
  type VerifiedReviewFinding,
} from './review-reduction-state.ts';
import { buildReviewRepairBatch } from './review-repair-batch.ts';

export type ReviewFindingAction = 'ignore' | 'follow_up' | 'block' | 'orchestrator_required';

function evidenceAction(finding: VerifiedReviewFinding, policy: ReviewPolicy): ReviewFindingAction | undefined {
  if (!policy.blocking.requireDirectEvidence || finding.evidenceStrength === 'direct') return undefined;
  const action = policy.verification.insufficientFindingEvidence;
  if (action === 'reject') return 'ignore';
  return action === 'follow_up' ? 'follow_up' : 'orchestrator_required';
}

function scopeAction(finding: VerifiedReviewFinding, policy: ReviewPolicy): ReviewFindingAction | undefined {
  if (finding.scopeRelation === 'inside') return undefined;
  if (finding.scopeRelation === 'outside') return policy.scope.outsideScope;
  const action = policy.scope.unknownScope;
  return action === 'blocked' ? 'block' : action;
}

export function classifyVerifiedReviewFinding(
  finding: VerifiedReviewFinding, policy: ReviewPolicy,
): ReviewFindingAction {
  if (!policy.blocking.priorities.includes(finding.priority)) return 'follow_up';
  if (!policy.blocking.categories.includes(finding.category)) return 'follow_up';
  if (!policy.scope.retainPreExisting && finding.changeRelation === 'pre_existing') return 'ignore';
  if (policy.blocking.requireIntroducedByDiff && finding.changeRelation !== 'introduced') {
    return 'follow_up';
  }
  const evidence = evidenceAction(finding, policy);
  if (evidence) return evidence;
  const scope = scopeAction(finding, policy);
  if (scope) return scope;
  return finding.repairable ? 'block' : 'orchestrator_required';
}

const findingAction = classifyVerifiedReviewFinding;

function reasonResult(
  outcome: 'blocked' | 'request_fix',
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>>,
): StageResult {
  return {
    schemaVersion: 'stage-result.v2', outcome,
    reason: { code, message, details },
    artifacts: [],
  };
}

function countFollowUps(input: ReviewReductionInput): number {
  return (input.followUpProposalIds?.length ?? 0) + input.findings.filter((finding) => (
    findingAction(finding, input.resolvedPolicy.policy) === 'follow_up'
  )).length;
}

function governanceEvaluation(input: ReviewReductionInput): Readonly<{
  rootCauseCount: number;
  sharedRootCauseCount: number;
  rankedFindingCount: number;
}> | undefined {
  if (!input.governance) return undefined;
  return {
    rootCauseCount: input.governance.clusters.length,
    sharedRootCauseCount: input.governance.clusters.filter(({ findings }) => findings.length > 1).length,
    rankedFindingCount: input.governance.ranked.reduce((total, { findings }) => total + findings.length, 0),
  };
}

function evaluationDetails(
  input: ReviewReductionInput,
  details: Readonly<Record<string, unknown>>,
  followUpCount = countFollowUps(input),
): Readonly<Record<string, unknown>> {
  return {
    policyDigest: input.resolvedPolicy.digest,
    ...details,
    evaluation: buildReviewEvaluationFacts(input.resolvedPolicy, {
      findingCount: input.findings.length,
      followUpCount,
      integrityIssueCount: input.integrityIssues.length,
      unverifiedRequirementCount: input.unverifiedRequirements.length,
      limitViolationCount: input.limitViolations.length,
    }, input.verification, input.simplification, governanceEvaluation(input)),
  };
}

function orchestratorResult(
  input: ReviewReductionInput,
  reasons: readonly string[],
): StageResult {
  if (!validReviewWait(input.orchestratorWait)) {
    return reasonResult(
      'blocked',
      'kubeclaw.review.missing_orchestrator_wait',
      'Review requires orchestration, but no valid orchestrator wait was supplied.',
      evaluationDetails(input, { reasons: [...reasons] }),
    );
  }
  return {
    schemaVersion: 'stage-result.v2',
    outcome: 'orchestrator_required',
    reason: {
      code: 'kubeclaw.review.orchestrator_required',
      message: 'Review requires a broader policy or scope decision.',
      details: evaluationDetails(input, { reasons: [...reasons] }),
    },
    artifacts: [],
    wait: input.orchestratorWait,
  };
}

function findingDetail(finding: VerifiedReviewFinding): Readonly<Record<string, unknown>> {
  return {
    fingerprint: finding.fingerprint,
    priority: finding.priority,
    category: finding.category,
    message: finding.message,
    recommendedFix: finding.recommendedFix,
  };
}

function repairBatchDetails(
  input: ReviewReductionInput,
  blockers: readonly VerifiedReviewFinding[],
): Readonly<Record<string, unknown>> | undefined {
  const governance = input.governance;
  if (!governance) return undefined;
  const batch = buildReviewRepairBatch(
    governance.ranked, governance.clusters, input.resolvedPolicy, blockers,
  );
  const byFingerprint = new Map(blockers.map((finding) => [finding.fingerprint, finding]));
  return {
    totalRootCauseCount: batch.totalRootCauseCount,
    omittedRootCauseCount: batch.omittedRootCauseCount,
    totalFindingCount: batch.totalFindingCount,
    omittedFindingCount: batch.omittedFindingCount,
    rootCauses: batch.clusters.map((cluster) => ({
      clusterId: cluster.clusterId,
      score: cluster.score,
      totalInstanceCount: cluster.totalInstanceCount,
      omittedInstanceCount: cluster.omittedInstanceCount,
      instances: cluster.findingFingerprints.flatMap((fingerprint) => {
        const finding = byFingerprint.get(fingerprint);
        return finding ? [findingDetail(finding)] : [];
      }),
    })),
  };
}

function invalidPolicyResult(input: ReviewReductionInput): StageResult | undefined {
  const { policy, digest } = input.resolvedPolicy;
  const invalid = (
    !isResolvedReviewPolicy(input.resolvedPolicy)
    || !Object.isFrozen(input.resolvedPolicy)
    || !Object.isFrozen(policy)
    || !isCertifiedReductionPolicy(input)
  );
  return invalid ? reasonResult(
      'blocked',
      'kubeclaw.review.invalid_policy_snapshot',
      'Review policy snapshot is mutable or does not match its digest.',
      evaluationDetails(input, { policyDigest: digest }),
    ) : undefined;
}

function requirementResult(input: ReviewReductionInput): StageResult | undefined {
  if (input.unverifiedRequirements.length === 0) return undefined;
  if (input.resolvedPolicy.policy.verification.unverifiedRequirement === 'orchestrator_required') {
    return orchestratorResult(input, input.unverifiedRequirements);
  }
  return reasonResult(
    'blocked', 'kubeclaw.review.requirements_unverified',
    'One or more required requirements could not be verified.',
    evaluationDetails(input, { requirementIds: [...input.unverifiedRequirements] }),
  );
}

function preflightResult(input: ReviewReductionInput): StageResult | undefined {
  const policyFailure = invalidPolicyResult(input);
  if (policyFailure) return policyFailure;
  if (input.integrityIssues.length > 0) {
    return reasonResult(
      'blocked',
      'kubeclaw.review.untrusted_state',
      'Review state is invalid or incomplete.',
      evaluationDetails(input, { issues: [...input.integrityIssues] }),
    );
  }
  const requirementFailure = requirementResult(input);
  if (requirementFailure) return requirementFailure;
  if (input.limitViolations.length > 0) return orchestratorResult(input, input.limitViolations);
  if ((input.orchestratorProposalIds?.length ?? 0) > 0) {
    return orchestratorResult(input, input.orchestratorProposalIds ?? []);
  }
  return undefined;
}

function blockerResult(
  input: ReviewReductionInput,
  blockers: readonly VerifiedReviewFinding[],
  followUpCount: number,
): StageResult | undefined {
  if (blockers.length === 0) return undefined;
  const batch = repairBatchDetails(input, blockers);
  const details = evaluationDetails(input, batch
    ? { repairBatch: batch }
    : { findings: blockers.map(findingDetail) }, followUpCount);
  if (blockers.some((finding) => finding.scopeRelation === 'unknown')) {
    return reasonResult(
      'blocked', 'kubeclaw.review.scope_unknown',
      'A blocking finding has unknown scope.', details,
    );
  }
  return reasonResult(
    'request_fix', 'kubeclaw.review.verified_blockers',
    'Verified in-scope blockers require repair.', details,
  );
}

function reduceFindingActions(input: ReviewReductionInput): StageResult {
  const { policy } = input.resolvedPolicy;
  const actions = input.findings.map((finding) => ({ finding, action: findingAction(finding, policy) }));
  const needsOrchestrator = actions.filter(({ action }) => action === 'orchestrator_required');
  if (needsOrchestrator.length > 0) {
    return orchestratorResult(input, needsOrchestrator.map(({ finding }) => finding.fingerprint));
  }
  const blockers = actions
    .filter(({ action }) => action === 'block')
    .map(({ finding }) => finding);
  const followUpCount = (input.followUpProposalIds?.length ?? 0)
    + actions.filter(({ action }) => action === 'follow_up').length;
  const blocking = blockerResult(input, blockers, followUpCount);
  if (blocking) return blocking;
  return {
    schemaVersion: 'stage-result.v2',
    outcome: 'passed',
    artifacts: [],
    facts: buildReviewEvaluationFacts(input.resolvedPolicy, {
      findingCount: input.findings.length,
      followUpCount,
      integrityIssueCount: 0,
      unverifiedRequirementCount: 0,
      limitViolationCount: 0,
    }, input.verification, input.simplification, governanceEvaluation(input)),
  };
}

export function reduceReviewDecision(value: unknown): StageResult {
  if (!isCertifiedReviewReductionInput(value)) {
    return reasonResult(
      'blocked',
      'kubeclaw.review.invalid_reduction_input',
      'Review reduction input is malformed or incomplete.',
      {},
    );
  }
  const input = value;
  return preflightResult(input) ?? reduceFindingActions(input);
}
