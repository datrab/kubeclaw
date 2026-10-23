import fs from 'node:fs';
import path from 'node:path';
import { portableJson } from '@kubeclaw/plugin-sdk/values';
import { validateRuntimeBundleReceipt, runtimeBundleFiles } from './runtime-bundle-receipt.mjs';

/** Restore inert original bytes only. This is NOT native execution authority,
 * retirement proof or permission to resolve absolute runtime paths against B.
 * The public caller first authenticates the named durable source archive.
 */
export function restoreBusterSourceClosure(closure, destination) {
  if (process.getuid?.() !== 0 || !path.isAbsolute(destination) || path.resolve(destination) !== destination || destination === '/') {
    throw new Error('BUSTER_BOOT_REPLAY_DESTINATION_INVALID');
  }
  if (closure.schemaVersion !== 'buster-boot-source-closure.v2') throw new Error('BUSTER_BOOT_REPLAY_CODE_CLOSURE_REQUIRED');
  const source = new Map(closure.files.map(file => [file.name, file]));
  const manifestBytes = Buffer.from(source.get('generation/package-receipt.json').bytes, 'base64');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  validateRuntimeBundleReceipt(manifest, 'buster', '/app/skills');
  if (!source.get('generation/installed-manifest.json')
    || !Buffer.from(source.get('generation/installed-manifest.json').bytes, 'base64').equals(manifestBytes)) {
    throw new Error('BUSTER_BOOT_REPLAY_MANIFEST_MISMATCH');
  }
  const planned = [];
  for (const file of closure.files) {
    if (file.name.startsWith('generation/') && file.name !== 'generation/installed-manifest.json') {
      planned.push({ name: `system/${file.name.slice('generation/'.length)}`, bytes: Buffer.from(file.bytes, 'base64'), mode: 0o444 });
    } else if (file.name.startsWith('reader/')) {
      planned.push({ name: file.name, bytes: Buffer.from(file.bytes, 'base64'), mode: 0o444 });
    }
  }
  planned.push({ name: 'package/manifest.json', bytes: manifestBytes, mode: 0o444 });
  for (const file of manifest.files) {
    const archived = source.get(`${file.kind === 'file' ? 'package' : 'package-alias'}/${file.path}`);
    if (!archived) throw new Error('BUSTER_BOOT_REPLAY_CODE_CLOSURE_REQUIRED');
    planned.push(file.kind === 'file'
      ? { name: `package/${file.path}`, bytes: Buffer.from(archived.bytes, 'base64'), mode: file.mode }
      : { name: `package/${file.path}`, target: file.target });
  }
  // No write may traverse a planned file/alias as a directory. Check the whole
  // restore set before creating even the destination; aliases are emitted last.
  const names = new Set(planned.map(file => file.name));
  if (names.size !== planned.length) throw new Error('BUSTER_BOOT_REPLAY_PATH_CONFLICT');
  for (const file of planned) {
    for (let parent = path.posix.dirname(file.name); parent !== '.'; parent = path.posix.dirname(parent)) {
      if (names.has(parent)) throw new Error('BUSTER_BOOT_REPLAY_PATH_CONFLICT');
    }
  }
  const observations = [];
  const directory = (file, create) => {
    if (create) fs.mkdirSync(file, { mode: 0o755 });
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    const before = fs.fstatSync(fd, { bigint: true });
    observations.push({ file, fd, before });
    if (!before.isDirectory() || before.uid !== 0n || (before.mode & 0o022n) !== 0n) throw new Error('BUSTER_BOOT_REPLAY_DIRECTORY_NOT_TRUSTED');
  };
  const assertDirectories = () => {
    for (const { file, fd, before } of observations) {
      for (const after of [fs.fstatSync(fd, { bigint: true }), fs.lstatSync(file, { bigint: true })]) {
        if (!after.isDirectory() || ['dev', 'ino', 'mode', 'uid', 'gid'].some(key => after[key] !== before[key])) {
          throw new Error('BUSTER_BOOT_REPLAY_DIRECTORY_CHANGED');
        }
      }
    }
  };
  try {
    let current = '/';
    directory(current, false);
    for (const part of path.dirname(destination).split('/').filter(Boolean)) {
      current = path.join(current, part); directory(current, false);
    }
    // mkdir is the no-replace publication reservation, including empty existing
    // directories. Partial writes/crash residue remain unresolved and are never
    // deleted, reused, repaired from B or mistaken for a completed replay.
    fs.mkdirSync(destination, { mode: 0o700 });
    directory(destination, false);
    fs.fsyncSync(observations.at(-2).fd);
    const directories = new Set(['']);
    for (const file of planned.filter(file => file.target === undefined)) {
      const relativeParent = path.posix.dirname(file.name);
      let relative = '';
      for (const part of relativeParent.split('/')) {
        relative = relative ? `${relative}/${part}` : part;
        if (!directories.has(relative)) { directory(path.join(destination, relative), true); directories.add(relative); }
      }
      const fd = fs.openSync(path.join(destination, file.name), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      try { fs.writeFileSync(fd, file.bytes); fs.fchmodSync(fd, file.mode); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
    }
    for (const file of planned.filter(file => file.target !== undefined)) {
      // Existing package parents were created solely by this restoration. A
      // symlink-only parent still needs an authentic fresh directory.
      let relative = '';
      for (const part of path.posix.dirname(file.name).split('/')) {
        relative = relative ? `${relative}/${part}` : part;
        if (!directories.has(relative)) { directory(path.join(destination, relative), true); directories.add(relative); }
      }
      fs.symlinkSync(file.target, path.join(destination, file.name));
    }
    assertDirectories();
    const actual = runtimeBundleFiles(path.join(destination, 'package'));
    if (portableJson(actual) !== portableJson([...manifest.files].sort((a, b) => a.path < b.path ? -1 : 1))) {
      throw new Error('BUSTER_BOOT_REPLAY_PACKAGE_MISMATCH');
    }
    for (const { fd } of [...observations].reverse()) fs.fsyncSync(fd);
    assertDirectories();
    return Object.freeze({ schemaVersion: 'buster-inert-original-source-replay.v1', destination,
      packageRoot: path.join(destination, 'package'), systemRoot: path.join(destination, 'system'),
      readerRoot: path.join(destination, 'reader'), expectedReceipt: closure.expectedReceipt });
  } finally { for (const { fd } of observations) fs.closeSync(fd); }
}
