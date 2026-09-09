import { assertAdmissionRetiredEntry } from './admission-retirement.ts';
import fs from 'node:fs/promises';
import {
  canonicalJson,
  decodePipelineObservabilityContract,
  validatePipelineObservabilityContract,
} from '@kubeclaw/pipeline-observability-contract';
import type { AdmissionState, AdmissionStoreLimits } from './durable-delivery.ts';

export function replayAssert(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`OBSERVABILITY_REPLAY_INVALID:${reason}`);
}
export function replayObject(value: unknown, keys: readonly string[], reason: string): asserts value is Record<string, unknown> {
  replayAssert(value !== null && typeof value === 'object' && !Array.isArray(value), reason);
  replayAssert(Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)), reason);
}
export function replayTimestamp(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
export function replayIdentity(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 512;
}
export function replayUnique(keys: Set<string>, key: string, reason: string): void {
  replayAssert(!keys.has(key), reason); keys.add(key);
}
export async function readBoundedSnapshot(file: string, maximumBytes: number): Promise<string> {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    replayAssert(stat.isFile() && stat.size <= maximumBytes, 'snapshot-size');
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      replayAssert(read.bytesRead > 0, 'snapshot-truncated'); offset += read.bytesRead;
    }
    const extra = await handle.read(Buffer.alloc(1), 0, 1, offset);
    replayAssert(extra.bytesRead === 0, 'snapshot-grew');
    return bytes.toString('utf8');
  } finally { await handle.close(); }
}

