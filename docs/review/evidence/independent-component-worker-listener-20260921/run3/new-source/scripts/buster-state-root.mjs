import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Fixed PVC handoff. Never walk/chown descendants or reopen sealed legacy records. */
export function prepareBusterStateRoot() {
  if (process.getuid?.() !== 0) throw new Error('BUSTER_STATE_ROOT_AUTHORITY_REQUIRED');
  const root = '/var/lib/buster-v2';
  for (const directory of ['/var', '/var/lib']) {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) {
      throw new Error('BUSTER_STATE_ANCESTOR_NOT_TRUSTED');
    }
  }
  directory(root, 0, 0o755);
  legacyDirectory(path.join(root, 'plan-jobs'));
  directory(path.join(root, 'native-sources'), 0, 0o755);
  let historical = true;
  try { fs.lstatSync(path.join(root, 'plan-jobs', 'records', 'store.json')); }
  catch (error) { if (error.code === 'ENOENT') historical = false; else throw error; }
  if (!historical) directory(path.join(root, 'plan-jobs-v2'), 1000, 0o700);
  legacyDirectory(path.join(root, 'runs'));
  directory(path.join(root, 'runs-v2'), 1000, 0o700);
}

function legacyDirectory(file) {
  try { fs.mkdirSync(file, { mode: 0o755 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = fs.lstatSync(file);
  if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) {
    throw new Error('BUSTER_LEGACY_STATE_AUTHORITY_REQUIRED');
  }
}

function directory(file, uid, mode) {
  try { fs.mkdirSync(file, { mode }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const before = fs.lstatSync(file);
  if (!before.isDirectory() || ![0, 1000].includes(before.uid)) throw new Error('BUSTER_STATE_DIRECTORY_NOT_TRUSTED');
  fs.chmodSync(file, mode);
  fs.chownSync(file, uid, uid);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try {
    const after = fs.fstatSync(fd);
    if (after.dev !== before.dev || after.ino !== before.ino) throw new Error('BUSTER_STATE_DIRECTORY_CHANGED');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Usage: buster-state-root.mjs');
  prepareBusterStateRoot();
}
