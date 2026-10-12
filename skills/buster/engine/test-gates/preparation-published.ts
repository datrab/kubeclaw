import fs from 'node:fs/promises';
import path from 'node:path';
import { assertPreparedSource, preparationDigest, type PreparedSourceReference } from './preparation-header.ts';
import type { PreparedAdmission } from './preparation-client.ts';
import { preparationSourceDirectory } from './preparation-source.ts';

/** Check the immutable parent-published lease again when replaying service metadata. */
export async function publishedPreparationRepository(root: string, source: PreparedSourceReference,
  maximumMetadataBytes: number): Promise<string> {
  const directory = preparationSourceDirectory(root, source.admissionId);
  await assertPublishedAncestors(root);
  const gate = path.dirname(directory);
  const gateStat = await fs.lstat(gate);
  if (!gateStat.isDirectory() || gateStat.uid !== 0 || gateStat.gid !== 1000 || (gateStat.mode & 0o7777) !== 0o750) {
    throw new Error('BUSTER_PREPARATION_SOURCE_NOT_PUBLISHED');
  }
  const file = path.join(directory, 'source.json');
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.uid !== source.preparationUid || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o444
    || stat.size > maximumMetadataBytes) throw new Error('BUSTER_PREPARATION_SOURCE_METADATA_INVALID');
  const prepared = JSON.parse(await fs.readFile(file, 'utf8')) as PreparedAdmission;
  assertPreparedSource(prepared.source, prepared.job);
  if (preparationDigest(prepared.source) !== preparationDigest(source)) throw new Error('BUSTER_PREPARATION_SOURCE_CHANGED');
  const repository = path.join(directory, 'repository');
  if (await fs.realpath(repository) !== repository) throw new Error('BUSTER_PREPARATION_SOURCE_SYMLINK');
  const repositoryStat = await fs.lstat(repository);
  if (!repositoryStat.isDirectory() || repositoryStat.uid !== source.preparationUid || (repositoryStat.mode & 0o777) !== 0o755) {
    throw new Error('BUSTER_PREPARATION_SOURCE_PERMISSIONS_INVALID');
  }
  return repository;
}

async function assertPublishedAncestors(root: string): Promise<void> {
  let ancestor = '/';
  for (const part of root.split('/').filter(Boolean)) {
    ancestor = path.join(ancestor, part);
    const stat = await fs.lstat(ancestor);
    if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) throw new Error('BUSTER_PREPARATION_SOURCE_ANCESTOR_INVALID');
  }
}
