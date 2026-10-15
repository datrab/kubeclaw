import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { portableJson } from '@kubeclaw/plugin-sdk/values';

const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function relativeName(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\')
    && !path.posix.isAbsolute(value) && path.posix.normalize(value) === value
    && !value.split('/').some(part => part === '.' || part === '..' || part === '');
}
function closed(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function same(a, b) {
  return ['dev', 'ino', 'size', 'mode', 'uid', 'gid', 'nlink', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);
}
export function assertRuntimeBundleObservations(observations) {
  for (const { file, fd, before } of observations) {
    if ((fd !== undefined && !same(before, fs.fstatSync(fd, { bigint: true })))
      || !same(before, fs.lstatSync(file, { bigint: true }))) throw new Error('PIPELINE_PACKAGE_CHANGED');
  }
}

/** Keep descriptors and path observations alive through the caller's complete boot capture. */
export function runtimeBundleFiles(root, requireRoot = true, retainedObservations) {
  const observations = retainedObservations ?? [];
  const result = [];
  function visit(directory, relative) {
    const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    const before = fs.fstatSync(fd, { bigint: true });
    observations.push({ file: directory, fd, before });
    if (!before.isDirectory() || (requireRoot && before.uid !== 0n) || (before.mode & 0o022n) !== 0n) throw new Error('PIPELINE_PACKAGE_DIRECTORY_NOT_TRUSTED');
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name), member = relative ? `${relative}/${name}` : name;
      if (member === 'manifest.json') continue;
      const before = fs.lstatSync(file, { bigint: true });
      if (before.isDirectory()) { visit(file, member); continue; }
      if (requireRoot && before.uid !== 0n) throw new Error('PIPELINE_PACKAGE_FILE_NOT_TRUSTED');
      if (before.isSymbolicLink()) {
        observations.push({ file, before });
        const target = fs.readlinkSync(file);
        if (path.posix.isAbsolute(target) || !relativeName(path.posix.normalize(path.posix.join(path.posix.dirname(member), target)))) {
          throw new Error('PIPELINE_PACKAGE_ALIAS_ESCAPE');
        }
        result.push({ path: member, kind: 'symlink', target });
      } else {
        if (!before.isFile() || before.nlink !== 1n || (before.mode & 0o022n) !== 0n) throw new Error('PIPELINE_PACKAGE_FILE_NOT_TRUSTED');
        const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        observations.push({ file, fd, before });
        if (!same(before, fs.fstatSync(fd, { bigint: true }))) throw new Error('PIPELINE_PACKAGE_CHANGED');
        const bytes = fs.readFileSync(fd);
        result.push({ path: member, kind: 'file', mode: Number(before.mode & 0o777n),
          byteLength: bytes.byteLength, digest: hash(bytes) });
      }
    }
  }
  try {
    visit(root, '');
    assertRuntimeBundleObservations(observations);
    return result.sort((a, b) => a.path < b.path ? -1 : 1);
  } finally {
    if (!retainedObservations) for (const { fd } of observations) if (fd !== undefined) fs.closeSync(fd);
  }
}

