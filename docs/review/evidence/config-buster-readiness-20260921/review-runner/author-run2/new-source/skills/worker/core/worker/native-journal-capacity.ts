import { canonicalJson } from '@kubeclaw/pipeline-worker-core-contract';
import { assertDurableRecordReplay, type DurableRecord, type DurableRecordState } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { readDurableState } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import { nativeJournalMaximumDiagnosticUnits, validateJournalState, type NativeAttemptJournalLimits, type NativeAttemptJournalState } from './native-journal-state.ts';

export const nativeJournalStream = 'native-worker-attempts.v1';
export const nativeJournalMaximumRecordBytes = 65536;
const maximumInteger = Number.MAX_SAFE_INTEGER;
const maximumDate = '+275760-09-13T00:00:00.000Z';
const digest = `sha256:${'0'.repeat(64)}`;
const diagnostic = '\u0000'.repeat(nativeJournalMaximumDiagnosticUnits);

function futurePayload(payload: NativeAttemptJournalState, limits: NativeAttemptJournalLimits) {
  if (payload.result !== null) return payload;
  // Per-field envelopes intentionally allow both output references their full
  // limit; no synthetic output, observations or diagnostics are ever persisted.
  const output = { digest, sizeBytes: limits.maximumOutputBytes };
  return { ...payload, process: payload.process ?? {
    schemaVersion: 'worker-native-process-result.v1', stdout: output, stderr: output,
    exitCode: null, signal: diagnostic, fault: diagnostic,
    resources: { unit: 'linux-tasks', cpuTimeMicroseconds: maximumInteger,
      maximumMemoryBytes: maximumInteger, maximumTasks: maximumInteger,
      populated: false, oomKills: maximumInteger, taskLimitHits: maximumInteger },
  }, processCompletedAt: payload.processCompletedAt ?? maximumDate,
  result: { digest, sizeBytes: limits.maximumResultBytes } };
}

function futureRecordBytes(record: DurableRecord, limits: NativeAttemptJournalLimits): number {
  const actual = Buffer.byteLength(canonicalJson(record));
  if (record.stream !== nativeJournalStream) return actual;
  validateJournalState(record.payload);
  if (record.payload.result !== null) return actual;
  const payload = futurePayload(record.payload, limits);
  if (Buffer.byteLength(canonicalJson(payload)) > nativeJournalMaximumRecordBytes) {
    throw new Error('WORKER_NATIVE_JOURNAL_METADATA_CAPACITY_EXCEEDED');
  }
  return Math.max(actual, Buffer.byteLength(canonicalJson({ ...record,
    committedAt: maximumDate, payloadDigest: digest, payload })));
}

/** Real durable-store framing, including retained foreign rows/retirement data.
 * Caller holds the journal admission fence; serialize only one projected row at
 * a time and stop at the existing ceiling. Historical rows are not rewritten. */
export function nativeJournalTerminalMetadataBytes(state: DurableRecordState,
  limits: NativeAttemptJournalLimits): number {
  let total = Buffer.byteLength(canonicalJson({ ...state, records: [] }));
  for (const [index, record] of state.records.entries()) {
    const bytes = futureRecordBytes(record, limits) + (index === 0 ? 0 : 1);
    if (bytes > limits.maximumStateBytes - total) throw new Error('WORKER_NATIVE_JOURNAL_METADATA_CAPACITY_EXCEEDED');
    total += bytes;
  }
  if (total > limits.maximumStateBytes) throw new Error('WORKER_NATIVE_JOURNAL_METADATA_CAPACITY_EXCEEDED');
  return total;
}

/** Check before the journal writes an input blob or accepts a new identity. */
export async function reserveNativeJournalMetadata(file: string, payload: NativeAttemptJournalState,
  idempotencyKey: string, owner: string, limits: NativeAttemptJournalLimits): Promise<void> {
  const state = await readDurableState<DurableRecordState>(file,
    { schemaVersion: 'pipeline-durable-record-store.v1', records: [] }, limits.maximumStateBytes);
  assertDurableRecordReplay(state);
  const sequence = state.records.filter(row => row.stream === nativeJournalStream).length
    + (state.tombstones?.filter(row => row.stream === nativeJournalStream).length ?? 0) + 1;
  const record: DurableRecord = { schemaVersion: 'pipeline-durable-record.v2', owner,
    stream: nativeJournalStream, sequence, idempotencyKey, committedAt: maximumDate,
    payloadDigest: digest, payload };
  nativeJournalTerminalMetadataBytes({ ...state, schemaVersion: 'pipeline-durable-record-store.v2',
    records: [...state.records, record], tombstones: state.tombstones ?? [], retirements: state.retirements ?? [] }, limits);
}
