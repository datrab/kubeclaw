import fs from 'node:fs';
import path from 'node:path';

/** Physical byte accounting only, NOT authentication of a capsule, native host
 * or retirement. Called under the SAME owners.json metadata fence as writers.
 * Unknown/partial entries remain unresolved, never disappear as zero bytes.
 */
export function originalBootMetadataBytes(root: string, maximumRecords: number, maximumBytes: number,
  maximumAssociationBytes: number): number {
  if (!path.isAbsolute(root) || path.resolve(root) !== root || root === '/'
    || [maximumRecords, maximumBytes, maximumAssociationBytes].some(value => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error('BUSTER_ORIGINAL_BOOT_STORE_CONFIG_INVALID');
  }
  const observations: { file: string; fd: number; stat: fs.BigIntStats }[] = [];
  let total = 0;
  const directory = (file: string) => {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd, { bigint: true }); observations.push({ file, fd, stat });
    if (!stat.isDirectory() || stat.uid !== 0n || (stat.mode & 0o022n) !== 0n) throw new Error('BUSTER_ORIGINAL_BOOT_ANCESTOR_NOT_TRUSTED');
  };
  const file = (location: string, association: boolean) => {
    const fd = fs.openSync(location, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const before = fs.fstatSync(fd, { bigint: true });
      if (!before.isFile() || before.uid !== 0n || before.nlink !== 1n || (before.mode & 0o777n) !== 0o444n
        || before.size > BigInt(association ? maximumAssociationBytes : maximumBytes)) throw new Error('BUSTER_ORIGINAL_BOOT_FILE_NOT_TRUSTED');
      for (const after of [fs.fstatSync(fd, { bigint: true }), fs.lstatSync(location, { bigint: true })]) {
        if (['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].some(key =>
          before[key as keyof fs.BigIntStats] !== after[key as keyof fs.BigIntStats])) throw new Error('BUSTER_ORIGINAL_BOOT_FILE_CHANGED');
      }
      total += Number(before.size);
      if (!Number.isSafeInteger(total) || total > maximumBytes) throw new Error('BUSTER_ORIGINAL_BOOT_ASSOCIATION_CAPACITY');
    } finally { fs.closeSync(fd); }
  };
  try {
    let current = '/'; directory(current);
    for (const part of path.dirname(root).split('/').filter(Boolean)) { current = path.join(current, part); directory(current); }
    let exists = false;
    try { fs.lstatSync(root); exists = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (exists) {
      directory(root);
      let capsules = 0;
      for (const name of fs.readdirSync(root)) {
        const location = path.join(root, name);
        if (name === 'active.json') { file(location, true); continue; }
        if (/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json\.gz$/u.test(name)) {
          if (++capsules > maximumRecords) throw new Error('BUSTER_ORIGINAL_BOOT_ASSOCIATION_CAPACITY');
          file(location, false); continue;
        }
        if (!['owners', 'attempts', 'sources'].includes(name)) throw new Error('BUSTER_ORIGINAL_BOOT_RECORD_INVALID');
        directory(location);
        const members = fs.readdirSync(location);
        if (members.length > maximumRecords) throw new Error('BUSTER_ORIGINAL_BOOT_ASSOCIATION_CAPACITY');
        for (const member of members) {
          const valid = name === 'owners' ? /^worker-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.json$/u
            : name === 'sources' ? /^[a-f0-9]{64}\.json\.gz$/u : /^[a-f0-9]{64}\.json$/u;
          if (!valid.test(member)) throw new Error('BUSTER_ORIGINAL_BOOT_RECORD_INVALID');
          file(path.join(location, member), name !== 'sources');
        }
      }
    }
    for (const { file, fd, stat } of observations) {
      for (const after of [fs.fstatSync(fd, { bigint: true }), fs.lstatSync(file, { bigint: true })]) {
        if (!after.isDirectory() || ['dev', 'ino', 'mode', 'uid', 'gid'].some(key =>
          stat[key as keyof fs.BigIntStats] !== after[key as keyof fs.BigIntStats])) throw new Error('BUSTER_ORIGINAL_BOOT_STORE_CHANGED');
      }
    }
    return total;
  } finally { for (const { fd } of observations) fs.closeSync(fd); }
}
