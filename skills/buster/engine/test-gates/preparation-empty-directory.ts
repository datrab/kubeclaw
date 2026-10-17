import fs from 'node:fs';
import path from 'node:path';

/** Physical absence check, not a ledger decoder or a retirement certificate.
 * Missing/inaccessible roots and even empty state files are NOT empty stores.
 * The caller retains the lifetime/native supervisor fences throughout.
 */
export function retainEmptyPreparationDirectory(directory: string, uid: 0 | 1000 = 0): {
  readonly assertCurrent: () => void;
  readonly close: () => void;
} {
  return retainDirectory(directory, uid, () => {
    if (fs.readdirSync(directory).length !== 0) throw new Error('BUSTER_INITIAL_STATE_PRIOR_STATE_UNACCOUNTED');
  });
}

/** Physical INITIAL proof for the exact layout made by prepareBusterStateRoot.
 * The parent is a closed inventory, not an empty store: every expected child
 * must exist with its original owner and be empty. Retain all named inodes
 * across the metadata fence; replacing an empty child is not the same proof.
 * This grants no native/source authority or permission to recover retained A.
 */
export function retainInitialPreparationStores(directory: string) {
  const stores = [
    ['native-sources', 0], ['plan-jobs', 0], ['runs', 0],
    ['plan-jobs-v2', 1000], ['runs-v2', 1000],
  ] as const;
  const names = stores.map(([name]) => name).sort().join(',');
  const retained: { assertCurrent: () => void; close: () => void }[] = [];
  try {
    retained.push(retainDirectory(directory, 0, () => {
      if (fs.readdirSync(directory).sort().join(',') !== names) {
        throw new Error('BUSTER_INITIAL_STATE_PRIOR_STATE_UNACCOUNTED');
      }
    }));
    for (const [name, uid] of stores) retained.push(retainEmptyPreparationDirectory(path.join(directory, name), uid));
    const assertCurrent = () => {
      for (const capture of retained) capture.assertCurrent();
      // Bracket child checks with the parent's retained-inode/inventory proof.
      retained[0]!.assertCurrent();
    };
    assertCurrent();
    return Object.freeze({ assertCurrent, close: () => { for (const capture of retained) capture.close(); } });
  } catch (error) { for (const capture of retained) capture.close(); throw error; }
}

/** Before ORIGINAL publication, an absent active pointer is insufficient.
 * Only the existing fence files may inhabit the otherwise pristine ownership
 * store. Even an empty owners.json, journal or original-boots directory denies.
 * This is physical evidence only, not native facts or permission to activate.
 */
export function retainUninitializedOwnershipDirectory(directory: string) {
  const lock = (file: string) => {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const stat = fs.fstatSync(fd, { bigint: true });
      const named = fs.lstatSync(file, { bigint: true });
      if (!stat.isFile() || stat.uid !== 0n || stat.nlink !== 1n || stat.size !== 0n
        || (stat.mode & 0o777n) !== 0o600n || named.dev !== stat.dev || named.ino !== stat.ino) {
        throw new Error('BUSTER_INITIAL_STATE_PRIOR_STATE_UNACCOUNTED');
      }
    } finally { fs.closeSync(fd); }
  };
  return retainDirectory(directory, 0, () => {
    for (const entry of fs.readdirSync(directory)) {
      if (entry === '.write-lock') { lock(path.join(directory, entry)); continue; }
      if (entry === 'supervisor') {
        const supervisor = path.join(directory, entry);
        const fd = fs.openSync(supervisor, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
        try {
          const before = fs.fstatSync(fd, { bigint: true });
          if (before.uid !== 0n || (before.mode & 0o022n) !== 0n
            || fs.readdirSync(supervisor).join(',') !== '.write-lock') {
            throw new Error('BUSTER_INITIAL_STATE_PRIOR_STATE_UNACCOUNTED');
          }
          lock(path.join(supervisor, '.write-lock'));
          const after = fs.lstatSync(supervisor, { bigint: true });
          if (!after.isDirectory() || ['dev', 'ino', 'mode', 'uid', 'gid'].some(key =>
            before[key as keyof fs.BigIntStats] !== after[key as keyof fs.BigIntStats])) {
            throw new Error('BUSTER_INITIAL_STATE_DIRECTORY_CHANGED');
          }
        } finally { fs.closeSync(fd); }
        continue;
      }
      throw new Error('BUSTER_INITIAL_STATE_PRIOR_STATE_UNACCOUNTED');
    }
  });
}

function retainDirectory(directory: string, uid: 0 | 1000, assertContents: () => void) {
  if (process.getuid?.() !== 0 || !path.isAbsolute(directory) || path.resolve(directory) !== directory || directory === '/') {
    throw new Error('BUSTER_INITIAL_STATE_PATH_INVALID');
  }
  const observations: { file: string; fd: number; before: fs.BigIntStats }[] = [];
  let closed = false;
  const close = () => {
    if (!closed) { closed = true; for (const observation of observations) fs.closeSync(observation.fd); }
  };
  try {
    let current = '/';
    for (const part of ['', ...directory.split('/').filter(Boolean)]) {
      if (part) current = path.join(current, part);
      const fd = fs.openSync(current, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      const before = fs.fstatSync(fd, { bigint: true });
      observations.push({ file: current, fd, before });
      const expectedUid = current === directory ? uid : 0;
      if (!before.isDirectory() || before.uid !== BigInt(expectedUid) || (before.mode & 0o022n) !== 0n) {
        throw new Error('BUSTER_INITIAL_STATE_DIRECTORY_NOT_TRUSTED');
      }
    }
    const assertCurrent = () => {
      if (closed) throw new Error('BUSTER_INITIAL_STATE_CAPTURE_CLOSED');
      for (const { file, fd, before } of observations) {
        for (const after of [fs.fstatSync(fd, { bigint: true }), fs.lstatSync(file, { bigint: true })]) {
          if (!after.isDirectory() || ['dev', 'ino', 'mode', 'uid', 'gid'].some(key =>
            before[key as keyof fs.BigIntStats] !== after[key as keyof fs.BigIntStats])) {
            throw new Error('BUSTER_INITIAL_STATE_DIRECTORY_CHANGED');
          }
        }
      }
      assertContents();
      // Recheck the named inode after enumeration as well; never accept a
      // replacement empty directory in place of the retained physical store.
      const retained = observations.at(-1)!;
      const named = fs.lstatSync(directory, { bigint: true });
      if (!named.isDirectory() || named.dev !== retained.before.dev || named.ino !== retained.before.ino) {
        throw new Error('BUSTER_INITIAL_STATE_DIRECTORY_CHANGED');
      }
    };
    assertCurrent();
    return Object.freeze({ assertCurrent, close });
  } catch (error) { close(); throw error; }
}
