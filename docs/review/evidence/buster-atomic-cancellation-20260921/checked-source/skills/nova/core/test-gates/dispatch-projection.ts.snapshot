import path from 'node:path';
import crypto from 'node:crypto';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import type { RemotePlanJobV1 } from '@kubeclaw/pipeline-test-gate-contract';

export interface DispatchProjectionIntent {
  readonly operationId: string;
  readonly actor: string;
  readonly runId: string;
  readonly runRoot: string;
  readonly dispatchRoot: string;
  readonly importRoot: string;
  readonly jobId: string;
  readonly requestDigest: string;
  readonly expectedPayloadDigest: string;
  readonly importPayloadDigest: string;
  readonly runJournalHead: string;
  readonly snapshotDigest: string;
}
export interface DispatchProjectionReceipt {
  readonly schemaVersion: 'nova-dispatch-projection-receipt.v1';
  readonly intent: DispatchProjectionIntent;
  readonly intentDigest: string;
  readonly resultDigest: string;
  readonly decisionDigest: string;
  readonly releasedBytesHex: string;
}
export interface FullDispatchJob {
  readonly schemaVersion: 'nova-remote-plan-dispatch.v1';
  readonly job: RemotePlanJobV1;
}
export interface ProjectedDispatchJob {
  readonly schemaVersion: 'nova-remote-plan-dispatch-projected.v1';
  readonly job: Omit<RemotePlanJobV1, 'repositoryArchive'> & {
    readonly repositoryArchive: Omit<RemotePlanJobV1['repositoryArchive'], 'data'>;
  };
  readonly projection: DispatchProjectionReceipt;
}
export type StoredDispatchJob = FullDispatchJob | ProjectedDispatchJob;
export const dispatchProjectionDigest = (value: unknown): string =>
  `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
const digest = (value: unknown) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
const identity = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value);

export function assertDispatchProjectionIntent(value: DispatchProjectionIntent): void {
  if (!value || Object.keys(value).sort().join(',') !== 'actor,dispatchRoot,expectedPayloadDigest,importPayloadDigest,importRoot,jobId,operationId,requestDigest,runId,runJournalHead,runRoot,snapshotDigest'
    || !identity(value.operationId) || !identity(value.runId)
    || typeof value.actor !== 'string' || !value.actor.trim() || value.actor.length > 256
    || !/^job:[a-f0-9]{64}$/u.test(value.jobId)
    || ![value.expectedPayloadDigest, value.importPayloadDigest, value.requestDigest, value.runJournalHead, value.snapshotDigest].every(digest)
    || ![value.runRoot, value.dispatchRoot, value.importRoot].every(root => typeof root === 'string' && path.isAbsolute(root) && path.resolve(root) === root)
    || value.dispatchRoot === value.importRoot) throw new Error('NOVA_DISPATCH_RETENTION_INTENT_INVALID');
}

export function assertProjectedDispatch(payload: ProjectedDispatchJob, fullJob: RemotePlanJobV1): void {
  const receipt = payload.projection;
  if (Object.keys(payload).sort().join(',') !== 'job,projection,schemaVersion'
    || !receipt || Object.keys(receipt).sort().join(',') !== 'decisionDigest,intent,intentDigest,releasedBytesHex,resultDigest,schemaVersion'
    || receipt.schemaVersion !== 'nova-dispatch-projection-receipt.v1') throw new Error('NOVA_DISPATCH_PROJECTION_INVALID');
  assertDispatchProjectionIntent(receipt.intent);
  if ('data' in payload.job.repositoryArchive || receipt.intentDigest !== dispatchProjectionDigest(receipt.intent)
    || ![receipt.resultDigest, receipt.decisionDigest].every(digest)
    || !/^[a-f0-9]{16}$/u.test(receipt.releasedBytesHex) || Number.parseInt(receipt.releasedBytesHex, 16) < 1
    || !Number.isSafeInteger(Number.parseInt(receipt.releasedBytesHex, 16))
    || receipt.intent.jobId !== fullJob.jobId || receipt.intent.runId !== fullJob.plan.runId
    || receipt.intent.requestDigest !== fullJob.requestDigest
    || receipt.intent.expectedPayloadDigest !== dispatchProjectionDigest({ schemaVersion: 'nova-remote-plan-dispatch.v1', job: fullJob })) {
    throw new Error('NOVA_DISPATCH_PROJECTION_INVALID');
  }
}
