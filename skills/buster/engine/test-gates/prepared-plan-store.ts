import { readBusterOriginalExecution, type BusterOriginalExecution } from './original-execution.ts';
import { preparedPlanStateRoot } from './prepared-plan-paths.ts';
import { assertPreparedResultOrigin, type PreparedResultOrigin } from './preparation-result-origin.ts';
import { assertImportedTerminalPlanJobRecord, type ImportedTerminalPlanJobRecord } from './preparation-historical-terminal.ts';
import crypto from 'node:crypto';
import path from 'node:path';
import { verifySourceSnapshotAttestation, validatePipelineTestGateContract,
  type RemotePlanResultV1, type RemotePlanStatusV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import { FileDurableBlobStore, FileDurableRecordStore, type DurableRecord, type DurableRecordLimits }
  from '@kubeclaw/plugin-foundation/observability/durable-records';
import { withDurableStoreLock } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import { assertPreparedSource } from './preparation-header.ts';
import type { PreparedAdmission } from './preparation-client.ts';
import { assertBusterInput, type BusterStagedAdmission } from './preparation-input.ts';
import type { PreparedSourceReference } from './preparation-header.ts';

export type PreparedPlanJobRecord = BusterStagedAdmission & (
  { readonly schemaVersion: 'buster-plan-job-record.v2' }
  | { readonly schemaVersion: 'buster-plan-job-record.v3'; readonly originalExecution: BusterOriginalExecution }
) & {
  readonly source: PreparedSourceReference | null;
  readonly resultOrigin: PreparedResultOrigin;
  readonly status: RemotePlanStatusV1;
};
export type StoredPreparedPlanJob = PreparedPlanJobRecord | ImportedTerminalPlanJobRecord;

export function assertPreparedPlanJobRecord(value: unknown): asserts value is PreparedPlanJobRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== (
      'schemaVersion' in value && value.schemaVersion === 'buster-plan-job-record.v3'
        ? 'input,job,originalExecution,resultOrigin,schemaVersion,source,status'
        : 'input,job,resultOrigin,schemaVersion,source,status')) {
    throw new Error('BUSTER_JOB_RECORD_INVALID');
  }
  const payload = value as PreparedPlanJobRecord;
  if (payload.schemaVersion === 'buster-plan-job-record.v3') readBusterOriginalExecution(payload.originalExecution);
  else if (payload.schemaVersion !== 'buster-plan-job-record.v2') throw new Error('BUSTER_JOB_RECORD_INVALID');
  assertBusterInput(payload.input, payload.job);
  if (payload.source !== null) assertPreparedSource(payload.source, payload.job);
  validatePipelineTestGateContract('remotePlanStatus', payload.status);
  assertPreparedResultOrigin(payload.resultOrigin, payload.status);
  if (payload.resultOrigin?.kind === 'historical'
    && (payload.input.schemaVersion !== 'buster-historical-input.v1'
      || payload.resultOrigin.importId !== payload.input.importId
      || payload.resultOrigin.originalPayloadDigest !== payload.input.originalPayloadDigest)) {
    throw new Error('BUSTER_RESULT_ORIGIN_INVALID');
  }
  if (payload.status.jobId !== payload.job.jobId || payload.status.requestDigest !== payload.job.requestDigest) {
    throw new Error('BUSTER_REMOTE_JOB_CONFLICT');
  }
}

export interface BusterPlanJobStoreOptions {
  readonly recordLimits: DurableRecordLimits;
  readonly maximumResultBytes: number;
  readonly maximumResultStoreBytes: number;
  readonly trustedSourceAuthority: string;
  readonly sourceAttestationPublicKey: string | Buffer;
}

export class PreparedBusterPlanJobStore {
  readonly #records: FileDurableRecordStore;
  readonly #results: FileDurableBlobStore;
  readonly #maximumResultBytes: number;
  readonly #maximumResultStoreBytes: number;
  readonly #admissionLock: string;
  readonly #trustedSourceAuthority: string;
  readonly #sourceAttestationPublicKey: string | Buffer;

