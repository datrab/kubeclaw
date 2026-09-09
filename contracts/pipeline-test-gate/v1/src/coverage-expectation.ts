import { validatePipelineTestGateContract } from './validation.ts';
import { resolvedTestPlanDigest } from './remote.ts';
import { remotePlanDigest } from './digest.ts';
import { coverageCheckStatuses, type GateCoverageV1 } from './coverage.ts';
import type { GateDecisionV1 } from './gate-decision.ts';
import type { ResolvedTestPlanV1 } from './types.ts';

export function assertCoveragePlan(plan: ResolvedTestPlanV1, expected: GateCoverageV1): void {
  validatePipelineTestGateContract('gateCoverage', expected);
  validatePipelineTestGateContract('resolvedTestPlan', plan);
  const { planDigest, ...unsigned } = plan;
  if (resolvedTestPlanDigest(unsigned) !== planDigest) throw new Error('COVERAGE_PLAN_DIGEST_MISMATCH');
  if (!plan.coverage || plan.coverage.policy.policyDigest !== expected.policyDigest) throw new Error('COVERAGE_EXPECTED_POLICY_MISMATCH');
}

export function assertCoverageDecision(decision: GateDecisionV1, expected: GateCoverageV1,
  sourceRevision: string, stageId: string): void {
  validatePipelineTestGateContract('gateCoverage', expected);
  const coverage = decision.coverage;
  if (!coverage || coverage.policy.policyDigest !== expected.policyDigest) throw new Error('COVERAGE_EXPECTED_POLICY_MISMATCH');
  if (coverage.sourceRevision !== `git:${sourceRevision}` || coverage.pipelineStageId !== stageId) throw new Error('COVERAGE_CANDIDATE_MISMATCH');
}

export function assertCoverageExecution(plan: ResolvedTestPlanV1, decision: GateDecisionV1,
  expected: GateCoverageV1, sourceRevision: string, stageId: string): void {
  assertCoveragePlan(plan, expected);
  assertCoverageDecision(decision, expected, sourceRevision, stageId);
  const statuses = coverageCheckStatuses(plan, new Map(decision.nodes.map(node => [node.nodeId, node])));
  if (decision.coverage!.planDigest !== plan.planDigest
    || remotePlanDigest(statuses) !== remotePlanDigest(decision.coverage!.checks)) throw new Error('COVERAGE_EXECUTION_MISMATCH');
}

export function coverageReviewRequirements(policy: GateCoverageV1) {
  return [...policy.modules.flatMap(module => module.requirements.map(requirement => ({
    id: `module:${module.moduleId}:${requirement.id}`, statement: requirement.statement,
  }))), ...policy.integrationRequirements.map(requirement => ({ id: `integration:${requirement.id}`, statement: requirement.statement }))]
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

export function coverageReviewPrefixes(policy: GateCoverageV1): string[] {
  return [...new Set(policy.modules.flatMap(module => module.ownedPaths))].sort();
}
