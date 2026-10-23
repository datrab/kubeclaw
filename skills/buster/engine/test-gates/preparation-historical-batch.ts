import { canonicalJson } from '@kubeclaw/pipeline-observability-contract';
import { assertDurableRecordReplay, payloadDigest, type DurableRecordState } from '@kubeclaw/plugin-foundation/observability/record-retirement';
import { remotePlanJobDigest, verifySourceSnapshotAttestation, validatePipelineTestGateContract,
  type RemotePlanJobV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { assertPreparedHeader, preparedPlanHeader, preparationDigest } from './preparation-header.ts';
import { assertPreparationSlot, type PreparationSlot } from './preparation-slots.ts';
import { assertCompactedPlanJobRecord, type StoredPlanJob } from './remote-plan-compaction.ts';
import { assertHistoricalImportDescriptor, assertHistoricalInput, type HistoricalImportDescriptor,
  type HistoricalStagedAdmission } from './preparation-historical-reference.ts';
import { assertImportedTerminalPlanJobRecord, type ImportedTerminalPlanJobRecord } from './preparation-historical-terminal.ts';
import { wireDigest } from './preparation-input.ts';
import { assertPreparedPlanJobRecord } from './prepared-plan-store.ts';

export interface HistoricalBatchContext {
  readonly importId: string;
  readonly preparationUid: PreparationSlot;
  readonly attemptSpecDigest: string;
  readonly descriptor: HistoricalImportDescriptor;
  readonly settings: BusterPreparationSettings;
  readonly trustedSourceAuthority: string;
  readonly sourceAttestationPublicKey: string;
}

export interface HistoricalBatch {
  readonly state: DurableRecordState;
  readonly recordCount: number;
  readonly wireCount: number;
  readonly wireBytes: number;
}

function assertStoreScope(state: DurableRecordState): void {
  if ((state.tombstones?.length ?? 0) !== 0 || (state.retirements?.length ?? 0) !== 0) {
    throw new Error('BUSTER_HISTORICAL_STORE_UNSUPPORTED');
  }
}

function assertImportedPayload(payload: unknown, sequence: number, descriptor: HistoricalImportDescriptor, importId: string) {
  if ((payload as { schemaVersion?: unknown }).schemaVersion === 'buster-plan-job-imported-terminal.v2') {
    assertImportedTerminalPlanJobRecord(payload);
    if (payload.historical.importId !== importId || payload.historical.sequence !== sequence
      || payload.historical.originalStoreDigest !== descriptor.originalStoreDigest) throw new Error('BUSTER_HISTORICAL_RECORD_INVALID');
  } else {
    if ((payload as {schemaVersion?: unknown}).schemaVersion !== 'buster-plan-job-record.v2') throw new Error('BUSTER_HISTORICAL_RECORD_INVALID');
    assertPreparedPlanJobRecord(payload);
    if (payload.input.schemaVersion !== 'buster-historical-input.v1' || payload.input.importId !== importId
      || payload.input.sequence !== sequence || payload.source !== null) throw new Error('BUSTER_HISTORICAL_RECORD_INVALID');
    if (payload.resultOrigin?.kind === 'historical'
      && payload.resultOrigin.originalStoreDigest !== descriptor.originalStoreDigest) throw new Error('BUSTER_RESULT_ORIGIN_INVALID');
  }
  return payload;
}

/** Shared decoder composition for the one immutable import candidate. */
export function validateHistoricalImportBatch(state: DurableRecordState, descriptor: HistoricalImportDescriptor,
  importId: string): void {
  assertHistoricalImportDescriptor(descriptor);
  assertDurableRecordReplay(state);
  assertStoreScope(state);
  if (typeof importId !== 'string' || !/^[a-f0-9]{32}$/u.test(importId)) throw new Error('BUSTER_HISTORICAL_STORE_UNSUPPORTED');
  for (const [index, record] of state.records.entries()) {
    if (record.stream !== 'buster-plan-jobs' || record.sequence !== index + 1) throw new Error('BUSTER_HISTORICAL_STORE_UNSUPPORTED');
    const payload = assertImportedPayload(record.payload, record.sequence, descriptor, importId);
    if (record.idempotencyKey !== payload.job.idempotencyKey) throw new Error('BUSTER_HISTORICAL_RECORD_INVALID');
  }
}

function validateOriginal(payload: StoredPlanJob, context: HistoricalBatchContext): void {
  if (payload.schemaVersion === 'buster-plan-job-compacted-record.v1') {
    assertCompactedPlanJobRecord(payload);
    assertPreparedHeader(payload.job);
  } else {
    if (payload.schemaVersion !== 'buster-plan-job-record.v1'
      || Object.keys(payload).sort().join(',') !== 'job,schemaVersion,status') throw new Error('BUSTER_HISTORICAL_RECORD_INVALID');
    validatePipelineTestGateContract('remotePlanJob', payload.job);
    if (remotePlanJobDigest(payload.job) !== payload.job.requestDigest) throw new Error('BUSTER_HISTORICAL_REQUEST_INVALID');
    assertPreparedHeader(preparedPlanHeader(payload.job));
  }
  validatePipelineTestGateContract('remotePlanStatus', payload.status);
  if (payload.status.jobId !== payload.job.jobId || payload.status.requestDigest !== payload.job.requestDigest
    || !verifySourceSnapshotAttestation(payload.job.sourceSnapshot, context.trustedSourceAuthority,
      context.sourceAttestationPublicKey)) throw new Error('BUSTER_HISTORICAL_RECORD_INVALID');
}

function stagedInput(job: RemotePlanJobV1, wire: Buffer, sequence: number, originalPayloadDigest: string,
  context: HistoricalBatchContext): HistoricalStagedAdmission {
  const header = preparedPlanHeader(job);
  const staged: HistoricalStagedAdmission = { job: header, input: {
    schemaVersion: 'buster-historical-input.v1', importId: context.importId, sequence, originalPayloadDigest,
    preparationUid: context.preparationUid, attemptSpecDigest: context.attemptSpecDigest,
    jobId: job.jobId, requestDigest: job.requestDigest, headerDigest: preparationDigest(header),
    wireDigest: wireDigest(wire), wireBytes: wire.length,
  } };
  assertHistoricalInput(staged.input, staged.job);
  if (wire.length > context.settings.maximumRequestBytes || job.repositoryArchive.sizeBytes > context.settings.maximumArchiveBytes
    || Buffer.byteLength(JSON.stringify(header)) > context.settings.maximumHeaderBytes
    || Buffer.byteLength(JSON.stringify(staged)) > context.settings.maximumResultBytes) {
    throw new Error('BUSTER_HISTORICAL_INPUT_LIMIT');
  }
  return staged;
}

function readOwnedSnapshot(bytes: Buffer, context: HistoricalBatchContext): DurableRecordState {
  assertPreparationSlot(context.preparationUid);
  if (process.getuid?.() !== context.preparationUid || process.getgid?.() !== context.preparationUid) {
    throw new Error('BUSTER_HISTORICAL_OWNED_HOST_REQUIRED');
  }
  assertHistoricalImportDescriptor(context.descriptor);
  if (bytes.length !== context.descriptor.originalStoreBytes || wireDigest(bytes) !== context.descriptor.originalStoreDigest
    || bytes.length > context.settings.maximumSourceBytes) throw new Error('BUSTER_HISTORICAL_SOURCE_CHANGED');
  const state = JSON.parse(bytes.toString('utf8')) as DurableRecordState;
  assertDurableRecordReplay(state);
  assertStoreScope(state);
  if (state.records.length > context.settings.maximumRecords) throw new Error('BUSTER_HISTORICAL_STORE_UNSUPPORTED');
  return state;
}

/** Exactly one V1 JSON parse, only in the real assigned preparation identity.
 * The callback must reserve and durably stage before returning; no per-job store API. */
export async function transformHistoricalSnapshot(bytes: Buffer, input: HistoricalBatchContext,
  stage: (staged: HistoricalStagedAdmission, wire: Buffer) => Promise<void>): Promise<HistoricalBatch> {
  const context = structuredClone(input);
  const state = readOwnedSnapshot(bytes, context);
  let wireCount = 0;
  let wireBytes = 0;
  for (const [index, record] of state.records.entries()) {
    if (record.stream !== 'buster-plan-jobs' || record.sequence !== index + 1) throw new Error('BUSTER_HISTORICAL_STORE_UNSUPPORTED');
    const original = record.payload as StoredPlanJob;
    validateOriginal(original, context);
    if (record.idempotencyKey !== original.job.idempotencyKey) throw new Error('BUSTER_HISTORICAL_RECORD_INVALID');
    const resultOrigin = original.status.state === 'completed' ? {
      kind: 'historical' as const, importId: context.importId,
      originalStoreDigest: context.descriptor.originalStoreDigest, originalPayloadDigest: record.payloadDigest,
    } : null;
    let payload: unknown;
    if (original.schemaVersion === 'buster-plan-job-compacted-record.v1') {
      const terminal: ImportedTerminalPlanJobRecord = {
        schemaVersion: 'buster-plan-job-imported-terminal.v2', job: original.job, input: null, source: null,
        status: original.status, resultOrigin, historical: { schemaVersion: 'buster-historical-record.v1',
          importId: context.importId, sequence: record.sequence, originalPayloadDigest: record.payloadDigest,
          originalStoreDigest: context.descriptor.originalStoreDigest, compaction: original.compaction },
      };
      assertImportedTerminalPlanJobRecord(terminal);
      payload = terminal;
    } else {
      const wire = Buffer.from(JSON.stringify(original.job));
      const staged = stagedInput(original.job, wire, record.sequence, record.payloadDigest, context);
      await stage(staged, wire);
      wireCount += 1;
      wireBytes += wire.length;
      if (!Number.isSafeInteger(wireBytes)) throw new Error('BUSTER_HISTORICAL_INPUT_LIMIT');
      payload = { schemaVersion: 'buster-plan-job-record.v2', ...staged, source: null, status: original.status, resultOrigin };
    }
    state.records[index] = { ...record, payload, payloadDigest: payloadDigest(payload) };
  }
  validateHistoricalImportBatch(state, context.descriptor, context.importId);
  if (Buffer.byteLength(canonicalJson(state)) > context.settings.maximumMetadataBytes) {
    throw new Error('BUSTER_HISTORICAL_METADATA_LIMIT');
  }
  return { state, recordCount: state.records.length, wireCount, wireBytes };
}
