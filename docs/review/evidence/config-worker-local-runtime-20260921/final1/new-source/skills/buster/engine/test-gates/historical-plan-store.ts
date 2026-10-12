import crypto from 'node:crypto';
import path from 'node:path';
import {
  remotePlanJobDigest, remotePlanJobId, repositoryArchiveBytes, resolvedTestPlanDigest,
  verifySourceSnapshotAttestation, validatePipelineTestGateContract,
  type RemotePlanJobV1, type RemotePlanResultV1, type RemotePlanStatusV1,
} from '@kubeclaw/pipeline-test-gate-contract';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import { FileDurableBlobStore, FileDurableRecordStore, type DurableRecord, type DurableRecordLimits }
  from '@kubeclaw/plugin-foundation/observability/durable-records';
import { withDurableStoreLock } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import {
  assertCompactionIntent, assertCompactedPlanJobRecord, compactionDigest, readJobArtifact, resultArtifacts, verifyRetainedSource,
  type StoredPlanJob, type CompactedPlanJobRecord, type CompactionIntent, type CompactionReceipt,
} from './remote-plan-compaction.ts';

/** Historical/manual format only. The native service never imports or reconstructs these full-job records. */
export interface HistoricalPlanJobStoreOptions {
  readonly recordLimits: DurableRecordLimits;
  readonly maximumArchiveBytes: number;
  readonly maximumResultBytes: number;
  readonly maximumResultStoreBytes: number;
  readonly trustedSourceAuthority: string;
  readonly sourceAttestationPublicKey: string | Buffer;
}

export class HistoricalBusterPlanJobStore {
  readonly #records: FileDurableRecordStore;
  readonly #results: FileDurableBlobStore;
  readonly #maximumArchiveBytes: number;
  readonly #maximumResultBytes: number;
  readonly #maximumResultStoreBytes: number;
  readonly #admissionLock: string;
  readonly #trustedSourceAuthority: string;
  readonly #sourceAttestationPublicKey: string | Buffer;

  constructor(root: string, options: HistoricalPlanJobStoreOptions) {
    if (!Number.isSafeInteger(options.maximumArchiveBytes) || options.maximumArchiveBytes < 1) {
      throw new Error('BUSTER_REMOTE_ARCHIVE_LIMIT_INVALID');
    }
    if (!Number.isSafeInteger(options.maximumResultBytes) || options.maximumResultBytes < 1) {
      throw new Error('BUSTER_REMOTE_RESULT_LIMIT_INVALID');
    }
    this.#admissionLock = path.join(path.resolve(root), 'job-admission');
    this.#maximumResultStoreBytes = options.maximumResultStoreBytes;
    this.#records = new FileDurableRecordStore(root, options.recordLimits);
    this.#results = new FileDurableBlobStore(path.join(root, 'results'), options.maximumResultBytes, options.maximumResultStoreBytes);
    this.#maximumArchiveBytes = options.maximumArchiveBytes;
    this.#maximumResultBytes = options.maximumResultBytes;
    let sourcePublicKey: crypto.KeyObject;
    try { sourcePublicKey = crypto.createPublicKey(options.sourceAttestationPublicKey); }
    catch (error) { throw new Error('BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID', { cause: error }); }
    if (options.trustedSourceAuthority.length === 0 || sourcePublicKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID');
    }
    this.#trustedSourceAuthority = options.trustedSourceAuthority;
    this.#sourceAttestationPublicKey = sourcePublicKey.export({ type: 'spki', format: 'pem' });
  }

