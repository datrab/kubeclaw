import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readDurableBlob } from './durable-blob-read.ts';
import { ensureDirectoryDurable, withDurableStoreLock } from './durable-delivery.ts';

export interface DurableBlobStore {
  put(bytes: Uint8Array): Promise<{
    readonly digest: string;
    readonly sizeBytes: number;
  }>;
  get(digest: string): Promise<Buffer>;
}

const DIGEST = /^sha256:[a-f0-9]{64}$/;

function positiveInteger(value: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(code);
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
    // Reject before creating the budget-lock directory as well as before copy.
    if (input.byteLength > this.#maximumBytes) throw new Error("DURABLE_BLOB_SIZE_EXCEEDED");
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
    // The policy bounds the copy itself, not just the subsequent write.
    if (input.byteLength > this.#maximumBytes) throw new Error("DURABLE_BLOB_SIZE_EXCEEDED");
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
    return readDurableBlob(this.#path(digest), digest, this.#maximumBytes);
  }
}
