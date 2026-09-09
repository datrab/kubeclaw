import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { coverageReviewPrefixes, coverageReviewRequirements, validatePipelineTestGateContract,
  type GateCoverageV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { ReviewStageInput } from './review-stage-input.ts';

export function assertReviewCoverage(input: ReviewStageInput): void {
  const evidence = input.evidence.filter(item => item.kind === 'gate-coverage');
  if (!evidence.length) return;
  if (evidence.length !== 1) throw new Error('REVIEW_COVERAGE_AMBIGUOUS');
  const item = evidence[0]!;
  const parsed: unknown = JSON.parse(item.content);
  validatePipelineTestGateContract('gateCoverage', parsed);
  const coverage = parsed as GateCoverageV1;
  if (item.digest !== sha256Text(canonicalJson(coverage))) throw new Error('REVIEW_COVERAGE_DIGEST_MISMATCH');
  if (coverage.kind === 'cumulative' && input.revisions.base !== coverage.baseRevision) throw new Error('REVIEW_COVERAGE_BASE_MISMATCH');
  if (canonicalJson(input.requirements) !== canonicalJson(coverageReviewRequirements(coverage))
    || canonicalJson(input.scope.allowedPrefixes) !== canonicalJson(coverageReviewPrefixes(coverage))) throw new Error('REVIEW_COVERAGE_SCOPE_MISMATCH');
}
