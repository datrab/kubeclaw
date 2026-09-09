import crypto from 'node:crypto';
import {canonicalJson} from '@kubeclaw/pipeline-observability-contract';
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
export interface DurableRecord<T = unknown> {
  readonly schemaVersion: "pipeline-durable-record.v1" | "pipeline-durable-record.v2";
  readonly owner?: string;
  readonly stream: string;
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly committedAt: string;
  readonly payloadDigest: string;
  readonly payload: T;
}

export interface DurableRecordState {
  readonly schemaVersion: "pipeline-durable-record-store.v1" | "pipeline-durable-record-store.v2";
  readonly records: DurableRecord[];
  readonly tombstones?: RecordTombstone[];
  readonly retirements?: RecordRetirement[];
}
export interface RecordRetirementIntent {
  readonly operationId: string;
  readonly actor: string;
  readonly owner: string;
  readonly stream: string;
  readonly records: readonly { readonly idempotencyKey: string; readonly payloadDigest: string }[];
  readonly evidence: Readonly<Record<string, unknown>>;
}
export interface RecordRetirement {
  readonly intent: RecordRetirementIntent;
  readonly intentDigest: string;
  readonly releasedBytesHex: string;
}
export interface RecordTombstone extends Omit<DurableRecord, 'payload'> {
  readonly retirementId: string;
}

export function payloadDigest(payload: unknown): string {
  return `sha256:${crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex")}`;
}

export function ownerValid(owner: unknown): owner is string {
  return typeof owner === 'string' && owner.length > 0 && owner.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(owner);
}
function recordHeaderValid(record: Omit<DurableRecord, 'payload'>): boolean {
  return (record.schemaVersion === 'pipeline-durable-record.v1' && record.owner === undefined
    || record.schemaVersion === 'pipeline-durable-record.v2' && ownerValid(record.owner))
    && IDENTITY.test(record.stream) && IDENTITY.test(record.idempotencyKey)
    && Number.isSafeInteger(record.sequence) && record.sequence > 0
    && typeof record.committedAt === 'string' && DIGEST.test(record.payloadDigest);
}
export function assertRetirementIntent(intent: RecordRetirementIntent): void {
  if (!intent || Object.keys(intent).sort().join(',') !== 'actor,evidence,operationId,owner,records,stream'
    || !IDENTITY.test(intent.operationId) || !ownerValid(intent.actor) || !ownerValid(intent.owner)
    || !IDENTITY.test(intent.stream) || !Array.isArray(intent.records) || !intent.records.length
    || !intent.evidence || typeof intent.evidence !== 'object' || Array.isArray(intent.evidence)) throw new Error('DURABLE_RETIREMENT_INTENT_INVALID');
  assertRetirementSelection(intent.records);
}
function assertRetirementSelection(records: RecordRetirementIntent['records']): void {
  const ids = new Set<string>();
  for (const item of records) {
    if (!item || Object.keys(item).sort().join(',') !== 'idempotencyKey,payloadDigest'
      || !IDENTITY.test(item.idempotencyKey) || !DIGEST.test(item.payloadDigest) || ids.has(item.idempotencyKey)) throw new Error('DURABLE_RETIREMENT_INTENT_INVALID');
    ids.add(item.idempotencyKey);
  }
}
function assertStoreFormat(state: DurableRecordState): void {
  if (!state || !Array.isArray(state.records)) throw new Error('DURABLE_RECORD_STORE_INVALID');
  const v2 = state.schemaVersion === 'pipeline-durable-record-store.v2';
  if (v2 ? !Array.isArray(state.tombstones) || !Array.isArray(state.retirements)
    : state.schemaVersion !== 'pipeline-durable-record-store.v1' || state.tombstones !== undefined || state.retirements !== undefined) throw new Error('DURABLE_RECORD_STORE_INVALID');
 }
