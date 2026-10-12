export { FileDurableBlobStore, type DurableBlobStore } from './durable-blobs.ts';
import { readStoreRecords, withRetainedStoreFence } from './durable-record-dependency.ts';
import {assertDurableRecordReplay, assertRetirementIntent, payloadDigest, ownerValid, existingRecord,
  type DurableRecord, type DurableRecordState, type RecordRetirementIntent, type RecordRetirement} from './record-retirement.ts';
export {assertDurableRecordReplay} from './record-retirement.ts';
export type {DurableRecord, DurableRecordState, RecordRetirementIntent, RecordRetirement, RecordTombstone} from './record-retirement.ts';
import path from "node:path";
import { canonicalJson } from "@kubeclaw/pipeline-observability-contract";
import {
  readDurableState,
  withDurableStoreLock,
  writeDurableState,
} from "./durable-delivery.ts";

export interface DurableRecordLimits {
  readonly maximumRecords: number;
  readonly maximumBytes: number;
  readonly maximumRecordBytes: number;
}

export interface DurableRecordStore {
  append<T>(stream: string, idempotencyKey: string, payload: T, owner?: string): Promise<{
    readonly appended: boolean;
    readonly record: DurableRecord<T>;
  }>;
  transition<T>(stream: string, idempotencyKey: string, expectedPayloadDigest: string, payload: T): Promise<DurableRecord<T>>;
  read<T>(stream: string): Promise<ReadonlyArray<DurableRecord<T>>>;
}

const EMPTY_STATE: DurableRecordState = {
  schemaVersion: "pipeline-durable-record-store.v1",
  records: [],
};
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function positiveInteger(value: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(code);
}

function identity(value: string, code: string): void {
  if (!IDENTITY.test(value)) throw new Error(code);
}


