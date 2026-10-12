import { assertPreparedResultOrigin, type PreparedResultOrigin } from './preparation-result-origin.ts';
import { assertPreparedHeader, type PreparedPlanJob } from './preparation-header.ts';
import { assertCompactedPlanJobRecord, type CompactionReceipt } from './remote-plan-compaction.ts';
import type { RemotePlanStatusV1 } from '@kubeclaw/pipeline-test-gate-contract';

export interface ImportedTerminalPlanJobRecord {
  readonly schemaVersion: 'buster-plan-job-imported-terminal.v2';
  readonly job: PreparedPlanJob;
  readonly input: null;
  readonly source: null;
  readonly status: RemotePlanStatusV1;
  readonly resultOrigin: PreparedResultOrigin;
  readonly historical: {
    readonly schemaVersion: 'buster-historical-record.v1';
    readonly importId: string;
    readonly sequence: number;
    readonly originalPayloadDigest: string;
    readonly originalStoreDigest: string;
    readonly compaction: CompactionReceipt;
  };
}

/** A completed compacted record has no archive wire and cannot become executable. */
export function assertImportedTerminalPlanJobRecord(value: unknown): asserts value is ImportedTerminalPlanJobRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'historical,input,job,resultOrigin,schemaVersion,source,status') {
    throw new Error('BUSTER_HISTORICAL_TERMINAL_INVALID');
  }
  const record = value as ImportedTerminalPlanJobRecord;
  const original = record.historical;
  if (record.schemaVersion !== 'buster-plan-job-imported-terminal.v2' || record.input !== null || record.source !== null
    || !original || Object.keys(original).sort().join(',') !== 'compaction,importId,originalPayloadDigest,originalStoreDigest,schemaVersion,sequence'
    || original.schemaVersion !== 'buster-historical-record.v1' || !matches(original.importId, /^[a-f0-9]{32}$/u)
    || !Number.isSafeInteger(original.sequence) || original.sequence < 1
    || ![original.originalPayloadDigest, original.originalStoreDigest].every(item => matches(item, /^sha256:[a-f0-9]{64}$/u))) {
    throw new Error('BUSTER_HISTORICAL_TERMINAL_INVALID');
  }
  assertTerminalOrigin(record);
  assertPreparedHeader(record.job);
  assertCompactedPlanJobRecord({ schemaVersion: 'buster-plan-job-compacted-record.v1',
    job: record.job, status: record.status, compaction: original.compaction });
}

function assertTerminalOrigin(record: ImportedTerminalPlanJobRecord): void {
  const original = record.historical;
  assertPreparedResultOrigin(record.resultOrigin, record.status);
  const origin = record.resultOrigin;
  if (!origin || origin.kind !== 'historical' || origin.importId !== original.importId
    || origin.originalStoreDigest !== original.originalStoreDigest
    || origin.originalPayloadDigest !== original.originalPayloadDigest) throw new Error('BUSTER_RESULT_ORIGIN_INVALID');
}

function matches(value: unknown, pattern: RegExp): boolean {
  return typeof value === 'string' && pattern.test(value);
}
