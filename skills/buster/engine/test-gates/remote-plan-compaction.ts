import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import { remotePlanJobId, resolvedTestPlanDigest, validatePipelineTestGateContract, type RemotePlanJobV1, type RemotePlanResultV1, type RemotePlanStatusV1 } from '@kubeclaw/pipeline-test-gate-contract';

export interface FullPlanJobRecord {
  readonly schemaVersion: 'buster-plan-job-record.v1';
  readonly job: RemotePlanJobV1;
  readonly status: RemotePlanStatusV1;
}
export interface CompactedPlanJobRecord {
  readonly schemaVersion: 'buster-plan-job-compacted-record.v1';
  readonly job: Omit<RemotePlanJobV1, 'repositoryArchive' | 'schemaVersion'> & {
    readonly schemaVersion: 'buster-plan-job-header.v1';
    readonly repositoryArchive: Omit<RemotePlanJobV1['repositoryArchive'], 'data' | 'schemaVersion'> & {
      readonly schemaVersion: 'repository-archive-summary.v1';
    };
  };
  readonly status: RemotePlanStatusV1;
  readonly compaction: CompactionReceipt;
}
export type StoredPlanJob = FullPlanJobRecord | CompactedPlanJobRecord;

export interface CompactionIntent {
  readonly operationId: string;
  readonly actor: string;
  readonly jobId: string;
  readonly expectedPayloadDigest: string;
  readonly maximumEvidenceBytes: number;
  /** Operator-configured canonical repository identity; not an inferred Git remote URL. */
  readonly source: {
    readonly repositoryId: string;
    readonly repositoryRoot: string;
    readonly retainedRef: string;
    readonly retention: 'until-project-deletion';
  };
}
export interface CompactionReceipt {
  readonly schemaVersion: 'buster-job-compaction-receipt.v1';
  readonly intent: CompactionIntent;
  readonly intentDigest: string;
  readonly compactedAt: string;
  readonly revision: string;
  readonly tree: string;
  readonly archiveDigest: string;
  readonly archiveBytes: number;
  readonly releasedMetadataBytes: number;
}
export const compactionDigest = (value: unknown): string =>
  `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;

function assertRetainedSourceIntent(source: CompactionIntent['source']): void {
  if (!source || Object.keys(source).sort().join(',') !== 'repositoryId,repositoryRoot,retainedRef,retention'
    || typeof source.repositoryId !== 'string' || !source.repositoryId
    || typeof source.repositoryRoot !== 'string' || !path.isAbsolute(source.repositoryRoot)
    || !/^refs\/tags\/[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/u.test(source.retainedRef)
    || source.retention !== 'until-project-deletion') throw new Error('BUSTER_COMPACTION_INTENT_INVALID');
}
export function assertCompactionIntent(intent: CompactionIntent): void {
  if (!intent || Object.keys(intent).sort().join(',') !== 'actor,expectedPayloadDigest,jobId,maximumEvidenceBytes,operationId,source'
    || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(intent.operationId)
    || typeof intent.actor !== 'string' || !intent.actor.trim() || intent.actor.length > 256
    || !Number.isSafeInteger(intent.maximumEvidenceBytes) || intent.maximumEvidenceBytes < 1
    || !/^job:[a-f0-9]{64}$/u.test(intent.jobId)
    || !/^sha256:[a-f0-9]{64}$/u.test(intent.expectedPayloadDigest)) throw new Error('BUSTER_COMPACTION_INTENT_INVALID');
  assertRetainedSourceIntent(intent.source);
}
function assertCompactedSource(payload: CompactedPlanJobRecord): void {
  const { compaction, job } = payload;
  if (job.repositoryArchive.schemaVersion !== 'repository-archive-summary.v1' || 'data' in job.repositoryArchive
    || compaction.archiveDigest !== job.repositoryArchive.contentDigest
    || compaction.archiveBytes !== job.repositoryArchive.sizeBytes
    || compaction.revision !== job.sourceSnapshot.revision
    || compaction.tree !== job.sourceSnapshot.tree
    || compaction.archiveDigest !== job.sourceSnapshot.archiveContentDigest
    || compaction.archiveBytes !== job.sourceSnapshot.archiveSizeBytes
    || compaction.intent.source.repositoryId !== job.sourceSnapshot.repositoryId) throw new Error('BUSTER_COMPACTED_JOB_INVALID');
}
export function assertCompactedPlanJobRecord(payload: CompactedPlanJobRecord): void {
  assertCompactionIntent(payload.compaction.intent);
  validatePipelineTestGateContract('remotePlanStatus', payload.status);
  assertCompactedSource(payload);
  if (payload.job.schemaVersion !== 'buster-plan-job-header.v1' || payload.status.state !== 'completed' || !payload.status.result
    || payload.compaction.schemaVersion !== 'buster-job-compaction-receipt.v1'
    || payload.compaction.intentDigest !== compactionDigest(payload.compaction.intent)
    || payload.compaction.intent.jobId !== payload.job.jobId
    || payload.status.jobId !== payload.job.jobId
    || payload.status.requestDigest !== payload.job.requestDigest
    || !Number.isSafeInteger(payload.compaction.releasedMetadataBytes) || payload.compaction.releasedMetadataBytes < 1
    || remotePlanJobId(payload.job.idempotencyKey) !== payload.job.jobId
    || resolvedTestPlanDigest(payload.job.plan) !== payload.job.plan.planDigest) throw new Error('BUSTER_COMPACTED_JOB_INVALID');
}

async function git(root: string, args: readonly string[], maximumBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', root, ...args], { encoding: 'buffer', maxBuffer: maximumBytes, timeout: 120000 }, (error, stdout) => {
      if (error) reject(new Error('BUSTER_COMPACTION_SOURCE_GIT_FAILED', { cause: error }));
      else resolve(stdout);
    });
  });
}
/** Read an existing, explicitly retained ref. Never creates an archive or a ref on disk. */
export async function verifyRetainedSource(job: StoredPlanJob['job'], intent: CompactionIntent): Promise<void> {
  const { sourceSnapshot: snapshot, repositoryArchive: archive } = job;
  const source = intent.source;
  if (source.repositoryId !== snapshot.repositoryId) throw new Error('BUSTER_COMPACTION_REPOSITORY_IDENTITY_MISMATCH');
  const root = await fs.realpath(source.repositoryRoot);
  if (root !== source.repositoryRoot || (await git(root, ['rev-parse', '--show-toplevel'], 4096)).toString().trim() !== root) {
    throw new Error('BUSTER_COMPACTION_REPOSITORY_ROOT_MISMATCH');
  }
  await git(root, ['check-ref-format', source.retainedRef], 4096);
  const revision = (await git(root, ['rev-parse', '--verify', '--end-of-options', `${source.retainedRef}^{commit}`], 4096)).toString().trim();
  const tree = (await git(root, ['rev-parse', '--verify', '--end-of-options', `${revision}^{tree}`], 4096)).toString().trim();
  if (`git:${revision}` !== snapshot.revision || `git:${tree}` !== snapshot.tree) throw new Error('BUSTER_COMPACTION_SOURCE_REVISION_MISMATCH');
  const bytes = await git(root, ['archive', '--format=tar.gz', revision], archive.sizeBytes + 1);
  const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  if (bytes.byteLength !== archive.sizeBytes || digest !== archive.contentDigest
    || digest !== snapshot.archiveContentDigest || bytes.byteLength !== snapshot.archiveSizeBytes) {
    throw new Error('BUSTER_COMPACTION_SOURCE_BYTES_MISMATCH');
  }
  const still = (await git(root, ['rev-parse', '--verify', '--end-of-options', `${source.retainedRef}^{commit}`], 4096)).toString().trim();
  if (still !== revision) throw new Error('BUSTER_COMPACTION_SOURCE_REF_CHANGED');
}

export function resultArtifacts(result: RemotePlanResultV1) {
  return result.attempts.flatMap(attempt => [
    ...attempt.evidence.map(item => item.artifact),
    ...attempt.outputs.filter(item => item.kind === 'artifact').map(item => item.artifact),
    ...attempt.reports.map(item => item.sourceArtifact),
  ]);
}
export async function readJobArtifact(runtimeRoot: string, jobId: string,
  artifact: ReturnType<typeof resultArtifacts>[number], maximumBytes: number): Promise<Buffer> {
  if (artifact.sizeBytes > maximumBytes) throw new Error('BUSTER_REMOTE_EVIDENCE_SIZE_EXCEEDED');
  const source = new URL(artifact.storageUrl);
  if (source.protocol !== 'file:') throw new Error('BUSTER_REMOTE_EVIDENCE_STORAGE_UNSUPPORTED');
  const candidate = await fs.realpath(fileURLToPath(source));
  const root = await fs.realpath(path.join(path.resolve(runtimeRoot), crypto.createHash('sha256').update(jobId).digest('hex')));
  if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error('BUSTER_REMOTE_EVIDENCE_PATH_FORBIDDEN');
  const handle = await fs.open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== artifact.sizeBytes) throw new Error('BUSTER_REMOTE_EVIDENCE_SIZE_MISMATCH');
    const bounded = Buffer.alloc(artifact.sizeBytes + 1);
    let total = 0;
    while (total < bounded.byteLength) {
      const read = await handle.read(bounded, total, bounded.byteLength - total, total);
      if (!read.bytesRead) break;
      total += read.bytesRead;
    }
    if (total !== artifact.sizeBytes) throw new Error('BUSTER_REMOTE_EVIDENCE_SIZE_MISMATCH');
    const bytes = bounded.subarray(0, total);
    if (`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` !== artifact.contentDigest) {
      throw new Error('BUSTER_REMOTE_EVIDENCE_DIGEST_MISMATCH');
    }
    return bytes;
  } finally { await handle.close(); }
}
