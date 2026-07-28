import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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
  #records: JournalRecord<T>[];

  constructor(file: string) {
    this.#file = path.resolve(file);
    fs.mkdirSync(path.dirname(this.#file), { recursive: true });
    this.#records = this.#load();
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

  append(entry: T): JournalRecord<T> {
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

  records(): readonly JournalRecord<T>[] {
    return Object.freeze([...this.#records]);
  }
}