export function validateRuntimeBundleReceipt(value, role, runtimeSurface) {
  if (!closed(value, ['schemaVersion', 'contractVersion', 'bundleKind', 'runtimeSurface', 'role', 'commit', 'builtAt',
    'entrypoint', 'packages', 'plugins', 'dependencies', 'externalCapabilities', 'files'])
    || value.schemaVersion !== 'pipeline-runtime-bundle.v2' || value.role !== role
    || value.runtimeSurface !== runtimeSurface || !['nova', 'buster', 'prism'].includes(role)
    || value.bundleKind !== 'app-skills-package-set' || typeof value.contractVersion !== 'string' || !value.contractVersion
    || !/^[a-f0-9]{40}$/u.test(value.commit) || typeof value.builtAt !== 'string' || !Number.isFinite(Date.parse(value.builtAt))
    || typeof value.entrypoint !== 'string' || !value.entrypoint.startsWith(`${runtimeSurface}/`)
    || !relativeName(value.entrypoint.slice(runtimeSurface.length + 1))
    || !['packages', 'plugins', 'dependencies', 'externalCapabilities', 'files'].every(key => Array.isArray(value[key]))
    || value.packages.length === 0 || value.files.length === 0) throw new Error('PIPELINE_PACKAGE_RECEIPT_INVALID');
  const names = new Set();
  for (const file of value.files) {
    if (!relativeName(file.path) || file.path === 'manifest.json' || names.has(file.path)) throw new Error('PIPELINE_PACKAGE_FILESET_INVALID');
    names.add(file.path);
    if (file.kind === 'file') {
      if (!closed(file, ['path', 'kind', 'mode', 'byteLength', 'digest']) || ![0o444, 0o555, 0o644, 0o755].includes(file.mode)
        || !Number.isSafeInteger(file.byteLength) || file.byteLength < 0 || !digestPattern.test(file.digest)) throw new Error('PIPELINE_PACKAGE_FILESET_INVALID');
    } else if (file.kind === 'symlink') {
      if (!closed(file, ['path', 'kind', 'target']) || typeof file.target !== 'string' || path.posix.isAbsolute(file.target)
        || !relativeName(path.posix.normalize(path.posix.join(path.posix.dirname(file.path), file.target)))) throw new Error('PIPELINE_PACKAGE_FILESET_INVALID');
    } else throw new Error('PIPELINE_PACKAGE_FILESET_INVALID');
  }
  const entryFile = `skills/${role === 'nova' ? 'pipeline.ts' : 'runtime.ts'}`;
  if (value.entrypoint !== `${runtimeSurface}/${path.posix.basename(entryFile)}`
    || !value.files.some(file => file.path === entryFile && file.kind === 'file')) throw new Error('PIPELINE_PACKAGE_ENTRYPOINT_INVALID');
  const identifiers = new Set(), targets = new Set(), aliases = new Set();
  const packageNamePattern = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u;
  const idPattern = /^[a-z0-9][a-z0-9._-]*$/u;
  for (const [category, records] of [['packages', value.packages], ['plugins', value.plugins], ['dependencies', value.dependencies]]) {
    for (const record of records) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('PIPELINE_PACKAGE_RECORD_INVALID');
      const id = category === 'dependencies' ? record.name : record.id;
      const isEntrypoint = category === 'packages' && record.kind === 'entrypoint';
      const keys = category === 'dependencies' ? ['name', 'version', 'sourceDigest', 'files', 'target']
        : isEntrypoint ? ['id', 'kind', 'sourceDigest', 'files']
        : ['id', ...(category === 'packages' ? ['kind'] : []), 'sourceDigest', 'files', 'target',
          ...(Object.hasOwn(record, 'packageName') ? ['packageName'] : [])];
      if (!closed(record, keys) || typeof id !== 'string' || !(category === 'dependencies' ? packageNamePattern : idPattern).test(id)
        || identifiers.has(id) || typeof record.sourceDigest !== 'string' || !digestPattern.test(record.sourceDigest)
        || !Number.isSafeInteger(record.files) || record.files < 1) throw new Error('PIPELINE_PACKAGE_RECORD_INVALID');
      identifiers.add(id);
      if (isEntrypoint) {
        if (id !== `${role}-runtime` || record.files !== 1) throw new Error('PIPELINE_PACKAGE_ENTRYPOINT_INVALID');
        continue;
      }
      if (category === 'packages' && !['node-package', 'assets'].includes(record.kind)) throw new Error('PIPELINE_PACKAGE_RECORD_INVALID');
      if (!relativeName(record.target) || targets.has(record.target)
        || !value.files.some(file => file.kind === 'file' && file.path.startsWith(`${record.target}/`))) throw new Error('PIPELINE_PACKAGE_RECORD_INVALID');
      targets.add(record.target);
      if (category === 'dependencies') {
        if (record.target !== `skills/node_modules/${id}` || typeof record.version !== 'string' || !record.version.trim()) throw new Error('PIPELINE_PACKAGE_RECORD_INVALID');
      } else if (category === 'plugins') {
        if (!record.target.startsWith('skills/plugins/')) throw new Error('PIPELINE_PACKAGE_RECORD_INVALID');
      } else if (record.kind === 'node-package') {
        if (record.target !== `skills/packages/${id}` || !Object.hasOwn(record, 'packageName')) throw new Error('PIPELINE_PACKAGE_RECORD_INVALID');
      } else if (!record.target.startsWith('skills/') || Object.hasOwn(record, 'packageName')) throw new Error('PIPELINE_PACKAGE_RECORD_INVALID');
      if (Object.hasOwn(record, 'packageName')) {
        if (typeof record.packageName !== 'string' || !packageNamePattern.test(record.packageName) || aliases.has(record.packageName)) throw new Error('PIPELINE_PACKAGE_RECORD_INVALID');
        aliases.add(record.packageName);
        const alias = `skills/node_modules/${record.packageName}`;
        if (!value.files.some(file => file.path === alias && file.kind === 'symlink'
          && path.posix.normalize(path.posix.join(path.posix.dirname(alias), file.target)) === record.target)) throw new Error('PIPELINE_PACKAGE_RECORD_INVALID');
      }
    }
  }
  if (!value.packages.some(record => record.kind === 'entrypoint' && record.id === `${role}-runtime`)) throw new Error('PIPELINE_PACKAGE_ENTRYPOINT_INVALID');
  const capabilityIds = new Set();
  for (const capability of value.externalCapabilities) {
    if (!closed(capability, ['id', 'source', 'reason']) || !['id', 'source', 'reason'].every(key => typeof capability[key] === 'string' && capability[key].trim())
      || capabilityIds.has(capability.id)) throw new Error('PIPELINE_PACKAGE_CAPABILITY_INVALID');
    capabilityIds.add(capability.id);
  }
  if (!identifiers.has('plugin-sdk') || !identifiers.has('plugin-foundation') || !identifiers.has('ajv')) {
    throw new Error('PIPELINE_PACKAGE_READER_CLOSURE_REQUIRED');
  }
  return value;
}