function admissionEntry(entry: AdmissionState['entries'][number], cursor: number, keys: Set<string>, maximumIngressBytes: number): void {
  replayObject(entry, ['key', 'record', 'bytes', 'canonicalCursor', 'admittedAt'], 'admission-entry');
  validatePipelineObservabilityContract('producerRecord', entry.record);
  replayAssert(typeof entry.bytes === 'string' && Buffer.byteLength(entry.bytes) <= maximumIngressBytes, 'admission-bytes');
  const decoded = decodePipelineObservabilityContract('producerRecord', entry.bytes);
  replayAssert(canonicalJson(decoded) === canonicalJson(entry.record), 'admission-wire-record-mismatch');
  const { producer, correlation, sequence } = entry.record;
  const key = [producer.producerId, producer.bootId, producer.producerType, correlation.pipelineRunId, String(sequence)].join('|');
  replayAssert(entry.key === key && entry.canonicalCursor === cursor && replayTimestamp(entry.admittedAt), 'admission-identity-cursor');
  replayUnique(keys, key, 'admission-duplicate-identity');
}
function admissionGaps(state: AdmissionState): void {
  const keys = new Set<string>();
  for (const gap of state.gaps) {
    validatePipelineObservabilityContract('gapReport', gap);
    replayUnique(keys, canonicalJson([gap.producer, gap.pipelineRunId, gap.fromSequence, gap.toSequence]), 'admission-gap-duplicate');
    if (gap.state !== 'restored') continue;
    const headers = [...state.entries.map(({record})=>record),...(state.retiredEntries??[]).map(({acknowledgement:a})=>({producer:a.producer,sequence:a.sequence,correlation:{pipelineRunId:a.pipelineRunId}}))];
    const sequences = new Set(headers.filter(record => record.correlation.pipelineRunId === gap.pipelineRunId
      && canonicalJson(record.producer) === canonicalJson(gap.producer)
      && record.sequence >= gap.fromSequence && record.sequence <= gap.toSequence).map(record => record.sequence));
    replayAssert(sequences.size === gap.toSequence - gap.fromSequence + 1, 'admission-gap-restoration');
  }
}
function admissionIssues(state: AdmissionState): void {
  admissionGaps(state);
  for (const item of [...state.unresolvedItems, ...state.overflowUnresolvedItems]) {
    replayObject(item, ['itemId', 'kind', 'producer', 'subjectId', 'reasonCode', 'pipelineRunId'], 'admission-unresolved-item');
    replayAssert(replayIdentity(item.pipelineRunId), 'admission-unresolved-run');
    const { pipelineRunId, ...unresolved } = item;
    validatePipelineObservabilityContract('observabilityCompleteness', {
      schemaVersion: 'observability-completeness.v1', pipelineRunId, state: 'partial', requiredClosureIds: [], admittedClosureIds: [],
      missingClosureIds: [], missingRanges: [], unresolvedItems: [unresolved], evaluatedAt: '2026-01-01T00:00:00Z',
    });
  }
}
function admissionQuarantine(state: AdmissionState, limits: AdmissionStoreLimits): void {
  replayAssert(state.quarantine.length <= limits.maximumQuarantineRecords && Buffer.byteLength(canonicalJson(state.quarantine)) <= limits.maximumQuarantineBytes, 'admission-quarantine-size');
  for (const entry of state.quarantine) {
    replayObject(entry, ['quarantineId', 'receivedAt', 'reason', 'rawBase64'], 'admission-quarantine');
    replayAssert(replayIdentity(entry.quarantineId) && replayTimestamp(entry.receivedAt) && typeof entry.reason === 'string', 'admission-quarantine-metadata');
    replayAssert(typeof entry.rawBase64 === 'string' && Buffer.from(entry.rawBase64, 'base64').toString('base64') === entry.rawBase64, 'admission-quarantine-bytes');
  }
  const overflow = state.quarantineOverflow;
  if (overflow === null) return;
  replayObject(overflow, ['count', 'lastReceivedAt', 'lastReason', 'lastRawDigest', 'lastRawBytes'], 'admission-overflow');
  replayAssert(Number.isSafeInteger(overflow.count) && overflow.count > 0 && replayTimestamp(overflow.lastReceivedAt), 'admission-overflow-metadata');
  replayAssert(typeof overflow.lastReason === 'string' && /^sha256:[a-f0-9]{64}$/.test(overflow.lastRawDigest) && Number.isSafeInteger(overflow.lastRawBytes) && overflow.lastRawBytes >= 0, 'admission-overflow-digest');
}
export function assertAdmissionReplay(state: AdmissionState, limits: AdmissionStoreLimits): void {
  replayObject(state, ['schemaVersion', 'nextCursor', 'entries', 'quarantine', 'quarantineOverflow', 'gaps', 'unresolvedItems', 'overflowUnresolvedItems',...(state.schemaVersion === 'observability-admission-store.v2'?['retiredEntries']:[])], 'admission-envelope');
  replayAssert(state.schemaVersion === 'observability-admission-store.v1' || state.schemaVersion === 'observability-admission-store.v2', 'admission-version');
  for (const field of ['entries', 'quarantine', 'gaps', 'unresolvedItems', 'overflowUnresolvedItems'] as const) replayAssert(Array.isArray(state[field]), `admission-${field}`);
  replayAssert(state.schemaVersion !== 'observability-admission-store.v2' || Array.isArray(state.retiredEntries),'admission-retired-entries');
  const retired=state.retiredEntries??[];
  replayAssert(state.entries.length <= limits.maximumRecords && state.nextCursor === state.entries.length + retired.length + 1, 'admission-next-cursor');
  const keys = new Set<string>();
  state.entries.forEach((entry, index) => {
    admissionEntry(entry, state.schemaVersion==='observability-admission-store.v1'?index+1:entry.canonicalCursor, keys, limits.maximumIngressBytes);
    replayAssert(index===0 || entry.canonicalCursor>state.entries[index-1]!.canonicalCursor,'admission-active-order');
  });
  const operations=new Set<string>();
  for(const entry of retired){assertAdmissionRetiredEntry(entry);replayUnique(keys,entry.key,'admission-duplicate-identity');replayUnique(operations,entry.operationId,'admission-retirement-operation');}
  const cursors=[...state.entries.map(entry=>entry.canonicalCursor),...retired.map(entry=>entry.acknowledgement.canonicalCursor)].sort((a,b)=>a-b);
  replayAssert(cursors.every((cursor,index)=>cursor===index+1),'admission-cursor-coverage');
  admissionQuarantine(state, limits); admissionIssues(state);
}
