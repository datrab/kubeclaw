import { portableJson, PORTABLE_JSON_ENCODING, verifiedArtifactJsonText,
  type ArtifactRef, type PluginInvocationContext } from '@kubeclaw/plugin-sdk';
import { assertReviewSemanticEncoding, PORTABLE_REVIEW_REPORT_VERSION,
  type ReviewSemanticEncoding } from './review-semantics.ts';

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

async function readReport(artifact: ArtifactRef, context: PluginInvocationContext,
  semanticEncoding?: ReviewSemanticEncoding): Promise<ReviewReport> {
  let raw: unknown;
  try {
    raw = semanticEncoding === undefined ? await context.invoke('artifacts.read', {
      operation: 'get_json', resource: { type: 'artifact.object', canonicalId: artifact.artifactId },
      payload: { namespace: artifact.namespace, digest: artifact.digest },
    }) : await context.invoke('artifacts.read', {
      operation: 'get_json_bytes', resource: { type: 'artifact.object', canonicalId: artifact.artifactId },
      payload: { namespace: artifact.namespace, digest: artifact.digest, reference: artifact },
    });
  } catch (error) {
    throw new ReviewGovernorIntegrityError(
      `review governor history artifact could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  portableJson(raw);
  const response = record(raw);
  if (semanticEncoding !== undefined) {
    if (artifact.encoding !== PORTABLE_JSON_ENCODING) throw new ReviewGovernorIntegrityError('prior semantic report encoding is invalid');
    verifiedArtifactJsonText(response, artifact);
  }
  if (response.digest !== artifact.digest || response.sizeBytes !== artifact.sizeBytes
    || !isReviewReport(response.value)) throw new ReviewGovernorIntegrityError('prior review report failed immutable reference validation');
  const report = response.value;
  const expectedVersion = semanticEncoding === undefined ? 'review-report.v2' : PORTABLE_REVIEW_REPORT_VERSION;
  if (report.schemaVersion !== expectedVersion) throw new ReviewGovernorIntegrityError('prior review report semantic mode mismatch');
  if (report.attemptId !== artifact.producer.attemptId) {
    throw new ReviewGovernorIntegrityError('prior review report producer does not match its report identity');
  }
  return report;
}

export async function readReviewGovernorBaseline(context: PluginInvocationContext,
  semanticEncoding?: ReviewSemanticEncoding): Promise<ReviewGovernorBaseline | undefined> {
  assertReviewSemanticEncoding(semanticEncoding);
  const lifecycle = context.contract.stageLifecycle;
  if (!lifecycle) throw new ReviewGovernorIntegrityError('review governor requires core-certified stage lifecycle state');
  const candidates = priorReportArtifacts(context);
  if (candidates.length === 0) {
    if (lifecycle.remediationCyclesUsed > 0) {
      throw new ReviewGovernorIntegrityError('remediated review attempt has no certified governor baseline');
    }
    return undefined;
  }
  const report = await readReport(candidates[0] as ArtifactRef, context, semanticEncoding);
  return report.governor.baseline;
}
