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

const appendLockWaitBuffer = new Int32Array(new SharedArrayBuffer(4));

function waitForAppendLock(): void {
  Atomics.wait(appendLockWaitBuffer, 0, 0, 10);
}

export class FileJournal<T> {
  readonly #file: string;
  readonly #appendLockTimeoutMs: number;
  #records: JournalRecord<T>[];

  constructor(file: string, appendLockTimeoutMs = 5_000) {
    if (!Number.isSafeInteger(appendLockTimeoutMs) || appendLockTimeoutMs < 1) {
      throw new Error('JOURNAL_APPEND_LOCK_TIMEOUT_INVALID');
    }
    this.#file = path.resolve(file);
    this.#appendLockTimeoutMs = appendLockTimeoutMs;
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

  #acquireAppendLock(): { readonly file: string; readonly token: string } {
    const lockFile = `${this.#file}.append-lock`;
    const deadline = Date.now() + this.#appendLockTimeoutMs;
    for (;;) {
      const token = crypto.randomUUID();
      const temporary = `${lockFile}.${token}.tmp`;
      fs.writeFileSync(
        temporary,
        `${JSON.stringify({ token, pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
        { flag: 'wx', mode: 0o600 },
      );
      try {
        fs.linkSync(temporary, lockFile);
        fs.unlinkSync(temporary);
        return { file: lockFile, token };
      } catch (error) {
        fs.rmSync(temporary, { force: true });
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        let owner: { token?: unknown; pid?: unknown };
        try {
          owner = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as {
            token?: unknown;
            pid?: unknown;
          };
        } catch {
          const tombstone = `${lockFile}.corrupt-${crypto.randomUUID()}`;
          try {
            fs.renameSync(lockFile, tombstone);
          } catch (renameError) {
            if ((renameError as NodeJS.ErrnoException).code === 'ENOENT') continue;
            throw renameError;
          }
          fs.rmSync(tombstone, { force: true });
          continue;
        }
        if (typeof owner.pid === 'number') {
          try {
            process.kill(owner.pid, 0);
          } catch (livenessError) {
            if ((livenessError as NodeJS.ErrnoException).code === 'EPERM') {
              if (Date.now() >= deadline) {
                throw new Error(`JOURNAL_APPEND_LOCK_TIMEOUT:${this.#file}`);
              }
              waitForAppendLock();
              continue;
            }
            if ((livenessError as NodeJS.ErrnoException).code !== 'ESRCH') throw livenessError;
            const tombstone = `${lockFile}.stale-${crypto.randomUUID()}`;
            try {
              fs.renameSync(lockFile, tombstone);
            } catch (renameError) {
              if ((renameError as NodeJS.ErrnoException).code === 'ENOENT') continue;
              throw renameError;
            }
            fs.rmSync(tombstone, { force: true });
            continue;
          }
          if (Date.now() >= deadline) {
            throw new Error(`JOURNAL_APPEND_LOCK_TIMEOUT:${this.#file}`);
          }
          waitForAppendLock();
          continue;
        }
        const tombstone = `${lockFile}.stale-${crypto.randomUUID()}`;
        try {
          fs.renameSync(lockFile, tombstone);
        } catch (renameError) {
          if ((renameError as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw renameError;
        }
        fs.rmSync(tombstone, { force: true });
      }
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
    const lock = this.#acquireAppendLock();
    try {
      this.#records = this.#load();
      return operation(
        Object.freeze([...this.#records]),
        (entry) => this.#appendUnlocked(entry),
      );
    } finally {
      try {
        const owner = JSON.parse(fs.readFileSync(lock.file, 'utf8')) as { token?: unknown };
        if (owner.token === lock.token) {
          fs.unlinkSync(lock.file);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
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