  constructor(root: string, options: BusterPlanJobStoreOptions) {
    if (!Number.isSafeInteger(options.maximumResultBytes) || options.maximumResultBytes < 1) {
      throw new Error('BUSTER_REMOTE_RESULT_LIMIT_INVALID');
    }
    const writableRoot = preparedPlanStateRoot(root);
    this.#admissionLock = path.join(writableRoot, 'job-admission');
    this.#maximumResultStoreBytes = options.maximumResultStoreBytes;
    this.#records = new FileDurableRecordStore(writableRoot, options.recordLimits);
    this.#results = new FileDurableBlobStore(path.join(writableRoot, 'results'), options.maximumResultBytes, options.maximumResultStoreBytes);
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

  validate(prepared: BusterStagedAdmission): void {
    assertBusterInput(prepared.input, prepared.job);
    if (!verifySourceSnapshotAttestation(prepared.job.sourceSnapshot,
      this.#trustedSourceAuthority, this.#sourceAttestationPublicKey)) throw new Error('BUSTER_SOURCE_ATTESTATION_INVALID');
  }

  async accept(input: BusterStagedAdmission, now: string, originalExecution?: BusterOriginalExecution): Promise<RemotePlanStatusV1> {
    const prepared = structuredClone(input);
    const original = originalExecution === undefined ? undefined : readBusterOriginalExecution(originalExecution);
    this.validate(prepared);
    return withDurableStoreLock(this.#admissionLock, () => this.#accept(prepared, now, original));
  }

  async #accept(prepared: BusterStagedAdmission, now: string, originalExecution?: BusterOriginalExecution): Promise<RemotePlanStatusV1> {
    const { job, input } = prepared;
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
    const payload: PreparedPlanJobRecord = { ...prepared, ...(originalExecution
      ? { schemaVersion: 'buster-plan-job-record.v3' as const, originalExecution }
      : { schemaVersion: 'buster-plan-job-record.v2' as const }), source: null, resultOrigin: null, status };
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
    const accepted = stored.record.payload as PreparedPlanJobRecord;
    if (accepted.job.jobId !== job.jobId || accepted.job.requestDigest !== job.requestDigest) {
      throw new Error('BUSTER_REMOTE_JOB_CONFLICT');
    }
    return structuredClone(accepted.status);
  }

  async records(): Promise<ReadonlyArray<DurableRecord<StoredPreparedPlanJob>>> {
    const records = await this.#records.read<StoredPreparedPlanJob>('buster-plan-jobs');
    for (const { payload } of records) {
      if (payload.schemaVersion === 'buster-plan-job-imported-terminal.v2') assertImportedTerminalPlanJobRecord(payload);
      else { assertPreparedPlanJobRecord(payload); this.validate(payload); }
    }
    return records;
  }

  async get(jobId: string): Promise<Readonly<{ record: DurableRecord<StoredPreparedPlanJob>; payload: StoredPreparedPlanJob }>> {
    const record = (await this.records()).find((item) => item.payload.job.jobId === jobId);
    if (!record) throw new Error('BUSTER_REMOTE_JOB_NOT_FOUND');
    return { record, payload: structuredClone(record.payload) };
  }

  async attachSource(prepared: PreparedAdmission): Promise<void> {
    const captured = structuredClone(prepared);
    await withDurableStoreLock(this.#admissionLock, () => this.#attachSource(captured));
  }

  async #attachSource(prepared: PreparedAdmission): Promise<void> {
    assertPreparedSource(prepared.source, prepared.job);
    const current = await this.get(prepared.job.jobId);
    if (canonicalJson(current.payload.job) !== canonicalJson(prepared.job)
      || (current.payload.source !== null && canonicalJson(current.payload.source) !== canonicalJson(prepared.source))) {
      throw new Error('BUSTER_REMOTE_JOB_CONFLICT');
    }
    if (current.payload.source !== null) return;
    if (current.payload.status.state !== 'accepted') throw new Error('BUSTER_REMOTE_JOB_STATE_CONFLICT');
    await this.#records.transition('buster-plan-jobs', current.record.idempotencyKey,
      current.record.payloadDigest, { ...current.payload, source: structuredClone(prepared.source) });
  }

  /** Read the cancellation decision under the same fence as completion and source attachment. */
  async requestCancellation(jobId: string, now: string): Promise<RemotePlanStatusV1> {
    return withDurableStoreLock(this.#admissionLock, async () => {
      const current = await this.get(jobId);
      if (['completed', 'failed', 'cancelled', 'cancelling'].includes(current.payload.status.state)) {
        return current.payload.status;
      }
      return this.#writeStatus(current, 'cancelling', now);
    });
  }

  async transition(
    jobId: string,
    expected: readonly RemotePlanStatusV1['state'][],
    state: RemotePlanStatusV1['state'],
    now: string,
    terminal?: { readonly error?: string },
  ): Promise<RemotePlanStatusV1> {
    const capturedExpected = [...expected];
    const capturedTerminal = terminal === undefined ? undefined : structuredClone(terminal);
    return withDurableStoreLock(this.#admissionLock,
      () => this.#transitionStatus(jobId, capturedExpected, state, now, capturedTerminal));
  }

  async #transitionStatus(
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
    return this.#writeStatus(current, state, now, terminal);
  }

  async #writeStatus(
    current: Readonly<{ record: DurableRecord<StoredPreparedPlanJob>; payload: StoredPreparedPlanJob }>,
    state: RemotePlanStatusV1['state'],
    now: string,
    terminal?: { readonly error?: string },
  ): Promise<RemotePlanStatusV1> {
    const status: RemotePlanStatusV1 = {
      ...current.payload.status,
      state,
      updatedAt: now,
      result: null,
      error: terminal?.error ?? null,
    };
    validatePipelineTestGateContract('remotePlanStatus', status);
    const next: StoredPreparedPlanJob = { ...current.payload, status, resultOrigin: null };
    const stored = await this.#records.transition(
      'buster-plan-jobs', current.record.idempotencyKey, current.record.payloadDigest, next,
    );
    return structuredClone((stored.payload as PreparedPlanJobRecord).status);
  }

  async complete(jobId: string, result: RemotePlanResultV1, now: string): Promise<RemotePlanStatusV1> {
    result = structuredClone(result);
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
    const next: StoredPreparedPlanJob = { ...current.payload, status, resultOrigin: { kind: 'v2' } };
    const stored = await this.#records.transition(
      'buster-plan-jobs', current.record.idempotencyKey, current.record.payloadDigest, next,
    );
    return structuredClone((stored.payload as PreparedPlanJobRecord).status);
  }

  async result(jobId: string, contentDigest: string, maximumBytes: number): Promise<Buffer> {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('BUSTER_REMOTE_RESULT_LIMIT_INVALID');
    const payload = (await this.get(jobId)).payload;
    const status = payload.status;
    if (status.state !== 'completed' || !status.result) throw new Error('BUSTER_REMOTE_RESULT_NOT_READY');
    if (status.result.contentDigest !== contentDigest) throw new Error('BUSTER_REMOTE_RESULT_NOT_FOUND');
    if (status.result.sizeBytes > maximumBytes || status.result.sizeBytes > this.#maximumResultBytes) {
      throw new Error('BUSTER_REMOTE_RESULT_SIZE_EXCEEDED');
    }
    if (payload.resultOrigin?.kind !== 'v2') throw new Error('BUSTER_HISTORICAL_RESULT_AUTHORITY_REQUIRED');
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

