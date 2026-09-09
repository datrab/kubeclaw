import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const digest = (value: Uint8Array): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function ensureDurableDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  // Also cover another concurrent creator that has not yet synced its parent.
  for (let current = resolve(directory);;) {
    await syncDirectory(current);
    const parent = dirname(current); if (parent === current) return; current = parent;
  }
}
async function verifiedBytes(file: string, expectedDigest: string, durable = false): Promise<Buffer> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!(await handle.stat()).isFile()) throw new Error('PRISM_ARTIFACT_NOT_REGULAR');
    const bytes = await handle.readFile();
    if (digest(bytes) !== expectedDigest) throw new Error(`PRISM_ARTIFACT_CORRUPT:${expectedDigest}`);
    // An existing object's presence alone is not a durable acknowledgement.
    if (durable) await handle.sync(); return bytes;
  } finally { await handle.close(); }
}

async function removePending(pending: string, directory: string, failure: unknown): Promise<void> {
  try { await unlink(pending); await syncDirectory(directory); }
  catch (error) {
    if (failure) throw new AggregateError([failure, error], 'PRISM_ARTIFACT_PENDING_CLEANUP_FAILED', { cause: failure });
    throw error;
  }
}

export class ContentAddressedArtifactStore {
  readonly #root: string;
  constructor(root: string) { this.#root = resolve(root); }

  async put(content: Uint8Array): Promise<{ artifactId: string; digest: string; sizeBytes: number }> {
    // Take ownership before the first await; callers may reuse their buffer.
    const bytes = Buffer.from(content); const contentDigest = digest(bytes); const hex = contentDigest.slice(7);
    const file = join(this.#root, hex.slice(0, 2), hex); const directory = dirname(file);
    await ensureDurableDirectory(directory);
    const pending = `${file}.${randomUUID()}.pending`; let created = false; let failure: unknown;
    try {
      const handle = await open(pending, 'wx', 0o600); created = true;
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      try { await link(pending, file); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await verifiedBytes(file, contentDigest, true);
      }
      await syncDirectory(directory);
      return { artifactId: `artifact:${contentDigest}`, digest: contentDigest, sizeBytes: bytes.byteLength };
    } catch (error) { failure = error; throw error; }
    finally { if (created) await removePending(pending, directory, failure); }
  }

  async get(artifactId: string): Promise<Uint8Array> {
    const match = /^artifact:sha256:([a-f0-9]{64})$/u.exec(artifactId);
    if (!match) throw new Error('invalid artifact ID');
    return verifiedBytes(join(this.#root, match[1]!.slice(0, 2), match[1]!), `sha256:${match[1]}`);
  }
}
