import { remotePlanDigest } from './digest.ts';
import { coverageCheckStatuses, coverageNodeMatches, gateCoverageErrors, type CoverageCheckStatusV1, type GateCoverageV1 } from './coverage.ts';
import type { RemotePlanJobV1 } from './types.ts';

export interface GateCoverageResultV1 {
  readonly schemaVersion: 'gate-coverage-result.v1';
  readonly policy: GateCoverageV1;
  readonly planDigest: string;
  readonly pipelineStageId: string;
  readonly sourceRevision: string;
  readonly sourceTree: string;
  readonly archiveContentDigest: string;
  readonly checks: readonly CoverageCheckStatusV1[];
  readonly coverageDigest: string;
}

/** Only the verified job supplies candidate authority; no caller-owned summary or counts. */
export function bindGateCoverage(job: RemotePlanJobV1,
  outcomes: readonly { readonly nodeId: string; readonly effect: string }[]): GateCoverageResultV1 | undefined {
  if (!job.plan.coverage) return undefined;
  const snapshot = job.sourceSnapshot;
  const unsigned = { schemaVersion: 'gate-coverage-result.v1' as const,
    policy: job.plan.coverage.policy, planDigest: job.plan.planDigest, pipelineStageId: job.pipelineStageId,
    sourceRevision: snapshot.revision, sourceTree: snapshot.tree, archiveContentDigest: snapshot.archiveContentDigest,
    checks: coverageCheckStatuses(job.plan, new Map(outcomes.map(node => [node.nodeId, node]))),
  };
  return { ...unsigned, coverageDigest: remotePlanDigest(unsigned) };
}

export function gateCoverageResultErrors(result: GateCoverageResultV1): string[] {
  const errors = gateCoverageErrors(result.policy);
  const { coverageDigest, ...unsigned } = result;
  if (remotePlanDigest(unsigned) !== coverageDigest) errors.push('COVERAGE_RESULT_DIGEST_MISMATCH');
  const declared = new Set(result.policy.requiredChecks.flatMap(check =>
    check.nodeIds.map(id => JSON.stringify([check.checkId, id]))));
  const observed = new Set<string>();
  const identities = new Set<string>();
  for (const check of result.checks) {
    const declaration = JSON.stringify([check.checkId, check.declarationId]);
    const identity = JSON.stringify([check.checkId, check.declarationId, check.nodeId]);
    if (!declared.has(declaration) || identities.has(identity)) errors.push('COVERAGE_RESULT_CHECK_INVALID');
    if (check.nodeId === null && !['excluded', 'missing'].includes(check.state)) errors.push('COVERAGE_RESULT_NODE_REQUIRED');
    if (check.nodeId !== null && !coverageNodeMatches(check.declarationId, check.nodeId)) errors.push('COVERAGE_RESULT_NODE_MISMATCH');
    identities.add(identity);
    observed.add(declaration);
  }
  for (const declaration of declared) if (!observed.has(declaration)) errors.push('COVERAGE_RESULT_CHECK_MISSING');
  return errors;
}

export function coveragePassed(result: GateCoverageResultV1): boolean {
  return result.checks.length > 0 && result.checks.every(check => check.state === 'passed');
}