export function assertDurableRecordReplay(state: DurableRecordState): void {
  assertStoreFormat(state);
  for (const record of state.records) {
    if (!recordHeaderValid(record) || !Object.hasOwn(record, 'payload') || payloadDigest(record.payload) !== record.payloadDigest) throw new Error('DURABLE_RECORD_STORE_INVALID');
  }
  assertRetiredRecords(state);
  assertRecordSequences(state);
}
function assertRetiredRecords(state: DurableRecordState): void {
  const retirements = new Map<string, RecordRetirement>();
  for (const entry of state.retirements ?? []) {
    assertRetirementIntent(entry.intent);
    if (entry.intentDigest !== payloadDigest(entry.intent) || retirements.has(entry.intent.operationId)
      || !/^[a-f0-9]{16}$/u.test(entry.releasedBytesHex) || !Number.isSafeInteger(Number.parseInt(entry.releasedBytesHex,16)) || Number.parseInt(entry.releasedBytesHex,16) < 1) throw new Error('DURABLE_RETIREMENT_INVALID');
    retirements.set(entry.intent.operationId, entry);
  }
  for (const record of state.tombstones ?? []) assertTombstone(record, retirements);
  for (const retirement of retirements.values()) {
    if (state.tombstones!.filter(record => record.retirementId === retirement.intent.operationId).length !== retirement.intent.records.length) throw new Error('DURABLE_TOMBSTONE_INCOMPLETE');
  }
}
function assertTombstone(record: RecordTombstone, retirements: Map<string, RecordRetirement>): void {

    const retirement = retirements.get(record.retirementId);
    if (!recordHeaderValid(record) || record.schemaVersion !== 'pipeline-durable-record.v2' || Object.hasOwn(record, 'payload')
      || !retirement || record.stream !== retirement.intent.stream || record.owner !== retirement.intent.owner
      || !retirement.intent.records.some(item => item.idempotencyKey === record.idempotencyKey && item.payloadDigest === record.payloadDigest)) throw new Error('DURABLE_TOMBSTONE_INVALID');
 }
function assertRecordSequences(state: DurableRecordState): void {
  const sequences = new Map<string, number>(); const identities = new Set<string>();
  const v2 = state.schemaVersion === 'pipeline-durable-record-store.v2';
  const activeSequences = new Map<string, number>();
  for (const record of state.records) {
    if (record.sequence <= (activeSequences.get(record.stream) ?? 0)) throw new Error('DURABLE_RECORD_SEQUENCE_INVALID');
    activeSequences.set(record.stream, record.sequence);
  }
  const all = v2 ? [...state.records, ...state.tombstones!].sort((a,b) => a.sequence - b.sequence) : state.records;
  for (const record of all) {
    const expected = (sequences.get(record.stream) ?? 0) + 1;
    if (record.sequence !== expected) throw new Error('DURABLE_RECORD_SEQUENCE_INVALID');
    sequences.set(record.stream, record.sequence);
    const key = `${record.stream}|${record.idempotencyKey}`;
    if (identities.has(key)) throw new Error('DURABLE_RECORD_IDENTITY_DUPLICATE');
    identities.add(key);
  }
}

export function existingRecord<T>(state: DurableRecordState, stream: string, idempotencyKey: string, digest: string, snapshot: T, owner?: string): DurableRecord<T> | undefined {
      const existing = state.records.find(
        (record) => record.stream === stream && record.idempotencyKey === idempotencyKey,
      );
      if (existing) {
        if (existing.payloadDigest !== digest || (existing.schemaVersion === "pipeline-durable-record.v2" && existing.owner !== owner)) throw new Error("DURABLE_RECORD_IDEMPOTENCY_CONFLICT");
        return structuredClone(existing) as DurableRecord<T>;
      }
      const retired = state.tombstones?.find(record => record.stream === stream && record.idempotencyKey === idempotencyKey);
      if (retired) {
        if (retired.payloadDigest !== digest || retired.owner !== owner) throw new Error('DURABLE_RECORD_IDEMPOTENCY_CONFLICT');
        const { retirementId: _retirementId, ...header } = retired;
        return { ...header, payload: snapshot } as DurableRecord<T>;
      }
      return undefined;
}
