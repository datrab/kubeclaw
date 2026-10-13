import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { constants, type Stats } from 'node:fs';
import path from 'node:path';

const stamp = (value: Stats): string =>
  `${value.dev}:${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}`;

async function statPath(file: string): Promise<Stats> {
  try { return await fs.lstat(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('DURABLE_BLOB_NOT_FOUND');
    throw error;
  }
}
async function parentsOf(file: string): Promise<ReadonlyMap<string, string>> {
  const parents = new Map<string, string>();
  let directory = path.parse(file).root;
  for (const segment of path.dirname(file).slice(directory.length).split(path.sep).filter(Boolean)) {
    directory = path.join(directory, segment);
    const parent = await statPath(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error('DURABLE_BLOB_PATH_INVALID');
    parents.set(directory, `${parent.dev}:${parent.ino}`);
  }
  return parents;
}
async function verifyParents(parents: ReadonlyMap<string, string>): Promise<void> {
  // Observed identities reject changed/symlink parents, not race-proof path
  // confinement against an adversarial host.
  for (const [parentPath, identity] of parents) {
    const parent = await fs.lstat(parentPath);
    if (!parent.isDirectory() || parent.isSymbolicLink() || `${parent.dev}:${parent.ino}` !== identity) {
      throw new Error('DURABLE_BLOB_PATH_CHANGED');
    }
  }
}
async function boundedBytes(handle: Awaited<ReturnType<typeof fs.open>>, opened: Stats, maximum: number): Promise<Buffer> {
  if (!Number.isSafeInteger(opened.size) || opened.size < 0 || opened.size > maximum) {
    throw new Error('DURABLE_BLOB_SIZE_EXCEEDED');
  }
  const bounded = Buffer.alloc(opened.size + 1);
  let total = 0;
  while (total < bounded.byteLength) {
    const read = await handle.read(bounded, total, bounded.byteLength - total, total);
    if (!read.bytesRead) break;
    total += read.bytesRead;
  }
  if (total !== opened.size || stamp(await handle.stat()) !== stamp(opened)) throw new Error('DURABLE_BLOB_PATH_CHANGED');
  return bounded.subarray(0, total);
}
/** The original FileDurableBlobStore.get reader, factored only for readability. */
export async function readDurableBlob(file: string, digest: string, maximum: number): Promise<Buffer> {
  const parents = await parentsOf(file), stat = await statPath(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('DURABLE_BLOB_PATH_INVALID');
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || stamp(opened) !== stamp(stat)) throw new Error('DURABLE_BLOB_PATH_CHANGED');
    const bytes = await boundedBytes(handle, opened, maximum);
    if (stamp(await fs.lstat(file)) !== stamp(opened)) throw new Error('DURABLE_BLOB_PATH_CHANGED');
    await verifyParents(parents);
    if (`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` !== digest) {
      throw new Error('DURABLE_BLOB_INTEGRITY_FAILED');
    }
    return bytes;
  } finally { await handle.close(); }
}
