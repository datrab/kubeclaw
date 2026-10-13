import crypto from 'node:crypto';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import { repositoryArchiveBytes, validatePipelineTestGateContract, type RemotePlanJobV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { FileDurableBlobStore, FileDurableRecordStore, type DurableRecordLimits } from '@kubeclaw/plugin-foundation/observability/durable-records';
import type { RemoteInterruption } from './dispatch-operation.ts';
import { checkGateSignal } from './deadline.ts';
import { assertDispatchProjectionIntent, assertProjectedDispatch, dispatchProjectionDigest,
  type DispatchProjectionIntent, type DispatchProjectionReceipt, type StoredDispatchJob,
  type FullDispatchJob, type ProjectedDispatchJob } from './dispatch-projection.ts';

export class FileNovaRemotePlanStore {
  readonly #records: FileDurableRecordStore;
  readonly #blobs: FileDurableBlobStore;
  readonly #maximumArchiveBytes: number;

  constructor(root: string, options: {
    readonly recordLimits: DurableRecordLimits;
    readonly maximumArchiveBytes: number;
    readonly maximumArchiveStoreBytes: number;
  }) {
    if (!Number.isSafeInteger(options.maximumArchiveBytes) || options.maximumArchiveBytes < 1) {
      throw new Error('NOVA_REMOTE_PLAN_ARCHIVE_LIMIT_INVALID');
    }
    this.#records = new FileDurableRecordStore(root, options.recordLimits);
    this.#blobs = new FileDurableBlobStore(root, options.maximumArchiveBytes, options.maximumArchiveStoreBytes);
    this.#maximumArchiveBytes = options.maximumArchiveBytes;
  }

  async persistBeforeDispatch(job: RemotePlanJobV1, signal?: AbortSignal): Promise<RemotePlanJobV1> {
    checkGateSignal(signal);
    const maximumEncodedBytes = Math.ceil(this.#maximumArchiveBytes / 3) * 4;
    if (
      job.repositoryArchive.sizeBytes > this.#maximumArchiveBytes
      || job.repositoryArchive.data.length > maximumEncodedBytes
    ) throw new Error('NOVA_REMOTE_PLAN_ARCHIVE_SIZE_EXCEEDED');
    validatePipelineTestGateContract('remotePlanJob', job);
    const archive = repositoryArchiveBytes(job.repositoryArchive);
    if (archive.byteLength > this.#maximumArchiveBytes) throw new Error('NOVA_REMOTE_PLAN_ARCHIVE_SIZE_EXCEEDED');
    const payload: FullDispatchJob = {
      schemaVersion: 'nova-remote-plan-dispatch.v1',
      job: structuredClone(job),
    };
    try { await this.#records.append('remote-plan-jobs', job.idempotencyKey, payload); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== 'DURABLE_RECORD_IDEMPOTENCY_CONFLICT') throw error;
      const existing = await this.load(job.jobId, signal);
      if (dispatchProjectionDigest(existing) !== dispatchProjectionDigest(job)) throw error;
      return existing;
    }
    checkGateSignal(signal);
    const stored = await this.#blobs.put(archive);
    if (stored.digest !== job.repositoryArchive.contentDigest || stored.sizeBytes !== archive.byteLength) {
      throw new Error('NOVA_REMOTE_PLAN_ARCHIVE_STORE_MISMATCH');
    }
    checkGateSignal(signal);
    return this.load(job.jobId, signal);
  }

  async recordInterruption(outcome: RemoteInterruption): Promise<void> {
    await this.#records.append('remote-plan-interruptions', `interruption:${crypto.randomUUID()}`, outcome);
  }
  async interruptions(): Promise<readonly RemoteInterruption[]> {
    return (await this.#records.read<RemoteInterruption>('remote-plan-interruptions')).map(({ payload }) => payload);
  }

  async load(jobId: string, signal?: AbortSignal): Promise<RemotePlanJobV1> {
    checkGateSignal(signal);
    const records = await this.#records.read<StoredDispatchJob>('remote-plan-jobs');
    const record = records.find((record) => record.payload.job?.jobId === jobId);
    if (!record) {
      throw new Error('NOVA_REMOTE_PLAN_JOB_NOT_FOUND');
    }
    const job = await this.#restore(record.payload, true, signal);
    if (record.idempotencyKey !== job.idempotencyKey) throw new Error('NOVA_DISPATCH_PROJECTION_INVALID');
    return job;
  }

  async #restore(payload: StoredDispatchJob, repairLegacy: boolean, signal?: AbortSignal): Promise<RemotePlanJobV1> {
    if (!payload || !['nova-remote-plan-dispatch.v1', 'nova-remote-plan-dispatch-projected.v1'].includes(payload.schemaVersion)) {
      throw new Error('NOVA_REMOTE_PLAN_JOB_SCHEMA_UNSUPPORTED');
    }
    if (payload.schemaVersion === 'nova-remote-plan-dispatch.v1') {
      if (Object.keys(payload).sort().join(',') !== 'job,schemaVersion') throw new Error('NOVA_DISPATCH_PROJECTION_INVALID');
      validatePipelineTestGateContract('remotePlanJob', payload.job);
      const recordedArchive = repositoryArchiveBytes(payload.job.repositoryArchive);
      if (recordedArchive.byteLength > this.#maximumArchiveBytes) throw new Error('NOVA_REMOTE_PLAN_ARCHIVE_SIZE_EXCEEDED');
      if (repairLegacy) await this.#blobs.put(recordedArchive);
    }
    checkGateSignal(signal);
    const archive = await this.#blobs.get(payload.job.repositoryArchive.contentDigest);
    if (archive.byteLength > this.#maximumArchiveBytes) throw new Error('NOVA_REMOTE_PLAN_ARCHIVE_SIZE_EXCEEDED');
    const job: RemotePlanJobV1 = {
      ...structuredClone(payload.job),
      repositoryArchive: { ...payload.job.repositoryArchive, data: archive.toString('base64') },
    };
    validatePipelineTestGateContract('remotePlanJob', job);
    if (payload.schemaVersion === 'nova-remote-plan-dispatch-projected.v1') assertProjectedDispatch(payload, job);
    checkGateSignal(signal);
    return Object.freeze(job);
  }

  /** Read-only operator selection: unlike legacy load, never repairs a blob. */
  async projectionCandidate(jobId: string): Promise<{ readonly job: RemotePlanJobV1; readonly payloadDigest: string }> {
    const record = (await this.#records.read<StoredDispatchJob>('remote-plan-jobs')).find(item => item.payload.job?.jobId === jobId);
    if (!record) throw new Error('NOVA_REMOTE_PLAN_JOB_NOT_FOUND');
    const job = await this.#restore(record.payload, false);
    if (record.idempotencyKey !== job.idempotencyKey) throw new Error('NOVA_DISPATCH_PROJECTION_INVALID');
    return { job, payloadDigest: record.payloadDigest };
  }

  /** Caller holds the distinct run/import fences. This retains every logical job field. */
  async compactImportedArchive(input: DispatchProjectionIntent,
    authority: { readonly payloadDigest: string; readonly resultDigest: string; readonly decisionDigest: string },
    authorize: () => void): Promise<{ readonly newlyProjected: boolean; readonly releasedBytes: number; readonly receipt: DispatchProjectionReceipt }> {
    const intent = structuredClone(input);
    assertDispatchProjectionIntent(intent);
    if (authority.payloadDigest !== intent.importPayloadDigest) throw new Error('NOVA_DISPATCH_RETENTION_IMPORT_REQUIRED');
    const record = (await this.#records.read<StoredDispatchJob>('remote-plan-jobs')).find(item => item.payload.job?.jobId === intent.jobId);
    if (!record) throw new Error('NOVA_REMOTE_PLAN_JOB_NOT_FOUND');
    const job = await this.#restore(record.payload, false);
    if (record.idempotencyKey !== job.idempotencyKey || job.plan.runId !== intent.runId || job.requestDigest !== intent.requestDigest) {
      throw new Error('NOVA_DISPATCH_RETENTION_JOB_MISMATCH');
    }
    if (record.payload.schemaVersion === 'nova-remote-plan-dispatch-projected.v1') {
      const receipt = record.payload.projection;
      if (receipt.intentDigest !== dispatchProjectionDigest(intent) || receipt.resultDigest !== authority.resultDigest
        || receipt.decisionDigest !== authority.decisionDigest) throw new Error('NOVA_DISPATCH_RETENTION_CONFLICT');
      return this.#records.withRecords<StoredDispatchJob, { newlyProjected: false; releasedBytes: number; receipt: DispatchProjectionReceipt }>(
        'remote-plan-jobs', async current => {
          if (current.find(item => item.idempotencyKey === record.idempotencyKey)?.payloadDigest !== record.payloadDigest) {
            throw new Error('NOVA_DISPATCH_RETENTION_RECORD_CHANGED');
          }
          if (authorize() !== undefined) throw new Error('DURABLE_RECORD_AUTHORIZATION_NOT_SYNCHRONOUS');
          return { newlyProjected: false, releasedBytes: 0, receipt: structuredClone(receipt) };
        });
    }
    if (record.payloadDigest !== intent.expectedPayloadDigest) throw new Error('NOVA_DISPATCH_RETENTION_RECORD_CHANGED');
    const { data: _data, ...archive } = job.repositoryArchive;
    const projection: DispatchProjectionReceipt = { schemaVersion: 'nova-dispatch-projection-receipt.v1',
      intent, intentDigest: dispatchProjectionDigest(intent), resultDigest: authority.resultDigest,
      decisionDigest: authority.decisionDigest, releasedBytesHex: '0000000000000000' };
    const next: ProjectedDispatchJob = { schemaVersion: 'nova-remote-plan-dispatch-projected.v1',
      job: { ...job, repositoryArchive: archive }, projection };
    const releasedBytes = Buffer.byteLength(canonicalJson(record.payload)) - Buffer.byteLength(canonicalJson(next))
      + Buffer.byteLength(record.committedAt) - 24;
    if (releasedBytes < 1) throw new Error('NOVA_DISPATCH_RETENTION_NO_SAVING');
    const payload: ProjectedDispatchJob = { ...next, projection: { ...projection, releasedBytesHex: releasedBytes.toString(16).padStart(16, '0') } };
    assertProjectedDispatch(payload, job);
    await this.#records.transition('remote-plan-jobs', record.idempotencyKey, record.payloadDigest, payload, authorize);
    return { newlyProjected: true, releasedBytes, receipt: structuredClone(payload.projection) };
  }
}
