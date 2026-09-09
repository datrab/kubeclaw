import { preflightScalableReviewResults } from './scalable-review-verification.ts';
import type { ScalableReviewJob, ScalableReviewJobResult } from './scalable-review-jobs.ts';

export function reusableReviewResult(
  job: ScalableReviewJob, value: ScalableReviewJobResult, allowContextRequest: boolean,
): boolean {
  if (value.jobId !== job.id || value.jobDigest !== job.digest) return false;
  if (allowContextRequest && value.parsed.ok && value.parsed.value.contextRequest) return true;
  const checked = preflightScalableReviewResults([job], [value]);
  return checked.integrityIssues.length === 0 && checked.incompleteJobs.length === 0;
}
export function selectedReviewIncomplete(
  preflight: ReturnType<typeof preflightScalableReviewResults>, deferred: ReadonlySet<string>,
): boolean {
  return preflight.integrityIssues.length > 0 || preflight.incompleteJobs.some((id) => !deferred.has(id));
}
