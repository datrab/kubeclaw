import fs from 'node:fs/promises';
import { constants, type Stats } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { assertHistoricalImportDescriptor, type HistoricalImportDescriptor } from './preparation-historical-reference.ts';

function requireRoot(): void {
  if (process.getuid?.() !== 0) throw new Error('BUSTER_HISTORICAL_ROOT_REQUIRED');
}

export async function assertHistoricalAncestors(directory: string): Promise<void> {
  if (!path.isAbsolute(directory) || path.resolve(directory) !== directory || directory === '/') {
    throw new Error('BUSTER_HISTORICAL_PATH_INVALID');
  }
  for (let current = path.dirname(directory); ; current = path.dirname(current)) {
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022) !== 0
      || await fs.realpath(current) !== current) throw new Error('BUSTER_HISTORICAL_ANCESTOR_UNTRUSTED');
    if (current === '/') break;
  }
}

/** A retained descriptor is not a source grant. Keep its opened inode AND
 * pathname stable through the complete read, including async yield boundaries. */
async function assertUnchanged(file: string, before: Stats, after: Stats): Promise<void> {
  const named = await fs.lstat(file);
  if (!named.isFile() || named.dev !== before.dev || named.ino !== before.ino
    || after.dev !== before.dev || after.ino !== before.ino
    || after.size !== before.size || after.mtimeMs !== before.mtimeMs
    || after.ctimeMs !== before.ctimeMs || after.mode !== before.mode
    || after.uid !== before.uid || after.gid !== before.gid || after.nlink !== 1
    // lstat is another await: the same opened inode may change after the final
    // descriptor stat. Validate the named observation too, not only its inode.
    || named.size !== before.size || named.mtimeMs !== before.mtimeMs
    || named.ctimeMs !== before.ctimeMs || named.mode !== before.mode
    || named.uid !== before.uid || named.gid !== before.gid || named.nlink !== 1) {
    throw new Error('BUSTER_HISTORICAL_SOURCE_CHANGED');
  }
}

export async function digestHistoricalFile(file: string, maximumBytes: number): Promise<HistoricalImportDescriptor> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('BUSTER_HISTORICAL_STORE_LIMIT');
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > maximumBytes) {
      throw new Error('BUSTER_HISTORICAL_STORE_LIMIT');
    }
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    let offset = 0;
    while (true) {
      const read = await handle.read(buffer, 0, buffer.length, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
      if (offset > stat.size) throw new Error('BUSTER_HISTORICAL_SOURCE_CHANGED');
      hash.update(buffer.subarray(0, read.bytesRead));
    }
    const after = await handle.stat();
    await assertUnchanged(file, stat, after);
    if (offset !== stat.size) {
      throw new Error('BUSTER_HISTORICAL_SOURCE_CHANGED');
    }
    return { schemaVersion: 'buster-historical-import-descriptor.v1', originalStoreDigest: `sha256:${hash.digest('hex')}`,
      originalStoreBytes: stat.size, originalStoreDevice: stat.dev, originalStoreInode: stat.ino };
  } finally { await handle.close(); }
}

export async function* historicalSnapshotChunks(stateRoot: string, descriptor: HistoricalImportDescriptor): AsyncGenerator<Buffer> {
  requireRoot();
  assertHistoricalImportDescriptor(descriptor);
  const file = path.join(stateRoot, 'records', 'store.json');
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.uid !== 0 || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o400
      || stat.dev !== descriptor.originalStoreDevice || stat.ino !== descriptor.originalStoreInode
      || stat.size !== descriptor.originalStoreBytes) throw new Error('BUSTER_HISTORICAL_SOURCE_CHANGED');
    const hash = createHash('sha256');
    let offset = 0;
    while (offset < stat.size) {
      const bytes = Buffer.alloc(Math.min(64 * 1024, stat.size - offset));
      const read = await handle.read(bytes, 0, bytes.length, offset);
      if (read.bytesRead !== bytes.length) throw new Error('BUSTER_HISTORICAL_SOURCE_CHANGED');
      offset += bytes.length;
      hash.update(bytes);
      yield bytes;
    }
    await assertUnchanged(file, stat, await handle.stat());
    if (`sha256:${hash.digest('hex')}` !== descriptor.originalStoreDigest) throw new Error('BUSTER_HISTORICAL_SOURCE_CHANGED');
  } finally { await handle.close(); }
}
