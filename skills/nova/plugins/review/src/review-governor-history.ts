import type { ArtifactRef, PluginInvocationContext } from '@kubeclaw/plugin-sdk';

import { isReviewReport, type ReviewReport } from './review-report-contract.ts';
import type { ReviewGovernorBaseline } from './review-governor.ts';
import { ReviewGovernorIntegrityError } from './review-governor.ts';
import { compareCodeUnits } from './review-ordering.ts';

function priorReportArtifacts(context: PluginInvocationContext): readonly ArtifactRef[] {
  const attempt = context.contract.lease.attempt;
  return context.contract.artifacts.filter((artifact) => (
    artifact.namespace === 'kubeclaw.review'
    && artifact.mediaType === 'application/json'
    && artifact.artifactId.startsWith('review-report:')
    && artifact.producer.runId === attempt.runId
    && artifact.producer.stageId === attempt.stageId
    && artifact.producer.attemptNumber < attempt.attemptNumber
  )).sort((left, right) => (
    right.producer.attemptNumber - left.producer.attemptNumber
    || compareCodeUnits(right.artifactId, left.artifactId)
  ));
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReviewGovernorIntegrityError('prior review report response is invalid');
  }
  return value as Readonly<Record<string, unknown>>;
}

async function readReport(artifact: ArtifactRef, context: PluginInvocationContext): Promise<ReviewReport> {
  let raw: unknown;
  try {
    raw = await context.invoke('artifacts.read', {
      operation: 'get_json', resource: { type: 'artifact.object', canonicalId: artifact.artifactId },
      payload: { namespace: artifact.namespace, digest: artifact.digest },
    });
  } catch (error) {
    throw new ReviewGovernorIntegrityError(
      `review governor history artifact could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const response = record(raw);
  if (response.digest !== artifact.digest || response.sizeBytes !== artifact.sizeBytes
    || !isReviewReport(response.value)) throw new ReviewGovernorIntegrityError('prior review report failed immutable reference validation');
  const report = response.value;
  if (report.attemptId !== artifact.producer.attemptId) {
    throw new ReviewGovernorIntegrityError('prior review report producer does not match its report identity');
  }
  return report;
}

export async function readReviewGovernorBaseline(context: PluginInvocationContext): Promise<ReviewGovernorBaseline | undefined> {
  const lifecycle = context.contract.stageLifecycle;
  if (!lifecycle) throw new ReviewGovernorIntegrityError('review governor requires core-certified stage lifecycle state');
  const candidates = priorReportArtifacts(context);
  if (candidates.length === 0) {
    if (lifecycle.remediationCyclesUsed > 0) {
      throw new ReviewGovernorIntegrityError('remediated review attempt has no certified governor baseline');
    }
    return undefined;
  }
  const report = await readReport(candidates[0] as ArtifactRef, context);
  return report.governor.baseline;
}
