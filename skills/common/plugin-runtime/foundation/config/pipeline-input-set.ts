import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface PipelineInputMember {
  readonly relativePath: string;
  readonly byteLength: number;
  readonly sha256: string;
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function membersInWireOrder(members: readonly PipelineInputMember[]) {
  if (!Array.isArray(members) || members.length === 0) throw new Error('PIPELINE_INPUT_SET_REQUIRED');
  const seen = new Set<string>();
  const snapshot = members.map((member: PipelineInputMember) => {
    if (!member || typeof member.relativePath !== 'string' || !member.relativePath
      || /[\\\x00-\x20\x7f]/u.test(member.relativePath) || path.isAbsolute(member.relativePath)
      || member.relativePath.split('/').some(part => !part || part === '.' || part === '..')
      || Buffer.from(member.relativePath).toString('utf8') !== member.relativePath
      || Buffer.byteLength(member.relativePath) > 0xffffffff || seen.has(member.relativePath)
      || !Number.isSafeInteger(member.byteLength) || member.byteLength < 0
      || typeof member.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(member.sha256)) {
      throw new Error('PIPELINE_INPUT_MEMBER_INVALID');
    }
    seen.add(member.relativePath);
    return Object.freeze({ relativePath: member.relativePath, byteLength: member.byteLength, sha256: member.sha256 });
  });
  return Object.freeze(snapshot.sort((a, b) => Buffer.compare(Buffer.from(a.relativePath), Buffer.from(b.relativePath))));
}

/** Exact reviewed same-entry-input-generation.v1 codec, not JSON object hash.
 * Raw path UTF8 + u32BE length + u64BE bytes + 32 RAW digest bytes, sorted UTF8,
 * prefixed kubeclaw.same-entry.input.v1 NUL. This digest is NOT authentication.
 */
export function hashPipelineInputSet(members: readonly PipelineInputMember[]): string {
  const digest = createHash('sha256').update(Buffer.from('kubeclaw.same-entry.input.v1\0'));
  for (const member of membersInWireOrder(members)) {
    const name = Buffer.from(member.relativePath), length = Buffer.alloc(4), size = Buffer.alloc(8);
    length.writeUInt32BE(name.byteLength); size.writeBigUInt64BE(BigInt(member.byteLength));
    digest.update(length).update(name).update(size).update(Buffer.from(member.sha256, 'hex'));
  }
  return digest.digest('hex');
}
const same = (a: fs.BigIntStats, b: fs.BigIntStats, directory = false) =>
  (directory ? ['dev', 'ino', 'mode', 'uid', 'gid'] : ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'])
    .every(key => a[key as keyof fs.BigIntStats] === b[key as keyof fs.BigIntStats]);

/** Read exactly the declared physical source set, retain descriptors through
 * publication. No recursive latest-tree inclusion, symlink alias, missing input
 * fill, activation grant or separate author. Existing v3 and complete future v10
 * callers must supply their ENTIRE admitted input set, not only selected policy.
 */
export function capturePipelineInputSet(root: string, members: readonly PipelineInputMember[]) {
  const ordered = membersInWireOrder(members);
  if (!path.isAbsolute(root) || path.resolve(root) !== root) throw new Error('PIPELINE_INPUT_ROOT_INVALID');
  const observations: { file: string; fd: number; before: fs.BigIntStats; directory: boolean }[] = [];
  const directories = new Set<string>(), files = new Map<string, Buffer>();
  let closed = false;
  const close = () => { if (!closed) { closed = true; for (const { fd } of observations) fs.closeSync(fd); } };
  const observe = (file: string, directory: boolean) => {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
      | (directory ? fs.constants.O_DIRECTORY : fs.constants.O_NONBLOCK));
    let before: fs.BigIntStats;
    try { before = fs.fstatSync(fd, { bigint: true }); }
    catch (error) { fs.closeSync(fd); throw error; }
    observations.push({ file, fd, before, directory });
    if (directory ? !before.isDirectory() : !before.isFile()) throw new Error('PIPELINE_INPUT_NOT_PHYSICAL');
    return observations.at(-1)!;
  };
  const ancestors = (file: string) => {
    let current = '/';
    for (const part of ['', ...path.dirname(file).split('/').filter(Boolean)]) {
      if (part) current = path.join(current, part);
      if (!directories.has(current)) { observe(current, true); directories.add(current); }
    }
  };
  const read = (fd: number, length: number) => {
    const bytes = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const amount = fs.readSync(fd, bytes, offset, length - offset, offset);
      if (!amount) throw new Error('PIPELINE_INPUT_CHANGED');
      offset += amount;
    }
    return bytes;
  };
  const assertCurrent = () => {
    if (closed) throw new Error('PIPELINE_INPUT_CAPTURE_CLOSED');
    for (const item of observations) {
      if (!same(item.before, fs.fstatSync(item.fd, { bigint: true }), item.directory)
        || !same(item.before, fs.lstatSync(item.file, { bigint: true }), item.directory)) throw new Error('PIPELINE_INPUT_CHANGED');
      if (!item.directory) {
        const name = path.relative(root, item.file), bytes = files.get(name)!;
        if (!read(item.fd, bytes.byteLength).equals(bytes)
          || !same(item.before, fs.fstatSync(item.fd, { bigint: true }))) throw new Error('PIPELINE_INPUT_CHANGED');
      }
    }
  };
  try {
    for (const member of ordered) {
      const file = path.join(root, member.relativePath); ancestors(file);
      const item = observe(file, false);
      if (item.before.size !== BigInt(member.byteLength)) throw new Error('PIPELINE_INPUT_SIZE_MISMATCH');
      const bytes = read(item.fd, member.byteLength);
      if (hash(bytes) !== member.sha256) throw new Error('PIPELINE_INPUT_DIGEST_MISMATCH');
      files.set(member.relativePath, bytes);
    }
    assertCurrent();
    return Object.freeze({ members: ordered, inputGenerationSha256: hashPipelineInputSet(ordered), assertCurrent, close,
      read: (name: string) => {
        if (closed) throw new Error('PIPELINE_INPUT_CAPTURE_CLOSED');
        const bytes = files.get(name); if (!bytes) throw new Error('PIPELINE_INPUT_NOT_ADMITTED');
        return Buffer.from(bytes);
      } });
  } catch (error) { close(); throw error; }
}
