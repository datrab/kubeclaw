import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readBusterStartupHandoff } from './buster-startup.ts';

function same(a, b) {
  const keys = a.isDirectory() ? ['dev', 'ino', 'mode', 'uid', 'gid']
    : ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
  return a.isDirectory() === b.isDirectory() && a.isFile() === b.isFile() && keys.every(key => a[key] === b[key]);
}

/** Retained file trust only; the parent still must authorize this exact boot on fd3. */
export function captureBusterStartupFile(base) {
  if (typeof base !== 'string' || !path.isAbsolute(base) || path.resolve(base) !== base || base === '/') throw new Error('BUSTER_STARTUP_ROOT_INVALID');
  const observations = [];
  let closed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      for (const { fd } of observations) fs.closeSync(fd);
    }
  };
  const assertCurrent = () => {
    if (closed) throw new Error('BUSTER_STARTUP_CAPTURE_CLOSED');
    for (const { file, fd, before } of observations) {
      if (!same(before, fs.fstatSync(fd, { bigint: true })) || !same(before, fs.lstatSync(file, { bigint: true }))) throw new Error('BUSTER_STARTUP_FILE_CHANGED');
    }
  };
  function directory(file, configRoot = false) {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    const before = fs.fstatSync(fd, { bigint: true });
    observations.push({ file, fd, before });
    if (!before.isDirectory() || before.uid !== 0n || (before.mode & 0o022n) !== 0n
      || (configRoot && (before.gid !== 1000n || (before.mode & 0o777n) !== 0o750n))) throw new Error('BUSTER_STARTUP_DIRECTORY_NOT_TRUSTED');
  }
  try {
    directory('/');
    let current = '/';
    for (const part of base.split('/').filter(Boolean)) { current = path.join(current, part); directory(current); }
    directory(path.join(base, 'config'), true);
    const file = path.join(base, 'config/pipeline-startup.json');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const before = fs.fstatSync(fd, { bigint: true });
    observations.push({ file, fd, before });
    if (!before.isFile() || before.uid !== 0n || before.gid !== 1000n || before.nlink !== 1n
      || (before.mode & 0o777n) !== 0o440n || before.size > 65536n) throw new Error('BUSTER_STARTUP_FILE_NOT_TRUSTED');
    const handoff = readBusterStartupHandoff(JSON.parse(fs.readFileSync(fd).toString('utf8')));
    assertCurrent();
    return Object.freeze({ handoff, assertCurrent, close });
  } catch (error) { close(); throw error; }
}
export function captureProductiveBusterStartupFile() {
  return captureBusterStartupFile('/run/kubeclaw-buster');
}

/** Root parent publication after recovery: link is atomic and never replaces A.
 * A pre-existing handoff is recovery input, even if it has the same digest.
 */
export function publishBusterStartupFile(base, value) {
  const handoff = readBusterStartupHandoff(value);
  if (process.getuid?.() !== 0 || typeof base !== 'string' || !path.isAbsolute(base)
    || path.resolve(base) !== base || base === '/') throw new Error('BUSTER_STARTUP_ROOT_INVALID');
  const directories = [];
  let temporary;
  let fileDescriptor;
  try {
    let current = '/';
    for (const part of ['', ...base.split('/').filter(Boolean), 'config']) {
      current = part ? path.join(current, part) : current;
      const fd = fs.openSync(current, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      const before = fs.fstatSync(fd, { bigint: true });
      directories.push({ fd, file: current, before });
      if (!before.isDirectory() || before.uid !== 0n || (before.mode & 0o022n) !== 0n
        || (part === 'config' && (before.gid !== 1000n || (before.mode & 0o777n) !== 0o750n))) {
        throw new Error('BUSTER_STARTUP_DIRECTORY_NOT_TRUSTED');
      }
    }
    const assertDirectories = () => {
      for (const { fd, file, before } of directories) if (!same(before, fs.fstatSync(fd, { bigint: true }))
        || !same(before, fs.lstatSync(file, { bigint: true }))) throw new Error('BUSTER_STARTUP_FILE_CHANGED');
    };
    const root = path.join(base, 'config');
    const destination = path.join(root, 'pipeline-startup.json');
    temporary = path.join(root, `.pipeline-startup-${randomUUID()}`);
    fileDescriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY
      | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(fileDescriptor, `${JSON.stringify(handoff)}\n`);
    fs.fchownSync(fileDescriptor, 0, 1000);
    fs.fchmodSync(fileDescriptor, 0o440);
    fs.fsyncSync(fileDescriptor);
    assertDirectories();
    fs.linkSync(temporary, destination);
    fs.unlinkSync(temporary);
    temporary = undefined;
    fs.fsyncSync(directories.at(-1).fd);
    assertDirectories();
    return captureBusterStartupFile(base);
  } finally {
    if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
    if (temporary !== undefined) fs.unlinkSync(temporary);
    for (const { fd } of directories) fs.closeSync(fd);
  }
}