export class FileDurableRecordStore implements DurableRecordStore {
  readonly #file: string;
  readonly #limits: DurableRecordLimits;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(root: string, limits: DurableRecordLimits) {
    positiveInteger(limits.maximumRecords, "DURABLE_RECORD_LIMIT_INVALID");
    positiveInteger(limits.maximumBytes, "DURABLE_RECORD_LIMIT_INVALID");
    positiveInteger(limits.maximumRecordBytes, "DURABLE_RECORD_LIMIT_INVALID");
    this.#file = path.join(path.resolve(root), "records", "store.json");
    this.#limits = limits;
  }

  #serial<T>(operation: () => Promise<T>): Promise<T> {
    const locked = () => withDurableStoreLock(this.#file, operation);
    const result = this.#queue.then(locked, locked);
    this.#queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async append<T>(stream: string, idempotencyKey: string, payload: T, owner?: string): Promise<{
    readonly appended: boolean;
    readonly record: DurableRecord<T>;
  }> {
    identity(stream, "DURABLE_RECORD_STREAM_INVALID");
    identity(idempotencyKey, "DURABLE_RECORD_IDEMPOTENCY_KEY_INVALID");
    if (owner !== undefined && !ownerValid(owner)) throw new Error("DURABLE_RECORD_OWNER_INVALID");
    const snapshot = JSON.parse(canonicalJson(payload)) as T;
    const digest = payloadDigest(snapshot);
    if (Buffer.byteLength(canonicalJson(snapshot)) > this.#limits.maximumRecordBytes)
      throw new Error("DURABLE_RECORD_SIZE_EXCEEDED");
    return this.#serial(async () => {
      const state = await readDurableState(this.#file, EMPTY_STATE, this.#limits.maximumBytes);
      assertDurableRecordReplay(state);
      const duplicate = existingRecord(state, stream, idempotencyKey, digest, snapshot, owner);
      if (duplicate) return { appended: false, record: duplicate };
      if (state.records.length >= this.#limits.maximumRecords)
        throw new Error("DURABLE_RECORD_STORE_FULL");
      const record: DurableRecord<T> = {
        schemaVersion: owner === undefined ? "pipeline-durable-record.v1" : "pipeline-durable-record.v2",
        ...(owner === undefined ? {} : { owner }),
        stream,
        sequence: state.records.filter((entry) => entry.stream === stream).length + (state.tombstones?.filter(entry => entry.stream === stream).length ?? 0) + 1,
        idempotencyKey,
        committedAt: new Date().toISOString(),
        payloadDigest: digest,
        payload: snapshot,
      };
      const candidate: DurableRecordState = owner === undefined ? { ...state, records: [...state.records, record] }
        : { ...state, schemaVersion: 'pipeline-durable-record-store.v2', records: [...state.records, record], tombstones: state.tombstones ?? [], retirements: state.retirements ?? [] };
      if (Buffer.byteLength(canonicalJson(candidate)) > this.#limits.maximumBytes)
        throw new Error("DURABLE_RECORD_STORE_FULL");
      await writeDurableState(this.#file, candidate);
      return { appended: true, record: structuredClone(record) };
    });
  }

  async read<T>(stream: string): Promise<ReadonlyArray<DurableRecord<T>>> {
    return this.withRecords<T, ReadonlyArray<DurableRecord<T>>>(stream, async records => records);
  }

  /** Domain owners may inspect records while holding this store's writer fence.
   * Never reenter this store from operation; acquire other stores in a fixed order. */
  async withRecords<T, R>(stream: string, operation: (records: ReadonlyArray<DurableRecord<T>>) => Promise<R>): Promise<R> {
    identity(stream, "DURABLE_RECORD_STREAM_INVALID");
    return this.#serial(async () => operation(await readStoreRecords<T>(this.#file, this.#limits.maximumBytes, stream)));
  }

  async retirements(stream: string): Promise<readonly RecordRetirement[]> {
    identity(stream, 'DURABLE_RECORD_STREAM_INVALID');
    return this.#serial(async () => {
      const state = await readDurableState(this.#file, EMPTY_STATE, this.#limits.maximumBytes); assertDurableRecordReplay(state);
      return structuredClone((state.retirements ?? []).filter(entry => entry.intent.stream === stream));
    });
  }

  /** Caller holds its domain fence; authorize runs again inside the real store writer fence. */
  async retire(intentInput: RecordRetirementIntent, authorize: (records: readonly DurableRecord[]) => Promise<void>): Promise<RecordRetirement & { readonly newlyRetired: boolean; readonly releasedBytes: number }> {
    const intent = JSON.parse(canonicalJson(intentInput)) as RecordRetirementIntent; assertRetirementIntent(intent);
    const intentDigest = payloadDigest(intent);
    return this.#serial(async () => {
      const state = await readDurableState(this.#file, EMPTY_STATE, this.#limits.maximumBytes); assertDurableRecordReplay(state);
      const previous = state.retirements?.find(item => item.intent.operationId === intent.operationId);
      if (previous) {
        if (previous.intentDigest !== intentDigest) throw new Error('DURABLE_RETIREMENT_CONFLICT');
        await authorize([]);
        return { ...structuredClone(previous), newlyRetired: false, releasedBytes: Number.parseInt(previous.releasedBytesHex,16) };
      }
      const selected = intent.records.map(item => {
        const record = state.records.find(entry => entry.stream === intent.stream && entry.idempotencyKey === item.idempotencyKey);
        if (!record || record.schemaVersion !== 'pipeline-durable-record.v2' || record.owner !== intent.owner
          || record.payloadDigest !== item.payloadDigest) throw new Error('DURABLE_RETIREMENT_RECORD_CHANGED');
        return record;
      });
      await authorize(structuredClone(selected));
      const selectedIds = new Set(selected.map(record => record.idempotencyKey));
      const retirement = { intent, intentDigest, releasedBytesHex: '0000000000000000' };
      const candidate: DurableRecordState = {
        schemaVersion: 'pipeline-durable-record-store.v2',
        records: state.records.filter(record => record.stream !== intent.stream || !selectedIds.has(record.idempotencyKey)),
        tombstones: [...state.tombstones ?? [], ...selected.map(record => {
          const { payload: _payload, ...header } = record; return { ...header, retirementId: intent.operationId };
        })], retirements: [...state.retirements ?? [], retirement],
      };
      const before = Buffer.byteLength(canonicalJson(state));
      // Fixed-width hex avoids a self-referential decimal digit-count equation.
      const releasedBytes = before - Buffer.byteLength(canonicalJson(candidate));
      if (releasedBytes < 1) throw new Error('DURABLE_RETIREMENT_NO_SAVING');
      retirement.releasedBytesHex = releasedBytes.toString(16).padStart(16,'0');
      assertDurableRecordReplay(candidate);
      if (Buffer.byteLength(canonicalJson(candidate)) > this.#limits.maximumBytes) throw new Error('DURABLE_RECORD_STORE_FULL');
      await writeDurableState(this.#file, candidate);
      return { ...structuredClone(retirement), newlyRetired: true, releasedBytes };
    });
  }

  async transition<T>(
    stream: string,
    idempotencyKey: string,
    expectedPayloadDigest: string,
    payload: T,
    authorize?: (records: ReadonlyArray<DurableRecord>) => void,
  ): Promise<DurableRecord<T>> {
    const { snapshot, digest } = this.#transitionCandidate(stream, idempotencyKey, expectedPayloadDigest, payload);
    return this.#serial(() => this.#transitionLocked(stream, idempotencyKey, expectedPayloadDigest, snapshot, digest, authorize));
  }

  /** Hold the owner writer before its retained dependency writer through the
   * original durable transition. Domain callers must use one fixed store order. */
  async transitionWithRetainedStore<T>(stream: string, idempotencyKey: string, expectedPayloadDigest: string,
    payload: T, retained: FileDurableRecordStore, retainedStream: string,
    authorize: (records: ReadonlyArray<DurableRecord>, retainedRecords: ReadonlyArray<DurableRecord>) => void,
  ): Promise<DurableRecord<T>> {
    const { snapshot, digest } = this.#transitionCandidate(stream, idempotencyKey, expectedPayloadDigest, payload);
    return this.#withRetainedStore(retained, retainedStream, retainedRecords =>
      this.#transitionLocked(stream, idempotencyKey, expectedPayloadDigest, snapshot, digest,
        records => authorize(records, retainedRecords)));
  }

  /** Read-owned snapshots with the same fixed two-store fence as a retained transition. */
  async withRetainedRecords<T, R>(stream: string, retained: FileDurableRecordStore, retainedStream: string,
    operation: (records: readonly DurableRecord<T>[], retainedRecords: readonly DurableRecord[]) => Promise<R>,
  ): Promise<R> {
    identity(stream, 'DURABLE_RECORD_STREAM_INVALID');
    return this.#withRetainedStore(retained, retainedStream, async records =>
      operation(await readStoreRecords<T>(this.#file, this.#limits.maximumBytes, stream), records));
  }

  #withRetainedStore<R>(retained: FileDurableRecordStore, stream: string, operation: (records: readonly DurableRecord[]) => Promise<R>): Promise<R> {
    identity(stream, 'DURABLE_RECORD_STREAM_INVALID');
    return withRetainedStoreFence({ ownerFile: this.#file, retainedFile: retained.#file,
      owner: callback => this.#serial(callback), retained: callback => retained.withRecords(stream, callback) }, operation);
  }

  #transitionCandidate<T>(stream: string, idempotencyKey: string, expectedPayloadDigest: string, payload: T): { snapshot: T; digest: string } {
    identity(stream, "DURABLE_RECORD_STREAM_INVALID");
    identity(idempotencyKey, "DURABLE_RECORD_IDEMPOTENCY_KEY_INVALID");
    if (!DIGEST.test(expectedPayloadDigest)) throw new Error("DURABLE_RECORD_DIGEST_INVALID");
    const snapshot = JSON.parse(canonicalJson(payload)) as T;
    const digest = payloadDigest(snapshot);
    if (Buffer.byteLength(canonicalJson(snapshot)) > this.#limits.maximumRecordBytes)
      throw new Error("DURABLE_RECORD_SIZE_EXCEEDED");
    return { snapshot, digest };
  }

  async #transitionLocked<T>(stream: string, idempotencyKey: string, expectedPayloadDigest: string,
    snapshot: T, digest: string, authorize?: (records: ReadonlyArray<DurableRecord>) => void,
  ): Promise<DurableRecord<T>> {
      const state = await readDurableState(this.#file, EMPTY_STATE, this.#limits.maximumBytes);
      assertDurableRecordReplay(state);
      const index = state.records.findIndex(
        (record) => record.stream === stream && record.idempotencyKey === idempotencyKey,
      );
      if (index < 0) {
        if (state.tombstones?.some(record => record.stream === stream && record.idempotencyKey === idempotencyKey)) throw new Error('DURABLE_RECORD_RETIRED');
        throw new Error("DURABLE_RECORD_NOT_FOUND");
      }
      const existing = state.records[index];
      if (!existing) throw new Error("DURABLE_RECORD_NOT_FOUND");
      if (existing.payloadDigest !== expectedPayloadDigest)
        throw new Error("DURABLE_RECORD_TRANSITION_CONFLICT");
      const record: DurableRecord<T> = {
        ...existing,
        committedAt: new Date().toISOString(),
        payloadDigest: digest,
        payload: snapshot,
      };
      const next = [...state.records];
      next[index] = record;
      const candidate: DurableRecordState = { ...state, records: next };
      if (Buffer.byteLength(canonicalJson(candidate)) > this.#limits.maximumBytes)
        throw new Error("DURABLE_RECORD_STORE_FULL");
      // The domain fence is already held; the final check must not yield or
      // reenter this store between its CAS comparison and durable write.
      if (authorize?.(structuredClone(state.records)) !== undefined) throw new Error('DURABLE_RECORD_AUTHORIZATION_NOT_SYNCHRONOUS');
      await writeDurableState(this.#file, candidate);
      return structuredClone(record);

  }
}

