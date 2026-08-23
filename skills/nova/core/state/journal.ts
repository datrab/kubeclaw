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

  constructor(file: string, appendLockTimeoutMs = 5_000) {
    if (!Number.isSafeInteger(appendLockTimeoutMs) || appendLockTimeoutMs < 1) {
      throw new Error('JOURNAL_APPEND_LOCK_TIMEOUT_INVALID');
    }
    this.#file = path.resolve(file);
    fs.mkdirSync(path.dirname(this.#file), { recursive: true });
    this.#records = this.#load();
    this.#mutex = new FileMutex(`${this.#file}.append-lock`, appendLockTimeoutMs, `JOURNAL_APPEND_LOCK_TIMEOUT:${this.#file}`);
  }

  #load(): JournalRecord<T>[] {
    if (!fs.existsSync(this.#file)) return [];
    const lines = fs.readFileSync(this.#file, 'utf8').split('\n').filter(Boolean);
    const records: JournalRecord<T>[] = [];
    for (const line of lines) {
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
    return records;
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
    const descriptor = fs.openSync(this.#file, 'a');
    try {
      fs.writeSync(descriptor, `${JSON.stringify(record)}\n`);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    this.#records.push(record);
    return record;
  }

  transact<R>(
    operation: (
      records: readonly JournalRecord<T>[],
      append: (entry: T) => JournalRecord<T>,
    ) => R,
  ): R {
    return this.#mutex.withLock(() => {
      this.#records = this.#load();
      return operation(
        Object.freeze([...this.#records]),
        (entry) => this.#appendUnlocked(entry),
      );
    });
  }

  append(entry: T): JournalRecord<T> {
    return this.transact((_records, append) => append(entry));
  }

  records(): readonly JournalRecord<T>[] {
    return Object.freeze([...this.#records]);
  }

  refresh(): readonly JournalRecord<T>[] {
    this.#records = this.#load();
    return this.records();
  }
}
