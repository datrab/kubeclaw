import fs from 'node:fs';
import path from 'node:path';
import { repositoryRelativePath } from './revision-reader.ts';

const DIRECTORY = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
function forbidden(cause?: unknown): Error { return new Error('REPOSITORY_PATH_FORBIDDEN', { cause }); }
function inside(candidate: string, root: string): boolean { return candidate === root || candidate.startsWith(`${root}${path.sep}`); }
function canonicalFile(root: string, relative: string): string {
  if (fs.lstatSync(root).isSymbolicLink() || fs.realpathSync(root) !== root) throw forbidden();
  let current = root;
  for (const component of repositoryRelativePath(relative).split('/')) {
    current = path.join(current, component);
    let stat: fs.Stats;
    try { stat = fs.lstatSync(current); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('REPOSITORY_FILE_NOT_FOUND', { cause: error });
      throw error;
    }
    try { current = fs.realpathSync(current); }
    catch (error) {
      if (stat.isSymbolicLink()) throw forbidden(error);
      throw error;
    }
    if (!inside(current, root)) throw forbidden();
  }
  return current;
}
function openDirectory(root: string): number {
  let descriptor = fs.openSync(path.parse(root).root, DIRECTORY);
  try {
    for (const component of root.split(path.sep).filter(Boolean)) {
      const next = fs.openSync(`/proc/self/fd/${descriptor}/${component}`, DIRECTORY);
      fs.closeSync(descriptor); descriptor = next;
    }
    return descriptor;
  } catch (error) { fs.closeSync(descriptor); throw forbidden(error); }
}
export function readRepositoryFile(root: string, relative: string, maximum: number): { content: string; sizeBytes: number; path: string } {
  // Resolve allowed internal links, then open the resolved path with no-follow
  // descriptors so a later directory-to-symlink swap cannot redirect the read.
  const canonical = canonicalFile(root, relative);
  const components = path.relative(root, canonical).split(path.sep);
  let directory = openDirectory(root);
  let descriptor: number | undefined;
  try {
    for (const component of components.slice(0, -1)) {
      const next = fs.openSync(`/proc/self/fd/${directory}/${component}`, DIRECTORY);
      fs.closeSync(directory); directory = next;
    }
    descriptor = fs.openSync(`/proc/self/fd/${directory}/${components.at(-1)}`, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new Error('REPOSITORY_NOT_A_FILE');
    if (stat.size > maximum) throw new Error(`REPOSITORY_FILE_TOO_LARGE:${stat.size}:${maximum}`);
    const bytes = Buffer.alloc(stat.size);
    const count = fs.readSync(descriptor, bytes, 0, bytes.length, 0);
    if (count !== stat.size || fs.fstatSync(descriptor).size !== stat.size) throw new Error('REPOSITORY_FILE_CHANGED_DURING_READ');
    const content = bytes.toString('utf8');
    return { content, sizeBytes: Buffer.byteLength(content), path: repositoryRelativePath(relative) };
  } catch (error) {
    if (['ELOOP', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw forbidden(error);
    throw error;
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); fs.closeSync(directory); }
}
