import crypto from 'node:crypto';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import type {
  AttemptResultV1,
  NodeResultV1,
  RemotePlanJobV1,
  RemotePlanResultV1,
  RepositoryArchiveV1,
  ResolvedTestPlanV1,
} from './types.ts';

export function remotePlanDigest(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function remotePlanJobId(idempotencyKey: string): string {
  return `job:${crypto.createHash('sha256').update(idempotencyKey).digest('hex')}`;
}

export function resolvedTestPlanDigest(
  value: Omit<ResolvedTestPlanV1, 'planDigest'> | ResolvedTestPlanV1,
): string {
  const { planDigest: _ignored, ...unsigned } = value as ResolvedTestPlanV1;
  return remotePlanDigest(unsigned);
}

export function stableTestIdentity(value: {
  project: string;
  moduleId: string | null;
  gateId: string | null;
  suiteInstanceId: string | null;
  nodeId: string;
  variation: Readonly<Record<string, unknown>>;
}): string {
  return `test:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function repositoryArchive(content: Uint8Array): RepositoryArchiveV1 {
  const bytes = Buffer.from(content);
  return Object.freeze({
    schemaVersion: 'repository-archive.v1',
    encoding: 'base64',
    contentDigest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
    sizeBytes: bytes.byteLength,
    data: bytes.toString('base64'),
  });
}

export function repositoryArchiveBytes(value: RepositoryArchiveV1): Buffer {
  const bytes = Buffer.from(value.data, 'base64');
  if (
    value.schemaVersion !== 'repository-archive.v1'
    || value.encoding !== 'base64'
    || bytes.toString('base64') !== value.data
    || bytes.byteLength !== value.sizeBytes
    || `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` !== value.contentDigest
  ) throw new Error('REMOTE_PLAN_ARCHIVE_INVALID');
  return bytes;
}

export function remotePlanJobDigest(value: Omit<RemotePlanJobV1, 'requestDigest'> | RemotePlanJobV1): string {
  const { requestDigest: _ignored, ...unsigned } = value as RemotePlanJobV1;
  return remotePlanDigest(unsigned);
}

export function remotePlanResultDigest(
  value: Omit<RemotePlanResultV1, 'resultDigest' | 'receipt'> | RemotePlanResultV1,
): string {
  const { resultDigest: _digest, receipt: _receipt, ...unsigned } = value as RemotePlanResultV1;
  return remotePlanDigest(unsigned);
}

export function attemptResultDigest(
  value: Omit<AttemptResultV1, 'resultDigest' | 'receipt'> | AttemptResultV1,
): string {
  const { resultDigest: _digest, receipt: _receipt, ...unsigned } = value as AttemptResultV1;
  return remotePlanDigest(unsigned);
}

export function nodeResultDigest(
  value: Omit<NodeResultV1, 'resultDigest' | 'receipt'> | NodeResultV1,
): string {
  const { resultDigest: _digest, receipt: _receipt, ...unsigned } = value as NodeResultV1;
  return remotePlanDigest(unsigned);
}

export function remotePlanResultReceipt(jobId: string, resultDigest: string) {
  const receiptId = `receipt:${crypto.createHash('sha256').update(`${jobId}:${resultDigest}`).digest('hex')}`;
  return Object.freeze({
    receiptId,
    receiptDigest: remotePlanDigest({ authority: 'buster-plan-service.v1', receiptId, resultDigest }),
  });
}