  #preflight(job: RemotePlanJobV1): void {
    const encodedLimit = Math.ceil(this.#maximumArchiveBytes / 3) * 4;
    if (job.repositoryArchive.sizeBytes > this.#maximumArchiveBytes
      || job.repositoryArchive.data.length > encodedLimit) {
      throw new Error('BUSTER_REMOTE_ARCHIVE_SIZE_EXCEEDED');
    }
    // Keep the network trust boundary explicit. Contract validation repeats
    // these semantic checks for all other callers.
    repositoryArchiveBytes(job.repositoryArchive);
    if (!verifySourceSnapshotAttestation(job.sourceSnapshot,
      this.#trustedSourceAuthority, this.#sourceAttestationPublicKey)) {
      throw new Error('BUSTER_SOURCE_ATTESTATION_INVALID');
    }
    if (remotePlanJobId(job.idempotencyKey) !== job.jobId) {
      throw new Error('BUSTER_REMOTE_JOB_ID_INVALID');
    }
    if (resolvedTestPlanDigest(job.plan) !== job.plan.planDigest) {
      throw new Error('BUSTER_REMOTE_PLAN_DIGEST_MISMATCH');
    }
    if (remotePlanJobDigest(job) !== job.requestDigest) {
      throw new Error('BUSTER_REMOTE_REQUEST_DIGEST_MISMATCH');
    }
    validatePipelineTestGateContract('remotePlanJob', job);
  }

  validate(job: RemotePlanJobV1): void { this.#preflight(job); }

  async accept(job: RemotePlanJobV1, now: string): Promise<RemotePlanStatusV1> {
    this.#preflight(job);
    return withDurableStoreLock(this.#admissionLock, () => this.#accept(job, now));
  }

  async #accept(job: RemotePlanJobV1, now: string): Promise<RemotePlanStatusV1> {
    const records = await this.records();
    const existingRecord = records.find((item) => item.idempotencyKey === job.idempotencyKey);
    if (existingRecord) {
      if (existingRecord.payload.job.jobId !== job.jobId
        || existingRecord.payload.job.requestDigest !== job.requestDigest) {
        throw new Error('BUSTER_REMOTE_JOB_CONFLICT');
      }
      return structuredClone(existingRecord.payload.status);
    }
    const reservedBytes = records.reduce((sum, record) => sum + (record.payload.status.result?.sizeBytes ?? this.#maximumResultBytes), 0);
    if (!Number.isSafeInteger(reservedBytes) || reservedBytes + this.#maximumResultBytes > this.#maximumResultStoreBytes) {
      throw new Error('BUSTER_REMOTE_RESULT_CAPACITY_EXCEEDED');
    }
    const status: RemotePlanStatusV1 = {
      schemaVersion: 'buster-plan-status.v1', jobId: job.jobId,
      requestDigest: job.requestDigest, state: 'accepted', submittedAt: job.submittedAt,
      updatedAt: now, result: null, error: null,
    };
    validatePipelineTestGateContract('remotePlanStatus', status);
    const payload: StoredPlanJob = { schemaVersion: 'buster-plan-job-record.v1', job, status };
    let stored: Awaited<ReturnType<FileDurableRecordStore['append']>>;
    try {
      stored = await this.#records.append('buster-plan-jobs', job.idempotencyKey, payload);
    } catch (error) {
      if (error instanceof Error && error.message === 'DURABLE_RECORD_IDEMPOTENCY_CONFLICT') {
        const winner = (await this.records()).find((record) => record.idempotencyKey === job.idempotencyKey)?.payload;
        if (winner?.job.jobId === job.jobId && winner.job.requestDigest === job.requestDigest) {
          return structuredClone(winner.status);
        }
        throw new Error('BUSTER_REMOTE_JOB_CONFLICT', { cause: error });
      }
      throw error;
    }
    const accepted = stored.record.payload as StoredPlanJob;
    if (accepted.job.jobId !== job.jobId || accepted.job.requestDigest !== job.requestDigest) {
      throw new Error('BUSTER_REMOTE_JOB_CONFLICT');
    }
    return structuredClone(accepted.status);
  }

  async records(): Promise<ReadonlyArray<DurableRecord<StoredPlanJob>>> {
    const records = await this.#records.read<StoredPlanJob>('buster-plan-jobs');
    for (const { payload } of records) {
      if (payload.schemaVersion === 'buster-plan-job-compacted-record.v1') {
        assertCompactedPlanJobRecord(payload);
        if (!verifySourceSnapshotAttestation(payload.job.sourceSnapshot, this.#trustedSourceAuthority, this.#sourceAttestationPublicKey)) {
          throw new Error('BUSTER_SOURCE_ATTESTATION_INVALID');
        }
      } else if (payload.schemaVersion !== 'buster-plan-job-record.v1') throw new Error('BUSTER_JOB_RECORD_INVALID');
    }
    return records;
  }

  async get(jobId: string): Promise<Readonly<{ record: DurableRecord<StoredPlanJob>; payload: StoredPlanJob }>> {
    const record = (await this.records()).find((item) => item.payload.job.jobId === jobId);
    if (!record) throw new Error('BUSTER_REMOTE_JOB_NOT_FOUND');
    return { record, payload: structuredClone(record.payload) };
  }

  async transition(
    jobId: string,
    expected: readonly RemotePlanStatusV1['state'][],
    state: RemotePlanStatusV1['state'],
    now: string,
    terminal?: { readonly error?: string },
  ): Promise<RemotePlanStatusV1> {
    const current = await this.get(jobId);
    if (current.payload.status.state === 'completed') {
      if (state === 'completed') return current.payload.status;
      throw new Error('BUSTER_COMPACTED_JOB_TERMINAL');
    }
    if (!expected.includes(current.payload.status.state)) {
      if (current.payload.status.state === state) return current.payload.status;
      throw new Error(`BUSTER_REMOTE_JOB_STATE_CONFLICT:${current.payload.status.state}`);
    }
    const status: RemotePlanStatusV1 = {
      ...current.payload.status,
      state,
      updatedAt: now,
      result: null,
      error: terminal?.error ?? null,
    };
    validatePipelineTestGateContract('remotePlanStatus', status);
    const next: StoredPlanJob = { ...current.payload, status };
    const stored = await this.#records.transition(
      'buster-plan-jobs', current.record.idempotencyKey, current.record.payloadDigest, next,
    );
    return structuredClone((stored.payload as StoredPlanJob).status);
  }

  async complete(jobId: string, result: RemotePlanResultV1, now: string): Promise<RemotePlanStatusV1> {
    validatePipelineTestGateContract('remotePlanResult', result);
    return withDurableStoreLock(this.#admissionLock, () => this.#complete(jobId, result, now));
  }

  async #complete(jobId: string, result: RemotePlanResultV1, now: string): Promise<RemotePlanStatusV1> {
    const current = await this.get(jobId);
    const job = current.payload.job;
    if (result.jobId !== jobId || result.planId !== job.plan.planId
      || result.planDigest !== job.plan.planDigest || result.runId !== job.plan.runId) throw new Error('BUSTER_REMOTE_RESULT_IDENTITY_MISMATCH');
    const bytes = Buffer.from(canonicalJson(result));
    if (bytes.byteLength > this.#maximumResultBytes) throw new Error('BUSTER_REMOTE_RESULT_SIZE_EXCEEDED');
    const contentDigest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    if (current.payload.status.state === 'completed') {
      if (current.payload.status.result?.contentDigest !== contentDigest
        || current.payload.status.result.resultDigest !== result.resultDigest) {
        throw new Error('BUSTER_REMOTE_RESULT_CONFLICT');
      }
      return current.payload.status;
    }
    if (current.payload.status.state !== 'running') {
      throw new Error(`BUSTER_REMOTE_JOB_STATE_CONFLICT:${current.payload.status.state}`);
    }
    const storedResult = await this.#results.put(bytes);
    const status: RemotePlanStatusV1 = {
      ...current.payload.status,
      state: 'completed',
      updatedAt: now,
      result: {
        schemaVersion: 'buster-plan-result-ref.v1',
        resultDigest: result.resultDigest,
        contentDigest: storedResult.digest,
        sizeBytes: storedResult.sizeBytes,
      },
      error: null,
    };
    validatePipelineTestGateContract('remotePlanStatus', status);
    const next: StoredPlanJob = { ...current.payload, status };
    const stored = await this.#records.transition(
      'buster-plan-jobs', current.record.idempotencyKey, current.record.payloadDigest, next,
    );
    return structuredClone((stored.payload as StoredPlanJob).status);
  }

  /** Manual local operation; never schedules execution or removes result/evidence files. */
  async compactCompletedArchive(inputIntent: CompactionIntent, runtimeRoot: string): Promise<{
    readonly receipt: CompactionReceipt; readonly releasedMetadataBytes: number;
  }> {
    // Own the complete intent before validation or asynchronous lock acquisition.
    const intent = structuredClone(inputIntent);
    assertCompactionIntent(intent);
    return withDurableStoreLock(this.#admissionLock, async () => {
      const current = await this.get(intent.jobId);
      if (current.payload.schemaVersion === 'buster-plan-job-compacted-record.v1') {
        if (current.payload.compaction.intentDigest !== compactionDigest(intent)) throw new Error('BUSTER_COMPACTION_INTENT_CONFLICT');
        return { receipt: current.payload.compaction, releasedMetadataBytes: 0 };
      }
      if (current.record.payloadDigest !== intent.expectedPayloadDigest) throw new Error('BUSTER_COMPACTION_RECORD_CHANGED');
      const { job, status } = current.payload;
      if (status.state !== 'completed' || !status.result) throw new Error('BUSTER_COMPACTION_JOB_NOT_COMPLETED');
      this.#preflight(job);
      const result = JSON.parse((await this.result(job.jobId, status.result.contentDigest, status.result.sizeBytes)).toString()) as RemotePlanResultV1;
      if (result.cleanupErrors.length || result.attempts.some(attempt => attempt.executionState !== 'completed')) {
        throw new Error('BUSTER_COMPACTION_EXECUTION_UNCERTAIN');
      }
      let evidenceBytes = 0;
      for (const artifact of resultArtifacts(result)) {
        evidenceBytes += artifact.sizeBytes;
        if (!Number.isSafeInteger(evidenceBytes) || evidenceBytes > intent.maximumEvidenceBytes) throw new Error('BUSTER_COMPACTION_EVIDENCE_BUDGET_EXCEEDED');
        await readJobArtifact(runtimeRoot, job.jobId, artifact, intent.maximumEvidenceBytes);
      }
      await verifyRetainedSource(job, intent);
      const archive = { schemaVersion: 'repository-archive-summary.v1' as const, encoding: job.repositoryArchive.encoding,
        contentDigest: job.repositoryArchive.contentDigest, sizeBytes: job.repositoryArchive.sizeBytes };
      const receipt: CompactionReceipt = {
        schemaVersion: 'buster-job-compaction-receipt.v1', intent: structuredClone(intent),
        intentDigest: compactionDigest(intent), compactedAt: new Date().toISOString(),
        revision: job.sourceSnapshot.revision, tree: job.sourceSnapshot.tree,
        archiveDigest: archive.contentDigest, archiveBytes: archive.sizeBytes, releasedMetadataBytes: 0,
      };
      let next: CompactedPlanJobRecord = {
        schemaVersion: 'buster-plan-job-compacted-record.v1', job: { ...job, schemaVersion: 'buster-plan-job-header.v1', repositoryArchive: archive }, status, compaction: receipt,
      };
      // Canonical record envelopes have fixed-size digests and ISO timestamps.
      // Include the receipt itself in the net metadata byte saving.
      const oldBytes = Buffer.byteLength(canonicalJson(current.payload));
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const releasedMetadataBytes = oldBytes - Buffer.byteLength(canonicalJson(next));
        if (releasedMetadataBytes === next.compaction.releasedMetadataBytes) break;
        next = { ...next, compaction: { ...next.compaction, releasedMetadataBytes } };
      }
      if (next.compaction.releasedMetadataBytes < 1
        || next.compaction.releasedMetadataBytes !== oldBytes - Buffer.byteLength(canonicalJson(next))) {
        throw new Error('BUSTER_COMPACTION_NO_BYTE_SAVING');
      }
      assertCompactedPlanJobRecord(next);
      await this.#records.transition('buster-plan-jobs', current.record.idempotencyKey, current.record.payloadDigest, next);
      return { receipt: next.compaction, releasedMetadataBytes: next.compaction.releasedMetadataBytes };
    });
  }

  async result(jobId: string, contentDigest: string, maximumBytes: number): Promise<Buffer> {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('BUSTER_REMOTE_RESULT_LIMIT_INVALID');
    const status = (await this.get(jobId)).payload.status;
    if (status.state !== 'completed' || !status.result) throw new Error('BUSTER_REMOTE_RESULT_NOT_READY');
    if (status.result.contentDigest !== contentDigest) throw new Error('BUSTER_REMOTE_RESULT_NOT_FOUND');
    if (status.result.sizeBytes > maximumBytes || status.result.sizeBytes > this.#maximumResultBytes) {
      throw new Error('BUSTER_REMOTE_RESULT_SIZE_EXCEEDED');
    }
    const bytes = await this.#results.get(contentDigest);
    if (bytes.byteLength !== status.result.sizeBytes) throw new Error('BUSTER_REMOTE_RESULT_SIZE_MISMATCH');
    const parsed = JSON.parse(bytes.toString('utf8')) as RemotePlanResultV1;
    validatePipelineTestGateContract('remotePlanResult', parsed);
    if (parsed.jobId !== jobId || parsed.resultDigest !== status.result.resultDigest) {
      throw new Error('BUSTER_REMOTE_RESULT_IDENTITY_MISMATCH');
    }
    return bytes;
  }
}

