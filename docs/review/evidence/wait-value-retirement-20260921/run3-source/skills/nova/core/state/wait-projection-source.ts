import fs from 'node:fs';
import path from 'node:path';
import type { RetainedWaitSource } from '@kubeclaw/plugin-sdk';
import { readAttemptJournalPrefix } from '@kubeclaw/plugin-foundation/observability/attempt-projection';
import { payloadDigest } from '@kubeclaw/plugin-foundation/observability/record-retirement';

export const retainedWaitFailure = (): never => { throw new Error('WAIT_RETAINED_CORE_EVIDENCE_INVALID'); };
type JournalName = 'events.jsonl' | 'effects.jsonl' | 'signals.jsonl';
function unchanged(before: fs.Stats, after: fs.Stats): boolean {
  return after.isFile() && before.dev === after.dev && before.ino === after.ino && before.size === after.size
    && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;
}

/** One accounting owner for the fixed snapshot and three original journal prefixes. */
export class RetainedWaitFiles {
  readonly #root: string;
  readonly #limits: RetainedWaitSource['inventoryLimits'];
  readonly #directories = new Map<string, fs.Stats>();
  readonly #files = new Map<string, { stat: fs.Stats; prefixBytes?: number }>();
  #remaining: number;

  constructor(root: string, limits: RetainedWaitSource['inventoryLimits']) {
    this.#root = root; this.#limits = limits; this.#remaining = limits.maximumTotalBytes;
    let cursor = path.parse(root).root;
    for (const component of root.slice(cursor.length).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, component);
      const stat = fs.lstatSync(cursor);
      if (!stat.isDirectory() || stat.isSymbolicLink()) retainedWaitFailure();
      this.#directories.set(cursor, stat);
    }
  }

  #file(name: string): string {
    if (this.#files.size >= this.#limits.maximumFiles) retainedWaitFailure();
    return path.join(this.#root, name);
  }

  snapshot(): Buffer {
    const file = this.#file('run-snapshot.json');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > Math.min(this.#limits.maximumSnapshotBytes, this.#remaining)) retainedWaitFailure();
      const bytes = Buffer.alloc(stat.size + 1);
      let size = 0;
      while (size < bytes.length) {
        const count = fs.readSync(fd, bytes, size, bytes.length - size, size);
        if (count === 0) break;
        size += count;
      }
      if (size !== stat.size || !unchanged(stat, fs.fstatSync(fd))) retainedWaitFailure();
      this.#files.set(file, { stat }); this.#remaining -= size;
      return bytes.subarray(0, size);
    } finally { fs.closeSync(fd); }
  }

  prefix(name: JournalName, prefixBytes: number): Buffer {
    const file = this.#file(name), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.nlink !== 1 || prefixBytes > this.#remaining) retainedWaitFailure();
    const bytes = readAttemptJournalPrefix(file, this.#remaining, prefixBytes);
    if (bytes.at(-1) !== 0x0a) retainedWaitFailure();
    this.#files.set(file, { stat, prefixBytes }); this.#remaining -= bytes.length;
    return bytes;
  }

  verify(expectedIdentity: string): void {
    const root = this.#root, rootStat = this.#directories.get(root)!;
    const files = [...this.#files].map(([file, { stat }]) => ({ name: path.basename(file), dev: stat.dev, ino: stat.ino }));
    if (payloadDigest({ root, dev: rootStat.dev, ino: rootStat.ino, files }) !== expectedIdentity) retainedWaitFailure();
    for (const [file, held] of this.#files) this.#verifyFile(file, held);
    for (const [directory, stat] of this.#directories) {
      const now = fs.lstatSync(directory);
      if (!now.isDirectory() || now.dev !== stat.dev || now.ino !== stat.ino) retainedWaitFailure();
    }
  }

  #verifyFile(file: string, { stat, prefixBytes }: { stat: fs.Stats; prefixBytes?: number }): void {
    const current = fs.lstatSync(file);
    if (!current.isFile() || current.nlink !== 1 || current.dev !== stat.dev || current.ino !== stat.ino) retainedWaitFailure();
    if (prefixBytes === undefined) {
      if (!unchanged(stat, current)) retainedWaitFailure();
    } else if (current.size < prefixBytes) retainedWaitFailure();
  }
}
