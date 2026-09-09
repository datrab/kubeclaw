import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "@kubeclaw/pipeline-observability-contract";
import {
  ensureDirectoryDurable,
  readDurableState,
  withDurableStoreLock,
  writeDurableState,
} from "./durable-delivery.ts";

export interface DurableRecord<T = unknown> {
  readonly schemaVersion: "pipeline-durable-record.v1";
  readonly stream: string;
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly committedAt: string;
  readonly payloadDigest: string;
  readonly payload: T;
}

interface DurableRecordState {
  readonly schemaVersion: "pipeline-durable-record-store.v1";
  readonly records: DurableRecord[];
}

export interface DurableRecordLimits {
  readonly maximumRecords: number;
  readonly maximumBytes: number;
  readonly maximumRecordBytes: number;
}

export interface DurableRecordStore {
  append<T>(stream: string, idempotencyKey: string, payload: T): Promise<{
    readonly appended: boolean;
    readonly record: DurableRecord<T>;
  }>;
  transition<T>(stream: string, idempotencyKey: string, expectedPayloadDigest: string, payload: T): Promise<DurableRecord<T>>;
  read<T>(stream: string): Promise<ReadonlyArray<DurableRecord<T>>>;
}

export interface DurableBlobStore {
  put(bytes: Uint8Array): Promise<{
    readonly digest: string;
    readonly sizeBytes: number;
  }>;
  get(digest: string): Promise<Buffer>;
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

function payloadDigest(payload: unknown): string {
  return `sha256:${crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex")}`;
}

export function assertDurableRecordReplay(state: DurableRecordState): void {
  if (state.schemaVersion !== "pipeline-durable-record-store.v1" || !Array.isArray(state.records))
    throw new Error("DURABLE_RECORD_STORE_INVALID");
  const sequences = new Map<string, number>();
  const identities = new Set<string>();
  for (const record of state.records) {
    if (
      record.schemaVersion !== "pipeline-durable-record.v1" ||
      !IDENTITY.test(record.stream) ||
      !IDENTITY.test(record.idempotencyKey) ||
      !Number.isSafeInteger(record.sequence) ||
      record.sequence < 1 ||
      typeof record.committedAt !== "string" ||
      !DIGEST.test(record.payloadDigest) ||
      payloadDigest(record.payload) !== record.payloadDigest
    ) throw new Error("DURABLE_RECORD_STORE_INVALID");
    const expected = (sequences.get(record.stream) ?? 0) + 1;
    if (record.sequence !== expected) throw new Error("DURABLE_RECORD_SEQUENCE_INVALID");
    sequences.set(record.stream, record.sequence);
    const key = `${record.stream}|${record.idempotencyKey}`;
    if (identities.has(key)) throw new Error("DURABLE_RECORD_IDENTITY_DUPLICATE");
    identities.add(key);
  }
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

  async append<T>(stream: string, idempotencyKey: string, payload: T): Promise<{
    readonly appended: boolean;
    readonly record: DurableRecord<T>;
  }> {
    identity(stream, "DURABLE_RECORD_STREAM_INVALID");
    identity(idempotencyKey, "DURABLE_RECORD_IDEMPOTENCY_KEY_INVALID");
    const snapshot = JSON.parse(canonicalJson(payload)) as T;
    const digest = payloadDigest(snapshot);
    if (Buffer.byteLength(canonicalJson(snapshot)) > this.#limits.maximumRecordBytes)
      throw new Error("DURABLE_RECORD_SIZE_EXCEEDED");
    return this.#serial(async () => {
      const state = await readDurableState(this.#file, EMPTY_STATE);
      assertDurableRecordReplay(state);
      const existing = state.records.find(
        (record) => record.stream === stream && record.idempotencyKey === idempotencyKey,
      );
      if (existing) {
        if (existing.payloadDigest !== digest) throw new Error("DURABLE_RECORD_IDEMPOTENCY_CONFLICT");
        return { appended: false, record: structuredClone(existing) as DurableRecord<T> };
      }
      if (state.records.length >= this.#limits.maximumRecords)
        throw new Error("DURABLE_RECORD_STORE_FULL");
      const record: DurableRecord<T> = {
        schemaVersion: "pipeline-durable-record.v1",
        stream,
        sequence: state.records.filter((entry) => entry.stream === stream).length + 1,
        idempotencyKey,
        committedAt: new Date().toISOString(),
        payloadDigest: digest,
        payload: snapshot,
      };
      const candidate: DurableRecordState = { ...state, records: [...state.records, record] };
      if (Buffer.byteLength(canonicalJson(candidate)) > this.#limits.maximumBytes)
        throw new Error("DURABLE_RECORD_STORE_FULL");
      await writeDurableState(this.#file, candidate);
      return { appended: true, record: structuredClone(record) };
    });
  }

  async read<T>(stream: string): Promise<ReadonlyArray<DurableRecord<T>>> {
    identity(stream, "DURABLE_RECORD_STREAM_INVALID");
    return this.#serial(async () => {
      const state = await readDurableState(this.#file, EMPTY_STATE);
      assertDurableRecordReplay(state);
      return structuredClone(state.records.filter((record) => record.stream === stream)) as DurableRecord<T>[];
    });
  }

  async transition<T>(
    stream: string,
    idempotencyKey: string,
    expectedPayloadDigest: string,
    payload: T,
  ): Promise<DurableRecord<T>> {
    identity(stream, "DURABLE_RECORD_STREAM_INVALID");
    identity(idempotencyKey, "DURABLE_RECORD_IDEMPOTENCY_KEY_INVALID");
    if (!DIGEST.test(expectedPayloadDigest)) throw new Error("DURABLE_RECORD_DIGEST_INVALID");
    const snapshot = JSON.parse(canonicalJson(payload)) as T;
    const digest = payloadDigest(snapshot);
    if (Buffer.byteLength(canonicalJson(snapshot)) > this.#limits.maximumRecordBytes)
      throw new Error("DURABLE_RECORD_SIZE_EXCEEDED");
    return this.#serial(async () => {
      const state = await readDurableState(this.#file, EMPTY_STATE);
      assertDurableRecordReplay(state);
      const index = state.records.findIndex(
        (record) => record.stream === stream && record.idempotencyKey === idempotencyKey,
      );
      if (index < 0) throw new Error("DURABLE_RECORD_NOT_FOUND");
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
      await writeDurableState(this.#file, candidate);
      return structuredClone(record);
    });
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

export class FileDurableBlobStore implements DurableBlobStore {
  readonly #root: string;
  readonly #maximumBytes: number;
  readonly #maximumTotalBytes: number | undefined;

  constructor(root: string, maximumBytes: number, maximumTotalBytes?: number) {
    positiveInteger(maximumBytes, "DURABLE_BLOB_LIMIT_INVALID");
    if (maximumTotalBytes !== undefined) positiveInteger(maximumTotalBytes, "DURABLE_BLOB_TOTAL_LIMIT_INVALID");
    this.#maximumTotalBytes = maximumTotalBytes;
    this.#root = path.resolve(root);
    this.#maximumBytes = maximumBytes;
  }

  #path(digest: string): string {
    if (!DIGEST.test(digest)) throw new Error("DURABLE_BLOB_DIGEST_INVALID");
    const hash = digest.slice("sha256:".length);
    return path.join(this.#root, "blobs", "sha256", hash.slice(0, 2), hash.slice(2));
  }

  async put(input: Uint8Array): Promise<{ readonly digest: string; readonly sizeBytes: number }> {
    if (this.#maximumTotalBytes === undefined) return this.#put(input);
    await ensureDirectoryDurable(this.#root);
    return withDurableStoreLock(path.join(this.#root, 'blob-budget'), () => this.#put(input));
  }

  async #usedBytes(directory: string): Promise<number> {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
    let total = 0;
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('DURABLE_BLOB_PATH_INVALID');
      if (entry.isDirectory()) total += await this.#usedBytes(file);
      else if (entry.isFile()) total += (await fs.lstat(file)).size;
      else throw new Error('DURABLE_BLOB_PATH_INVALID');
      if (!Number.isSafeInteger(total) || total > this.#maximumTotalBytes!) throw new Error('DURABLE_BLOB_STORE_LIMIT_EXCEEDED');
    }
    return total;
  }

  async #put(input: Uint8Array): Promise<{ readonly digest: string; readonly sizeBytes: number }> {
    const bytes = Buffer.from(input);
    if (bytes.byteLength > this.#maximumBytes) throw new Error("DURABLE_BLOB_SIZE_EXCEEDED");
    const digest = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
    const file = this.#path(digest);
    try {
      const existing = await this.get(digest);
      if (!existing.equals(bytes)) throw new Error('DURABLE_BLOB_DIGEST_COLLISION');
      return { digest, sizeBytes: bytes.byteLength };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'DURABLE_BLOB_NOT_FOUND') throw error;
    }
    if (this.#maximumTotalBytes !== undefined
      && await this.#usedBytes(path.join(this.#root, 'blobs')) + bytes.byteLength > this.#maximumTotalBytes) {
      throw new Error('DURABLE_BLOB_STORE_LIMIT_EXCEEDED');
    }
    await ensureDirectoryDurable(path.dirname(file));
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temporary, "wx", 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      try { await fs.link(temporary, file); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("DURABLE_BLOB_PATH_INVALID");
        if (!Buffer.from(await fs.readFile(file)).equals(bytes)) throw new Error("DURABLE_BLOB_DIGEST_COLLISION");
      }
      await syncDirectory(path.dirname(file));
    } finally {
      await fs.unlink(temporary).catch(() => undefined);
    }
    return { digest, sizeBytes: bytes.byteLength };
  }

  async get(digest: string): Promise<Buffer> {
    const file = this.#path(digest);
    let stat;
    try { stat = await fs.lstat(file); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("DURABLE_BLOB_NOT_FOUND");
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("DURABLE_BLOB_PATH_INVALID");
    const bytes = await fs.readFile(file);
    const actual = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
    if (actual !== digest) throw new Error("DURABLE_BLOB_INTEGRITY_FAILED");
    return bytes;
  }
}
