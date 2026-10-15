import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function assertTrustedDirectory(directory, code) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) throw new Error(code);
}

function validateConfigFiles(root) {
  const allowed = ['platform.json', 'runtime.json', 'kubeconfig', 'buildkit.toml', 'buildkit.log', 'pipeline-startup.json'];
  for (const name of fs.readdirSync(root)) {
    if (!allowed.includes(name)) throw new Error('BUSTER_CONFIG_UNEXPECTED_ENTRY');
    const stat = fs.lstatSync(path.join(root, name));
    if (!stat.isFile() || stat.uid !== 0 || stat.nlink !== 1 || (stat.mode & 0o022) !== 0) {
      throw new Error('BUSTER_CONFIG_FILE_NOT_TRUSTED');
    }
  }
}

/** Fixed image-owned namespace: never adopt a builder-owned directory or follow a link. */
function assertTrustedBase(base) {
  if (!path.isAbsolute(base) || path.resolve(base) !== base || base === '/') throw new Error('BUSTER_CONFIG_ROOT_INVALID');
  let current = '/';
  assertTrustedDirectory(current, 'BUSTER_CONFIG_ANCESTOR_NOT_TRUSTED');
  for (const part of base.split('/').filter(Boolean)) {
    current = path.join(current, part);
    assertTrustedDirectory(current, 'BUSTER_CONFIG_ANCESTOR_NOT_TRUSTED');
  }
}

/** Initialize/validate only the stable lock inode; never touch generated config before flock. */
export function prepareBusterLifetimeLock(base) {
  assertTrustedBase(base);
  const file = path.join(base, 'lifetime.lock');
  const lock = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_RDWR | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
  try {
    const stat = fs.fstatSync(lock);
    if (!stat.isFile() || stat.uid !== 0 || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600) {
      throw new Error('BUSTER_CONFIG_LOCK_NOT_TRUSTED');
    }
  } finally { fs.closeSync(lock); }
  return file;
}

export function prepareBusterRuntimeConfigRoot(base) {
  prepareBusterLifetimeLock(base);
  const root = path.join(base, 'config');
  try { fs.mkdirSync(root, { mode: 0o750 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  assertTrustedDirectory(root, 'BUSTER_CONFIG_ROOT_NOT_TRUSTED');
  validateConfigFiles(root);
  fs.chownSync(root, 0, 1000);
  fs.chmodSync(root, 0o750);
  return root;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length === 3 && process.argv[2] === '--lifetime-lock') {
    process.stdout.write(prepareBusterLifetimeLock('/run/kubeclaw-buster'));
  } else {
    if (process.argv.length !== 2) throw new Error('Usage: buster-runtime-config-root.mjs [--lifetime-lock]');
    process.stdout.write(prepareBusterRuntimeConfigRoot('/run/kubeclaw-buster'));
  }
}
