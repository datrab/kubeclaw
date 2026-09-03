import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FileMutex } from './file-mutex.ts';

export interface JournalRecord<T> {
  readonly sequence: number;
  readonly previousHash: string | null;
  readonly hash: string;
  readonly entry: T;
}

function recordHash(sequence: number, previousHash: string | null, entry: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify({
    sequence,
    previousHash,
    entry,
  })).digest('hex')}`;
}

export class FileJournal<T> {
  readonly #file: string;
  readonly #mutex: FileMutex;
  #records: JournalRecord<T>[];
  #offset: number;
  #identity: string | undefined;
  #mtimeMs: number | undefined;
  #ctimeMs: number | undefined;

  constructor(file: string, appendLockTimeoutMs = 5_000) {
    if (!Number.isSafeInteger(appendLockTimeoutMs) || appendLockTimeoutMs < 1) {
      throw new Error('JOURNAL_APPEND_LOCK_TIMEOUT_INVALID');
    }
    this.#file = path.resolve(file);
    fs.mkdirSync(path.dirname(this.#file), { recursive: true });
    this.#mutex = new FileMutex(`${this.#file}.append-lock`, appendLockTimeoutMs, `JOURNAL_APPEND_LOCK_TIMEOUT:${this.#file}`);
    const loaded = this.#mutex.withLock(() => this.#load());
    this.#records = loaded.records;
    this.#offset = loaded.offset;
    this.#identity = loaded.identity;
    this.#mtimeMs = loaded.mtimeMs;
    this.#ctimeMs = loaded.ctimeMs;
  }

  #fileState(): { identity: string; size: number; mtimeMs: number; ctimeMs: number } | undefined {
    try {
      const stat = fs.statSync(this.#file);
      return { identity: `${stat.dev}:${stat.ino}`, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  #parse(buffer: Buffer, records: JournalRecord<T>[]): void {
    if (buffer.length === 0) return;
    const text = buffer.toString('utf8');
    if (!text.endsWith('\n')) throw new Error(`JOURNAL_RECORD_INCOMPLETE:${this.#file}`);
    const lines = text.slice(0, -1).split('\n');
    for (const line of lines) {
      if (line.length === 0) throw new Error(`JOURNAL_RECORD_EMPTY:${this.#file}:${records.length + 1}`);
      const record = JSON.parse(line) as JournalRecord<T>;
      const expectedSequence = records.length + 1;
      const previousHash = records.at(-1)?.hash ?? null;
      if (record.sequence !== expectedSequence || record.previousHash !== previousHash) {
        throw new Error(`JOURNAL_CHAIN_INVALID:${this.#file}:${expectedSequence}`);
      }
      if (record.hash !== recordHash(record.sequence, record.previousHash, record.entry)) {
        throw new Error(`JOURNAL_HASH_INVALID:${this.#file}:${expectedSequence}`);
      }
      records.push(Object.freeze(record));
    }
  }

  #recoverIncompleteTail(buffer: Buffer): Buffer {
    if (buffer.length === 0 || buffer.at(-1) === 0x0a) return buffer;
    const committedBytes = buffer.lastIndexOf(0x0a) + 1;
    const descriptor = fs.openSync(this.#file, 'r+');
    try {
      fs.ftruncateSync(descriptor, committedBytes);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    return buffer.subarray(0, committedBytes);
  }

  #load(): { records: JournalRecord<T>[]; offset: number; identity: string | undefined; mtimeMs: number | undefined; ctimeMs: number | undefined } {
    if (!fs.existsSync(this.#file)) return { records: [], offset: 0, identity: undefined, mtimeMs: undefined, ctimeMs: undefined };
    const buffer = this.#recoverIncompleteTail(fs.readFileSync(this.#file));
    const records: JournalRecord<T>[] = [];
    this.#parse(buffer, records);
    const state = this.#fileState();
    if (!state || state.size !== buffer.length) throw new Error(`JOURNAL_CHANGED_DURING_READ:${this.#file}`);
    return { records, offset: buffer.length, identity: state.identity, mtimeMs: state.mtimeMs, ctimeMs: state.ctimeMs };
  }

  #adoptReloaded(loaded: { records: JournalRecord<T>[]; offset: number; identity: string | undefined; mtimeMs: number | undefined; ctimeMs: number | undefined }): void {
    if (loaded.records.length < this.#records.length
      || this.#records.some((record, index) => loaded.records[index]?.hash !== record.hash)) {
      throw new Error(`JOURNAL_REWIND_OR_DIVERGENCE:${this.#file}`);
    }
    this.#records = loaded.records;
    this.#offset = loaded.offset;
    this.#identity = loaded.identity;
    this.#mtimeMs = loaded.mtimeMs;
    this.#ctimeMs = loaded.ctimeMs;
  }

  #synchronize(): void {
    const state = this.#fileState();
    if (state === undefined) {
      if (this.#offset !== 0 || this.#records.length !== 0) throw new Error(`JOURNAL_REMOVED:${this.#file}`);
      return;
    }
    if (state.identity !== this.#identity || state.size < this.#offset
      || (state.size === this.#offset && (state.mtimeMs !== this.#mtimeMs || state.ctimeMs !== this.#ctimeMs))) {
      this.#adoptReloaded(this.#load());
      return;
    }
    if (state.size === this.#offset) return;
    const length = state.size - this.#offset;
    const descriptor = fs.openSync(this.#file, 'r');
    try {
      const buffer = Buffer.allocUnsafe(length);
      const read = fs.readSync(descriptor, buffer, 0, length, this.#offset);
      if (read !== length) throw new Error(`JOURNAL_TAIL_READ_INCOMPLETE:${this.#file}`);
      if (buffer.at(-1) !== 0x0a) {
        this.#adoptReloaded(this.#load());
        return;
      }
      this.#parse(buffer, this.#records);
      this.#offset = state.size;
      this.#mtimeMs = state.mtimeMs;
      this.#ctimeMs = state.ctimeMs;
    } finally {
      fs.closeSync(descriptor);
    }
  }

  #appendUnlocked(entry: T): JournalRecord<T> {
    const sequence = this.#records.length + 1;
    const previousHash = this.#records.at(-1)?.hash ?? null;
    const record: JournalRecord<T> = Object.freeze({
      sequence,
      previousHash,
      hash: recordHash(sequence, previousHash, entry),
      entry,
    });
    const serialized = Buffer.from(`${JSON.stringify(record)}\n`);
    const descriptor = fs.openSync(this.#file, 'a');
    try {
      let written = 0;
      while (written < serialized.length) {
        const count = fs.writeSync(descriptor, serialized, written, serialized.length - written);
        if (count < 1) throw new Error(`JOURNAL_APPEND_WRITE_INCOMPLETE:${this.#file}`);
        written += count;
      }
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    this.#records.push(record);
    this.#offset += serialized.length;
    const state = this.#fileState();
    if (!state || state.size !== this.#offset) throw new Error(`JOURNAL_APPEND_SIZE_MISMATCH:${this.#file}`);
    this.#identity = state.identity;
    this.#mtimeMs = state.mtimeMs;
    this.#ctimeMs = state.ctimeMs;
    return record;
  }

  transact<R>(
    operation: (
      records: readonly JournalRecord<T>[],
      append: (entry: T) => JournalRecord<T>,
    ) => R,
  ): R {
    return this.#mutex.withLock(() => {
      this.#synchronize();
      return operation(
        Object.freeze([...this.#records]),
        (entry) => this.#appendUnlocked(entry),
      );
    });
  }

  append(entry: T): JournalRecord<T> {
    return this.transact((_records, append) => append(entry));
  }

  appendSequenced<U extends T>(create: (sequence: number) => U): JournalRecord<U> {
    return this.transact((records, append) => append(create(records.length + 1))) as JournalRecord<U>;
  }

  records(): readonly JournalRecord<T>[] {
    return Object.freeze([...this.#records]);
  }

  refresh(): readonly JournalRecord<T>[] {
    return this.#mutex.withLock(() => {
      this.#synchronize();
      return this.records();
    });
  }
}
