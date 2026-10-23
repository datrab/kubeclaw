import fs from 'node:fs';
import path from 'node:path';
const verifiedLifetimeDescriptors = new WeakSet();
const verifiedLifetimeWitnesses = new WeakSet();

function same(a, b) {
  const keys = a.isDirectory() ? ['dev', 'ino', 'mode', 'uid', 'gid'] : ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink'];
  return a.isDirectory() === b.isDirectory() && a.isFile() === b.isFile() && keys.every(key => a[key] === b[key]);
}
function lockHeld(fd, stat) {
  // Linux fdinfo describes locks owned by this open file description, including inheritance.
  const major = ((stat.dev >> 8n) & 0xfffn) | ((stat.dev >> 32n) & ~0xfffn);
  const minor = (stat.dev & 0xffn) | ((stat.dev >> 12n) & ~0xffn);
  return fs.readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8').split('\n').some(line => {
    const match = /^lock:\s+\d+:\s+FLOCK\s+ADVISORY\s+WRITE\s+-?\d+\s+([a-f0-9]+):([a-f0-9]+):(\d+)\s+0\s+EOF$/u.exec(line);
    return match && BigInt(`0x${match[1]}`) === major && BigInt(`0x${match[2]}`) === minor && BigInt(match[3]) === stat.ino;
  });
}

/** Validate an already inherited exclusive lock. Never open/acquire a replacement or call LOCK_UN. */
export function captureBusterLifetimeDescriptor(base, descriptor = 9) {
  if (typeof base !== 'string' || !path.isAbsolute(base) || path.resolve(base) !== base || base === '/'
    || !Number.isSafeInteger(descriptor) || descriptor < 3) throw new Error('BUSTER_LIFETIME_DESCRIPTOR_INVALID');
  const ancestors = [];
  let current = '/';
  for (const part of ['', ...base.split('/').filter(Boolean)]) {
    current = part ? path.join(current, part) : current;
    const stat = fs.lstatSync(current, { bigint: true });
    ancestors.push({ file: current, stat });
    if (!stat.isDirectory() || stat.uid !== 0n || (stat.mode & 0o022n) !== 0n) throw new Error('BUSTER_LIFETIME_ANCESTOR_NOT_TRUSTED');
  }
  const file = path.join(base, 'lifetime.lock');
  const before = fs.fstatSync(descriptor, { bigint: true });
  if (!before.isFile() || before.uid !== 0n || before.nlink !== 1n || (before.mode & 0o777n) !== 0o600n
    || !same(before, fs.lstatSync(file, { bigint: true })) || !lockHeld(descriptor, before)) throw new Error('BUSTER_LIFETIME_INHERITED_LOCK_REQUIRED');
  let closed = false;
  function assertCurrent() {
    if (closed) throw new Error('BUSTER_LIFETIME_DESCRIPTOR_CLOSED');
    if (ancestors.some(({ file, stat }) => !same(stat, fs.lstatSync(file, { bigint: true })))) throw new Error('BUSTER_LIFETIME_ANCESTOR_CHANGED');
    if (!same(before, fs.fstatSync(descriptor, { bigint: true })) || !same(before, fs.lstatSync(file, { bigint: true }))
      || !lockHeld(descriptor, before)) throw new Error('BUSTER_LIFETIME_DESCRIPTOR_CHANGED');
  }
  const captured = Object.freeze({ descriptor, assertCurrent, close: () => {
    if (!closed) { closed = true; fs.closeSync(descriptor); }
  } });
  verifiedLifetimeDescriptors.add(captured);
  return captured;
}
export function assertBusterLifetimeDescriptor(value) {
  if (!value || typeof value !== 'object' || !verifiedLifetimeDescriptors.has(value)) throw new Error('BUSTER_LIFETIME_VERIFIED_DESCRIPTOR_REQUIRED');
  value.assertCurrent();
}
export function captureProductiveBusterLifetimeDescriptor() {
  return captureBusterLifetimeDescriptor('/run/kubeclaw-buster', 9);
}

/** Non-owning O_PATH witness. The root guardian retains exclusion until actual
 * service death; the child cannot alter that flock through this descriptor.
 */
export function captureBusterLifetimeWitness(base, descriptor = 9) {
  if (typeof base !== 'string' || !path.isAbsolute(base) || path.resolve(base) !== base || base === '/'
    || !Number.isSafeInteger(descriptor) || descriptor < 3) throw new Error('BUSTER_LIFETIME_WITNESS_INVALID');
  const ancestors = [];
  let current = '/';
  for (const part of ['', ...base.split('/').filter(Boolean)]) {
    current = part ? path.join(current, part) : current;
    const stat = fs.lstatSync(current, { bigint: true }); ancestors.push({ file: current, stat });
    if (!stat.isDirectory() || stat.uid !== 0n || (stat.mode & 0o022n) !== 0n) throw new Error('BUSTER_LIFETIME_ANCESTOR_NOT_TRUSTED');
  }
  const file = path.join(base, 'lifetime.lock'), before = fs.fstatSync(descriptor, { bigint: true });
  const isPath = () => {
    const info = fs.readFileSync(`/proc/self/fdinfo/${descriptor}`, 'utf8');
    const flags = /^flags:\s+([0-7]+)$/mu.exec(info);
    return !!flags && (parseInt(flags[1], 8) & 0x200000) !== 0; // Linux O_PATH
  };
  if (!before.isFile() || before.uid !== 0n || before.nlink !== 1n || (before.mode & 0o777n) !== 0o600n
    || !same(before, fs.lstatSync(file, { bigint: true })) || !isPath()) throw new Error('BUSTER_LIFETIME_NONOWNING_WITNESS_REQUIRED');
  let closed = false;
  const assertCurrent = () => {
    if (closed) throw new Error('BUSTER_LIFETIME_WITNESS_CLOSED');
    if (ancestors.some(({ file, stat }) => !same(stat, fs.lstatSync(file, { bigint: true })))
      || !same(before, fs.fstatSync(descriptor, { bigint: true })) || !same(before, fs.lstatSync(file, { bigint: true })) || !isPath()) {
      throw new Error('BUSTER_LIFETIME_WITNESS_CHANGED');
    }
  };
  const captured = Object.freeze({ descriptor, assertCurrent, close: () => {
    if (!closed) { closed = true; fs.closeSync(descriptor); }
  } });
  verifiedLifetimeWitnesses.add(captured); return captured;
}
export function captureProductiveBusterLifetimeWitness() {
  return captureBusterLifetimeWitness('/run/kubeclaw-buster', 9);
}
export function assertBusterLifetimeWitness(value) {
  if (!value || typeof value !== 'object' || !verifiedLifetimeWitnesses.has(value)) throw new Error('BUSTER_LIFETIME_VERIFIED_WITNESS_REQUIRED');
  value.assertCurrent();
}
