import { isReviewBundleSnapshot, type ReviewBundleSnapshot } from './review-bundle-snapshot.ts';
import { canonicalJson, sha256Text, type ArtifactRef, type PluginInvocationContext, type StageResult } from '@kubeclaw/plugin-sdk';

import { isReviewReport, type ReviewReport, type ReviewReportDisposition } from './review-report-contract.ts';

function requiredText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/[\r\n\0]/u.test(value);
}

function validProducer(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const identity = value as Readonly<Record<string, unknown>>;
  const texts = [identity.runId, identity.stageId, identity.attemptId];
  return texts.every(requiredText)
    && Number.isSafeInteger(identity.attemptNumber) && Number(identity.attemptNumber) >= 0;
}

function validArtifact(value: Readonly<Record<string, unknown>>): boolean {
  const texts = [value.artifactId, value.namespace, value.mediaType];
  return texts.every(requiredText)
    && value.mediaType === 'application/json'
    && typeof value.digest === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value.digest)
    && Number.isSafeInteger(value.sizeBytes) && Number(value.sizeBytes) >= 0
    && validProducer(value.producer);
}

function artifactRef(value: unknown): ArtifactRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('artifact adapter returned invalid output');
  const artifact = (value as Readonly<Record<string, unknown>>).artifact;
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    throw new Error('artifact adapter returned no artifact reference');
  }
  const candidate = artifact as Readonly<Record<string, unknown>>;
  if (!validArtifact(candidate)) {
    throw new Error('artifact adapter returned malformed artifact reference');
  }
  return artifact as ArtifactRef;
}

function sameProducer(artifact: ArtifactRef, context: PluginInvocationContext): boolean {
  const attempt = context.contract.lease?.attempt;
  if (!attempt) return false;
  return [
    artifact.producer.runId === attempt.runId,
    artifact.producer.stageId === attempt.stageId,
    artifact.producer.attemptId === attempt.attemptId,
    artifact.producer.attemptNumber === attempt.attemptNumber,
  ].every(Boolean);
}

function matchesReport(
  artifact: ArtifactRef, artifactId: string, serialized: string, context: PluginInvocationContext,
): boolean {
  return [
    artifact.artifactId === artifactId,
    artifact.namespace === 'kubeclaw.review',
    artifact.digest === sha256Text(serialized),
    artifact.sizeBytes === Buffer.byteLength(serialized),
    sameProducer(artifact, context),
  ].every(Boolean);
}

export async function storeReviewReport(
  report: ReviewReport, context: PluginInvocationContext,
): Promise<ArtifactRef> {
  if (!isReviewReport(report)) throw new Error('cannot store an invalid review report');
  const serialized = canonicalJson(report);
  const identity = sha256Text(canonicalJson({ attemptId: report.attemptId, bundleDigest: report.bundleDigest }))
    .slice('sha256:'.length);
  const artifactId = `review-report:${identity}`;
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json',
    resource: { type: 'artifact.object', canonicalId: artifactId },
    payload: { namespace: 'kubeclaw.review', mediaType: 'application/json', value: report },
  });
  const artifact = artifactRef(stored);
  if (!matchesReport(artifact, artifactId, serialized, context)) {
    throw new Error('artifact adapter returned a report reference that does not match the stored report');
  }
  return artifact;
}

/** Preserve the actual immutable input selected by the review owner, bound by report.bundleDigest. */
export async function storeReviewBundle(snapshot: ReviewBundleSnapshot, context: PluginInvocationContext): Promise<ArtifactRef> {
  if (!isReviewBundleSnapshot(snapshot)) throw new Error('REVIEW_BUNDLE_SNAPSHOT_REQUIRED');
  const artifactId = `review-bundle:${snapshot.digest.slice(7)}`;
  const serialized = canonicalJson(snapshot.bundle);
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: artifactId },
    payload: { namespace: 'kubeclaw.review', mediaType: 'application/json', value: snapshot.bundle },
  });
  const artifact = artifactRef(stored);
  if (!matchesReport(artifact, artifactId, serialized, context)) throw new Error('REVIEW_BUNDLE_STORED_IDENTITY_MISMATCH');
  return artifact;
}

function dispositionCounts(report: ReviewReport): Readonly<Record<ReviewReportDisposition, number>> {
  const values = Object.values(report.items);
  return {
    blocker: values.filter(({ disposition }) => disposition === 'blocker').length + report.omitted.blocker,
    advisory: values.filter(({ disposition }) => disposition === 'advisory').length + report.omitted.advisory,
    follow_up: values.filter(({ disposition }) => disposition === 'follow_up').length + report.omitted.follow_up,
    ignored: values.filter(({ disposition }) => disposition === 'ignored').length + report.omitted.ignored,
  };
}

export function attachReviewReport(
  result: StageResult, report: ReviewReport, artifact: ArtifactRef,
): StageResult {
  const counts = dispositionCounts(report);
  const evaluation = {
    'review.report_digest': artifact.digest,
    'review.report_blocker_count': counts.blocker,
    'review.report_advisory_count': counts.advisory,
    'review.report_follow_up_count': counts.follow_up,
    'review.report_ignored_count': counts.ignored,
    'review.governor_decision': report.governor.decision,
    'review.governor_remediation_cycles': report.governor.current.remediationCyclesUsed,
    'review.governor_changed_files': report.governor.current.changedFileCount,
    'review.governor_non_test_loc': report.governor.current.nonTestLoc,
    'review.governor_file_limit': report.governor.current.fileLimit,
    'review.governor_non_test_loc_limit': report.governor.current.nonTestLocLimit,
    'review.governor_outside_ownership_count': report.governor.current.outsideOwnershipPaths.length,
  };
  if (result.outcome === 'passed') {
    return { ...result, artifacts: [...result.artifacts, artifact], facts: { ...(result.facts ?? {}), ...evaluation } };
  }
  if (!result.reason) throw new Error('non-passing review result has no reason');
  const details = result.reason.details ?? {};
  const current = details.evaluation;
  const currentEvaluation = current && typeof current === 'object' && !Array.isArray(current)
    ? current as Readonly<Record<string, unknown>> : {};
  return {
    ...result,
    artifacts: [...result.artifacts, artifact],
    reason: { ...result.reason, details: { ...details, evaluation: { ...currentEvaluation, ...evaluation } } },
  };
}
