import type { ArtifactRef } from './generated/contracts.ts';
import type { PluginInvocationContext } from './runtime.ts';
import { canonicalJson, sha256Text } from './values.ts';
import { parseReviewSubject, type ReviewSubject } from './review-subject.ts';

export async function readBoundArtifact(artifact: ArtifactRef, context: PluginInvocationContext): Promise<Record<string, unknown>> {
  if (artifact.producer.runId !== context.contract.lease.attempt.runId || artifact.mediaType !== 'application/json'
    || artifact.sizeBytes > 4_194_304) throw new Error('SOURCE_APPROVAL_ARTIFACT_INVALID');
  const read = await context.invoke('artifacts.read', { operation: 'get_json', resource: { type: 'artifact.object', canonicalId: artifact.artifactId },
    payload: { namespace: artifact.namespace, digest: artifact.digest } });
  const serialized = canonicalJson(read.value);
  if (read.digest !== artifact.digest || read.sizeBytes !== artifact.sizeBytes
    || sha256Text(serialized) !== artifact.digest || Buffer.byteLength(serialized) !== artifact.sizeBytes) throw new Error('SOURCE_APPROVAL_ARTIFACT_CORRUPT');
  return read.value as Record<string, unknown>;
}
function latest(artifacts: readonly ArtifactRef[]): ArtifactRef | undefined {
  if (!artifacts.length) return undefined;
  if (new Set(artifacts.map(item => item.producer.stageId)).size !== 1) throw new Error('SOURCE_APPROVAL_AMBIGUOUS');
  const maximum = Math.max(...artifacts.map(item => item.producer.attemptNumber));
  const candidates = artifacts.filter(item => item.producer.attemptNumber === maximum);
  if (candidates.length !== 1) throw new Error('SOURCE_APPROVAL_AMBIGUOUS');
  return candidates[0];
}
/** Only report-bound approval artifacts from visible graph ancestors grant authority. */
export async function approvedSource(context: PluginInvocationContext): Promise<{ subject: ReviewSubject; sourceRevision: string } | undefined> {
  const artifacts = context.contract.artifacts.filter(item => item.producer.runId === context.contract.lease.attempt.runId);
  const report = latest(artifacts.filter(item => item.namespace === 'kubeclaw.architecture-validator' && item.artifactId === 'architecture-validation'));
  const approval = latest(artifacts.filter(item => item.namespace === 'kubeclaw.human-approval' && item.artifactId === 'architecture-approval'));
  if (!report && !approval) return undefined;
  if (!report) throw new Error('SOURCE_APPROVAL_REQUIRED');
  const reviewed = await readBoundArtifact(report, context);
  if (reviewed.verdict !== 'passed' || !Array.isArray(reviewed.findings)) throw new Error('SOURCE_APPROVAL_BINDING_INVALID');
  if (reviewed.findings.length) {
    if (!approval) throw new Error('SOURCE_APPROVAL_REQUIRED');
    const accepted = await readBoundArtifact(approval, context);
    if (accepted.reportDigest !== report.digest || accepted.reportStageId !== report.producer.stageId || accepted.decision !== 'approved'
      || canonicalJson(accepted.subject) !== canonicalJson(reviewed.subject)) throw new Error('SOURCE_APPROVAL_BINDING_INVALID');
  }
  const subject = parseReviewSubject(reviewed.subject, context.contract.lease.attempt.runId);
  return { subject, sourceRevision: await approvedLineage(subject, artifacts, context) };
}

async function syncedRevision(subject: ReviewSubject, artifacts: readonly ArtifactRef[], context: PluginInvocationContext): Promise<string> {
  const sync = latest(artifacts.filter(item => item.namespace === 'kubeclaw.blueprint-sync' && item.artifactId.startsWith('blueprint-sync:')));
  let revision = subject.sourceRevision;
  if (sync) {
    const synced = await readBoundArtifact(sync, context);
    if (synced.subjectDigest !== subject.digest) return revision;
    if (synced.sourceBefore !== subject.sourceRevision || synced.repositoryRoot !== subject.repositoryRoot
      || synced.architectureRevision !== subject.architectureRevision || typeof synced.sourceRevision !== 'string'
      || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(synced.sourceRevision)) throw new Error('SOURCE_APPROVAL_SYNC_BINDING_INVALID');
    revision = synced.sourceRevision;
  }
  return revision;
}

async function approvedLineage(subject: ReviewSubject, artifacts: readonly ArtifactRef[], context: PluginInvocationContext): Promise<string> {
  let revision = await syncedRevision(subject, artifacts, context);
  const edges: { before: string; after: string }[] = [];
  for (const artifact of artifacts.filter(item => item.namespace === 'kubeclaw.implementation-agent' && item.artifactId.startsWith('implementation:'))) {
    const completed = await readBoundArtifact(artifact, context);
    if (completed.subjectDigest !== subject.digest) continue;
    if (completed.status !== 'ready_for_testing' || typeof completed.headBefore !== 'string' || typeof completed.sourceRevision !== 'string') throw new Error('SOURCE_APPROVAL_IMPLEMENTATION_INVALID');
    edges.push({ before: completed.headBefore, after: completed.sourceRevision });
  }
  const seen = new Set<string>();
  for (;;) {
    const next = edges.filter(edge => edge.before === revision);
    if (!next.length) return revision;
    if (next.length !== 1 || seen.has(revision)) throw new Error('SOURCE_APPROVAL_LINEAGE_AMBIGUOUS');
    seen.add(revision); revision = next[0]!.after;
  }
}
