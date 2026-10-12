import fs from 'node:fs/promises';

/** Reject aliased writer namespaces before a caller acquires a second lock. */
export async function assertDistinctStoreFiles(ownerFile: string, dependencyFile: string): Promise<void> {
  if (ownerFile === dependencyFile) throw new Error('DURABLE_RECORD_RETAINED_STORE_ALIAS');
  const [ownerPath, dependencyPath] = await Promise.all([fs.realpath(ownerFile), fs.realpath(dependencyFile)]);
  if (ownerPath !== ownerFile || dependencyPath !== dependencyFile || ownerPath === dependencyPath) {
    throw new Error('DURABLE_RECORD_RETAINED_STORE_ALIAS');
  }
  const [owner, dependency] = await Promise.all([fs.lstat(ownerPath), fs.lstat(dependencyPath)]);
  if (!owner.isFile() || !dependency.isFile() || owner.nlink !== 1 || dependency.nlink !== 1
    || owner.dev === dependency.dev && owner.ino === dependency.ino) {
    throw new Error('DURABLE_RECORD_RETAINED_STORE_ALIAS');
  }
}
