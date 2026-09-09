import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DIRECTORY = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const anchor = (descriptor: number): string => `/proc/self/fd/${descriptor}`;
function failure(error: unknown): Error { return new Error('OPENCLAW_RESULT_PATH_INVALID', { cause: error }); }

function descend(parent: number, name: string, create: boolean): number {
  const candidate = `${anchor(parent)}/${name}`;
  if (create) {
    try { fs.mkdirSync(candidate, { mode: 0o700 }); fs.fsyncSync(parent); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  return fs.openSync(candidate, DIRECTORY);
}
function openRoot(root: string): number {
  if (!path.isAbsolute(root) || path.resolve(root) !== root) throw failure('noncanonical root');
  let descriptor = fs.openSync(path.parse(root).root, DIRECTORY);
  try {
    for (const segment of root.split(path.sep).filter(Boolean)) {
      const next = descend(descriptor, segment, false); fs.closeSync(descriptor); descriptor = next;
    }
    return descriptor;
  } catch (error) { fs.closeSync(descriptor); throw failure(error); }
}
function parts(relative: string): string[] {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || /[\\\u0000-\u001f\u007f]/u.test(relative)) throw failure('invalid relative path');
  const components = relative.split('/');
  if (components.some((part) => !part || part === '.' || part === '..')) throw failure('invalid path component');
  return components;
}
function sameExisting(destination: string, content: Buffer): boolean {
  const descriptor = fs.openSync(destination, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size !== content.length) return false;
    const bytes = Buffer.alloc(content.length + 1);
    const count = fs.readSync(descriptor, bytes, 0, bytes.length, 0);
    return count === content.length && bytes.subarray(0, count).equals(content);
  } finally { fs.closeSync(descriptor); }
}

/** Linux directory descriptors pin each ancestor; no lexical-path publish. */
export function persistResult(root: string, relative: string, content: string): void {
  const components = parts(relative);
  let directory = openRoot(root);
  try {
    for (const component of components.slice(0, -1)) {
      const next = descend(directory, component, true); fs.closeSync(directory); directory = next;
    }
    const resolved = fs.realpathSync(anchor(directory));
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw failure('moved parent');
    publish(directory, components.at(-1)!, Buffer.from(content));
  } catch (error) {
    if (error instanceof Error && error.message === 'OPENCLAW_RESULT_PATH_INVALID') throw error;
    throw failure(error);
  } finally { fs.closeSync(directory); }
}
function publish(directory: number, leaf: string, content: Buffer): void {
  const temporary = `${anchor(directory)}/.result-${crypto.randomUUID()}.tmp`;
  const destination = `${anchor(directory)}/${leaf}`;
  const descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    try { fs.writeFileSync(descriptor, content); fs.fsyncSync(descriptor); }
    finally { fs.closeSync(descriptor); }
    try { fs.linkSync(temporary, destination); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !sameExisting(destination, content)) throw error;
    }
    fs.fsyncSync(directory);
  } finally { fs.unlinkSync(temporary); fs.fsyncSync(directory); }
}