/** Verification roots are fixed by the packaged executable; the receipt cannot redirect them. */
export function verifyInstalledRuntimeBundle(value, root, role, runtimeSurface, retainedObservations) {
  const observations = retainedObservations ?? [];
  try {
  const receipt = validateRuntimeBundleReceipt(value, role, runtimeSurface);
  if (portableJson(runtimeBundleFiles(root, true, observations)) !== portableJson([...receipt.files].sort((a, b) => a.path < b.path ? -1 : 1))) {
    throw new Error('PIPELINE_PACKAGE_READBACK_MISMATCH');
  }
  const foundation = receipt.packages.find(record => record.id === 'plugin-foundation');
  if (fs.realpathSync(fileURLToPath(import.meta.url)) !== path.join(root, foundation.target, 'config/runtime-bundle-receipt.mjs')) {
    throw new Error('PIPELINE_PACKAGE_READER_RESOLUTION_MISMATCH');
  }
  for (const [specifier, identifier, relative] of [
    ['@kubeclaw/plugin-sdk/values', 'plugin-sdk', 'src/values.ts'],
    ['ajv/dist/2020.js', 'ajv', 'dist/2020.js'],
  ]) {
    const record = [...receipt.packages, ...receipt.dependencies].find(record => (record.id ?? record.name) === identifier);
    const expected = path.join(root, record.target, relative);
    const actual = fs.realpathSync(fileURLToPath(import.meta.resolve(specifier)));
    if (actual !== expected || !receipt.files.some(file => file.kind === 'file' && file.path === `${record.target}/${relative}`)) {
      throw new Error('PIPELINE_PACKAGE_RESOLUTION_MISMATCH');
    }
  }
  assertRuntimeBundleObservations(observations);
  return receipt;
  } finally {
    if (!retainedObservations) for (const { fd } of observations) if (fd !== undefined) fs.closeSync(fd);
  }
}
