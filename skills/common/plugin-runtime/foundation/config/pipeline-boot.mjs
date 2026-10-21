import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { captureSwarmSettings } from './swarm.ts';
import { createPipelineGenerationReceipt, readPipelineServiceSelection, selectionProjection, receiveBusterSelectedOwnerProjection } from './pipeline-generation.ts';
import { receivePipelineV10ExpectedDelivery, receivePipelineV10ImageReceipt, receivePipelineV10ServiceSelection, receiveBusterV10SelectedOwnerProjection } from './pipeline-generation.ts';
import { swarmReaderAssets, swarmReaderAssetLocations } from './swarm-bundle.ts';
import { verifyInstalledRuntimeBundle } from './runtime-bundle-receipt.mjs';
import { captureBusterStartupFile } from './buster-startup-file.mjs';
import { createBusterStartupHandoff } from './buster-startup.ts';
import { restoreBusterSourceClosure } from './buster-source-replay.mjs';
import { capturePipelineMaterializerInputSource } from './pipeline-v10-input-set.ts';

const SYSTEM_ROOT = '/etc/kubeclaw/config';
const RECEIPT_LIMIT = 65536; // Closed provenance-wire bound, not an operational policy default.
const PACKAGE_RECEIPT_LIMIT = 8 * 1024 * 1024; // v2 includes the full emitted code-file index.
const verifiedCaptures = new WeakSet();
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const callers = ['prism-control', 'prism-worker', 'prism-studio', 'prism-ingestion', 'prism-agent-bridge', 'buster-preparation', 'buster-runtime'];

function closed(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new Error(code);
}

function same(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.uid === b.uid
    && a.gid === b.gid && a.nlink === b.nlink && a.size === b.size
    && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function trustedDirectory(directory, observations, requiredMode) {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  const before = fs.fstatSync(fd, { bigint: true });
  if (!before.isDirectory() || before.uid !== 0n || (before.mode & 0o022n) !== 0n
    || (requiredMode !== undefined && (before.mode & 0o777n) !== BigInt(requiredMode))) {
    fs.closeSync(fd); throw new Error('PIPELINE_DIRECTORY_NOT_TRUSTED');
  }
  observations.push({ file: directory, fd, before });
}

function readTrusted(file, observations, maximumBytes = RECEIPT_LIMIT, requiredMode) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  const before = fs.fstatSync(fd, { bigint: true });
  if (!before.isFile() || before.uid !== 0n || before.nlink !== 1n || (before.mode & 0o022n) !== 0n
    || (maximumBytes !== undefined && before.size > BigInt(maximumBytes))
    || (requiredMode !== undefined && (before.mode & 0o777n) !== BigInt(requiredMode))) {
    fs.closeSync(fd); throw new Error('PIPELINE_FILE_NOT_TRUSTED');
  }
  observations.push({ file, fd, before });
  const bytes = fs.readFileSync(fd);
  if (!same(before, fs.fstatSync(fd, { bigint: true }))) throw new Error('PIPELINE_FILE_CHANGED');
  return bytes;
}

/** Capture the transport's single atomic-writer directory; never use this exception for settings. */
function expectedReceipt(mount, observations) {
  trustedDirectory(mount, observations);
  const alias = path.join(mount, '..data');
  const before = fs.lstatSync(alias, { bigint: true });
  if (!before.isSymbolicLink()) throw new Error('PIPELINE_DELIVERY_ALIAS_REQUIRED');
  const version = fs.realpathSync(alias);
  if (!version.startsWith(`${mount}${path.sep}`) || path.dirname(version) !== mount) {
    throw new Error('PIPELINE_DELIVERY_ESCAPE');
  }
  trustedDirectory(version, observations);
  observations.push({ file: alias, before });
  return JSON.parse(readTrusted(path.join(version, 'expected-delivery.json'), observations).toString('utf8'));
}

/** Core verifier; the productive wrapper below fixes the system tree in the packaged program. */
function captureBoot(expectedMount, systemRoot, callerId, packageRoot, runtimeSurface, retainedStartup) {
  if (!callers.includes(callerId) || !path.isAbsolute(systemRoot) || path.resolve(systemRoot) !== systemRoot
    || !path.isAbsolute(expectedMount) || path.resolve(expectedMount) !== expectedMount
    || typeof packageRoot !== 'string' || !path.isAbsolute(packageRoot) || path.resolve(packageRoot) !== packageRoot
    || typeof runtimeSurface !== 'string' || !path.isAbsolute(runtimeSurface)) throw new Error('PIPELINE_BOOT_IDENTITY_INVALID');
  const observations = [];
  try {
    trustedDirectory(systemRoot, observations, 0o755);
    trustedDirectory(path.join(systemRoot, 'components'), observations, 0o755);
    trustedDirectory(path.join(systemRoot, 'selections'), observations, 0o755);
    if (retainedStartup) retainedStartup.assertCurrent();
    const handoff = retainedStartup?.handoff;
    const child = handoff?.childSelection;
    const expected = handoff ? {
      schemaVersion: 'pipeline-expected-delivery.v1', callerId: 'buster-runtime', role: child.role,
      serviceInstanceId: child.serviceInstanceId, generationDigest: handoff.generationDigest,
      selectionDigest: child.digest, packageReceiptDigest: child.packageReceiptDigest,
      imageReceiptDigest: handoff.imageReceiptDigest,
    } : expectedReceipt(expectedMount, observations);
    closed(expected, ['schemaVersion', 'callerId', 'role', 'serviceInstanceId', 'generationDigest',
      'selectionDigest', 'packageReceiptDigest', 'imageReceiptDigest'], 'PIPELINE_EXPECTED_RECEIPT_INVALID');
    if (expected.schemaVersion !== 'pipeline-expected-delivery.v1' || expected.callerId !== callerId
      || ['generationDigest', 'selectionDigest', 'packageReceiptDigest', 'imageReceiptDigest']
        .some(key => typeof expected[key] !== 'string' || !digestPattern.test(expected[key]))) throw new Error('PIPELINE_EXPECTED_RECEIPT_INVALID');
    const imageBytes = readTrusted(path.join(systemRoot, 'image-receipt.json'), observations, RECEIPT_LIMIT, 0o444);
    if (sha256(imageBytes) !== expected.imageReceiptDigest) throw new Error('PIPELINE_IMAGE_RECEIPT_MISMATCH');
    const image = JSON.parse(imageBytes.toString('utf8'));
    closed(image, ['schemaVersion', 'generationDigest', 'packageReceiptDigest', 'selectionDigests'], 'PIPELINE_IMAGE_RECEIPT_INVALID');
    if (image.schemaVersion !== 'pipeline-image-generation.v1' || image.generationDigest !== expected.generationDigest
      || image.packageReceiptDigest !== expected.packageReceiptDigest
      || !image.selectionDigests || typeof image.selectionDigests !== 'object' || Array.isArray(image.selectionDigests)
      || Object.keys(image.selectionDigests).some(key => !callers.includes(key) || !digestPattern.test(image.selectionDigests[key]))
      || image.selectionDigests[callerId] !== expected.selectionDigest) throw new Error('PIPELINE_IMAGE_RECEIPT_INVALID');
    if (handoff && (callerId !== 'buster-runtime' || image.selectionDigests['buster-preparation'] !== handoff.parentSelection.digest
      || image.selectionDigests['buster-runtime'] !== handoff.childSelection.digest)) throw new Error('BUSTER_STARTUP_IMAGE_SELECTION_MISMATCH');
    const packageBytes = readTrusted(path.join(systemRoot, 'package-receipt.json'), observations, PACKAGE_RECEIPT_LIMIT, 0o444);
    if (sha256(packageBytes) !== expected.packageReceiptDigest) throw new Error('PIPELINE_PACKAGE_RECEIPT_MISMATCH');
    const packageReceipt = JSON.parse(packageBytes.toString('utf8'));
    verifyInstalledRuntimeBundle(packageReceipt, packageRoot, expected.role, runtimeSurface, observations);
    const selection = readPipelineServiceSelection(JSON.parse(readTrusted(
      path.join(systemRoot, 'selections', `${callerId}.json`), observations, RECEIPT_LIMIT, 0o444).toString('utf8')), callerId);
    if (selection.digest !== expected.selectionDigest || selection.generationDigest !== expected.generationDigest
      || selection.packageReceiptDigest !== expected.packageReceiptDigest || selection.role !== expected.role
      || selection.serviceInstanceId !== expected.serviceInstanceId) throw new Error('PIPELINE_SELECTION_RECEIPT_MISMATCH');
    const capture = captureSwarmSettings(path.join(systemRoot, 'pipeline.config.json'), selectionProjection(selection));
    if (selection.role === 'buster') {
      receiveBusterSelectedOwnerProjection(JSON.parse(readTrusted(
        path.join(systemRoot, 'selections', `${callerId}.buster.json`), observations,
        PACKAGE_RECEIPT_LIMIT, 0o444).toString('utf8')), capture, selection);
    }
    for (const file of capture.identity.files) {
      const bytes = readTrusted(path.join(systemRoot, file.name), observations, Number.MAX_SAFE_INTEGER, 0o444);
      if (sha256(bytes) !== `sha256:${file.sha256}` || bytes.byteLength !== file.byteLength) throw new Error('PIPELINE_GENERATION_CHANGED');
    }
    const foundationTarget = packageReceipt.packages.find(record => record.id === 'plugin-foundation').target;
    const sdkTarget = packageReceipt.packages.find(record => record.id === 'plugin-sdk').target;
    if (fs.realpathSync(fileURLToPath(import.meta.url)) !== path.join(packageRoot, foundationTarget, 'config/pipeline-boot.mjs')) throw new Error('PIPELINE_READER_RESOLUTION_MISMATCH');
    for (const asset of swarmReaderAssets) {
      const expectedAsset = asset.name === 'registry-digest.ts' ? path.join(packageRoot, foundationTarget, 'registry/digest.ts')
        : asset.name === 'registry-errors.ts' ? path.join(packageRoot, foundationTarget, 'registry/errors.ts')
        : asset.name === 'sdk-values.ts' ? path.join(packageRoot, sdkTarget, 'src/values.ts')
        : path.join(packageRoot, foundationTarget, 'config', asset.name);
      if (fs.realpathSync(fileURLToPath(swarmReaderAssetLocations[asset.name])) !== expectedAsset) throw new Error('PIPELINE_READER_RESOLUTION_MISMATCH');
      const bytes = readTrusted(new URL(swarmReaderAssetLocations[asset.name]), observations, Number.MAX_SAFE_INTEGER);
      if (sha256(bytes) !== asset.digest || bytes.byteLength !== asset.byteLength) throw new Error('PIPELINE_READER_CHANGED');
    }
    if (createPipelineGenerationReceipt(capture).digest !== expected.generationDigest) throw new Error('PIPELINE_GENERATION_RECEIPT_MISMATCH');
    for (const { file, fd, before } of observations) {
      if ((fd !== undefined && !same(before, fs.fstatSync(fd, { bigint: true })))
        || !same(before, fs.lstatSync(file, { bigint: true }))) throw new Error('PIPELINE_BOOT_RECEIPT_CHANGED');
    }
    if (retainedStartup) retainedStartup.assertCurrent();
    const result = Object.freeze({ ...capture, selectionReceipt: selection, bootProvenance: Object.freeze({
      installedPackageRoot: packageRoot, expectedReceipt: Object.freeze({ ...expected }), imageSelectionDigests: Object.freeze({ ...image.selectionDigests }),
    }) });
    verifiedCaptures.add(result);
    return result;
  } finally {
    for (const observation of observations) if (observation.fd !== undefined) fs.closeSync(observation.fd);
  }
}

export function capturePipelineBootReceipts(expectedMount, systemRoot, callerId, packageRoot, runtimeSurface) {
  return captureBoot(expectedMount, systemRoot, callerId, packageRoot, runtimeSurface);
}

/** Child captures only its retained parent A handoff; no ConfigMap/current locator reread. */
export function captureBusterParentStartupHandoff(parent) {
  assertPipelineBootCapture(parent, 'buster-preparation');
  const root = path.dirname(parent.identity.entry), observations = [];
  try {
    trustedDirectory(root, observations, 0o755);
    trustedDirectory(path.join(root, 'components'), observations, 0o755);
    trustedDirectory(path.join(root, 'selections'), observations, 0o755);
    const child = readPipelineServiceSelection(JSON.parse(readTrusted(path.join(root, 'selections/buster-runtime.json'), observations, RECEIPT_LIMIT, 0o444).toString('utf8')), 'buster-runtime');
    const childCapture = captureSwarmSettings(parent.identity.entry, selectionProjection(child));
    if (createPipelineGenerationReceipt(childCapture).digest !== parent.selectionReceipt.generationDigest) throw new Error('BUSTER_STARTUP_GENERATION_CHANGED');
    for (const file of childCapture.identity.files) {
      const bytes = readTrusted(path.join(root, file.name), observations, Number.MAX_SAFE_INTEGER, 0o444);
      if (sha256(bytes) !== `sha256:${file.sha256}` || bytes.byteLength !== file.byteLength) throw new Error('BUSTER_STARTUP_GENERATION_CHANGED');
    }
    const imageBytes = readTrusted(path.join(root, 'image-receipt.json'), observations, RECEIPT_LIMIT, 0o444);
    const packageBytes = readTrusted(path.join(root, 'package-receipt.json'), observations, PACKAGE_RECEIPT_LIMIT, 0o444);
    if (sha256(imageBytes) !== parent.bootProvenance.expectedReceipt.imageReceiptDigest
      || sha256(packageBytes) !== parent.bootProvenance.expectedReceipt.packageReceiptDigest) throw new Error('BUSTER_STARTUP_IMAGE_CHANGED');
    const packageReceipt = JSON.parse(packageBytes.toString('utf8'));
    verifyInstalledRuntimeBundle(packageReceipt, parent.bootProvenance.installedPackageRoot,
      'buster', '/app/skills', observations);
    for (const asset of swarmReaderAssets) {
      const bytes = readTrusted(new URL(swarmReaderAssetLocations[asset.name]), observations, Number.MAX_SAFE_INTEGER);
      if (sha256(bytes) !== asset.digest || bytes.byteLength !== asset.byteLength) throw new Error('BUSTER_STARTUP_READER_CHANGED');
    }
    receiveBusterSelectedOwnerProjection(JSON.parse(readTrusted(
      path.join(root, 'selections/buster-runtime.buster.json'), observations, PACKAGE_RECEIPT_LIMIT, 0o444).toString('utf8')),
      childCapture, child);
    const handoff = createBusterStartupHandoff(parent, child);
    for (const { file, fd, before } of observations) if ((fd !== undefined && !same(before, fs.fstatSync(fd, { bigint: true })))
      || !same(before, fs.lstatSync(file, { bigint: true }))) throw new Error('BUSTER_STARTUP_SELECTION_CHANGED');
    return handoff;
  } finally { for (const { fd } of observations) if (fd !== undefined) fs.closeSync(fd); }
}

/** Freeze the original verified source/reader/image closure for durable recovery.
 * This never captures current B on behalf of missing A: each physical byte is
 * checked against the already authenticated A receipt before it is returned.
 * Native pool/node/store and retirement accounting must be joined separately.
 */
export function captureBusterBootSourceClosure(parent) {
  assertPipelineBootCapture(parent, 'buster-preparation');
  const root = parent.identity.generationDirectory, observations = [];
  const files = [];
  const member = (name, file, digest, maximumBytes = Number.MAX_SAFE_INTEGER) => {
    const bytes = readTrusted(file, observations, maximumBytes);
    if (sha256(bytes) !== digest) throw new Error('BUSTER_BOOT_ARCHIVE_SOURCE_CHANGED');
    files.push(Object.freeze({ name, digest, byteLength: bytes.byteLength, bytes: bytes.toString('base64') }));
  };
  try {
    trustedDirectory(root, observations, 0o755);
    trustedDirectory(path.join(root, 'components'), observations, 0o755);
    trustedDirectory(path.join(root, 'selections'), observations, 0o755);
    for (const file of parent.identity.files) member(`generation/${file.name}`, path.join(root, file.name), `sha256:${file.sha256}`, file.byteLength);
    const expected = parent.bootProvenance.expectedReceipt;
    member('generation/image-receipt.json', path.join(root, 'image-receipt.json'), expected.imageReceiptDigest, RECEIPT_LIMIT);
    member('generation/package-receipt.json', path.join(root, 'package-receipt.json'), expected.packageReceiptDigest, PACKAGE_RECEIPT_LIMIT);
    member('generation/installed-manifest.json', path.join(parent.bootProvenance.installedPackageRoot, 'manifest.json'), expected.packageReceiptDigest, PACKAGE_RECEIPT_LIMIT);
    const childDigest = parent.bootProvenance.imageSelectionDigests['buster-runtime'];
    if (!childDigest) throw new Error('BUSTER_BOOT_ARCHIVE_CHILD_RECEIPT_REQUIRED');
    for (const [caller, digest] of [['buster-preparation', parent.selectionReceipt.digest], ['buster-runtime', childDigest]]) {
      const name = `selections/${caller}.json`;
      const bytes = readTrusted(path.join(root, name), observations, RECEIPT_LIMIT, 0o444);
      if (readPipelineServiceSelection(JSON.parse(bytes.toString('utf8')), caller).digest !== digest) {
        throw new Error('BUSTER_BOOT_ARCHIVE_SOURCE_CHANGED');
      }
      files.push(Object.freeze({ name: `generation/${name}`, digest: sha256(bytes), byteLength: bytes.byteLength, bytes: bytes.toString('base64') }));
      const selected = readPipelineServiceSelection(JSON.parse(bytes.toString('utf8')), caller);
      const selectedCapture = captureSwarmSettings(parent.identity.entry, selectionProjection(selected));
      const projectionName = `selections/${caller}.buster.json`;
      const projectionBytes = readTrusted(path.join(root, projectionName), observations, PACKAGE_RECEIPT_LIMIT, 0o444);
      receiveBusterSelectedOwnerProjection(JSON.parse(projectionBytes.toString('utf8')), selectedCapture, selected);
      files.push(Object.freeze({ name: `generation/${projectionName}`, digest: sha256(projectionBytes),
        byteLength: projectionBytes.byteLength, bytes: projectionBytes.toString('base64') }));
    }
    for (const asset of swarmReaderAssets) member(`reader/${asset.name}`, fileURLToPath(swarmReaderAssetLocations[asset.name]), asset.digest, asset.byteLength);
    const packageBytes = Buffer.from(files.find(file => file.name === 'generation/package-receipt.json').bytes, 'base64');
    const packageReceipt = JSON.parse(packageBytes.toString('utf8'));
    verifyInstalledRuntimeBundle(packageReceipt, parent.bootProvenance.installedPackageRoot,
      'buster', '/app/skills', observations);
    // Retain the complete original installed program, including dependencies and
    // inert alias targets. A package digest alone cannot replay its old reader.
    const descriptors = new Map(observations.filter(item => item.fd !== undefined).map(item => [item.file, item]));
    for (const item of packageReceipt.files) {
      let bytes, name;
      if (item.kind === 'file') {
        const observation = descriptors.get(path.join(parent.bootProvenance.installedPackageRoot, item.path));
        if (!observation) throw new Error('BUSTER_BOOT_ARCHIVE_CODE_DESCRIPTOR_REQUIRED');
        bytes = Buffer.alloc(item.byteLength);
        for (let offset = 0; offset < bytes.byteLength;) {
          const count = fs.readSync(observation.fd, bytes, offset, bytes.byteLength - offset, offset);
          if (!count) throw new Error('BUSTER_BOOT_ARCHIVE_SOURCE_CHANGED');
          offset += count;
        }
        if (bytes.byteLength !== item.byteLength || sha256(bytes) !== item.digest) throw new Error('BUSTER_BOOT_ARCHIVE_SOURCE_CHANGED');
        name = `package/${item.path}`;
      } else {
        bytes = Buffer.from(item.target); name = `package-alias/${item.path}`;
      }
      files.push(Object.freeze({ name, digest: sha256(bytes), byteLength: bytes.byteLength, bytes: bytes.toString('base64') }));
    }
    for (const { file, fd, before } of observations) if ((fd !== undefined && !same(before, fs.fstatSync(fd, { bigint: true })))
      || !same(before, fs.lstatSync(file, { bigint: true }))) throw new Error('BUSTER_BOOT_ARCHIVE_SOURCE_CHANGED');
    return Object.freeze({ schemaVersion: 'buster-boot-source-closure.v2', expectedReceipt: expected,
      installedPackageRoot: parent.bootProvenance.installedPackageRoot, files: Object.freeze(files) });
  } finally { for (const { fd } of observations) if (fd !== undefined) fs.closeSync(fd); }
}

/** Immutable archive of authenticated original source bytes, not a boot-retirement
 * grant. Native pool/node/store/owner accounting still must name this receipt.
 * Existing archives are never repaired from the currently installed generation.
 */
export function prepareBusterBootSourceClosure(parent, archiveRoot) {
  assertPipelineBootCapture(parent, 'buster-preparation');
  if (process.getuid?.() !== 0 || typeof archiveRoot !== 'string' || !path.isAbsolute(archiveRoot)
    || path.resolve(archiveRoot) !== archiveRoot || archiveRoot === '/') throw new Error('BUSTER_BOOT_ARCHIVE_ROOT_INVALID');
  const closure = captureBusterBootSourceClosure(parent);
  const content = Buffer.from(`${JSON.stringify(closure)}\n`), bytes = gzipSync(content);
  const destination = path.join(archiveRoot, `${parent.selectionReceipt.generationDigest.slice(7)}.json.gz`);
  const receipt = Object.freeze({ schemaVersion: 'buster-boot-source-archive-receipt.v2', file: destination,
    digest: sha256(bytes), byteLength: bytes.byteLength, contentByteLength: content.byteLength,
    generationDigest: parent.selectionReceipt.generationDigest });
  return Object.freeze({ receipt, publish: () => {
    const observations = [];
    let temporary, descriptor;
    try {
      let current = '/';
      trustedDirectory(current, observations);
      for (const part of archiveRoot.split('/').filter(Boolean)) {
        current = path.join(current, part);
        trustedDirectory(current, observations);
      }
      // Refuse an existing archive before consuming storage for another copy.
      // link(2) below remains the authoritative race-safe no-replace operation.
      try {
        fs.lstatSync(destination);
        throw Object.assign(new Error('BUSTER_BOOT_ARCHIVE_ALREADY_EXISTS'), { code: 'EEXIST' });
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      temporary = path.join(archiveRoot, `.source-closure-${randomUUID()}`);
      descriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY
        | fs.constants.O_NOFOLLOW, 0o600);
      fs.writeFileSync(descriptor, bytes);
      fs.fchownSync(descriptor, 0, 0); fs.fchmodSync(descriptor, 0o444); fs.fsyncSync(descriptor);
      const assertDirectories = () => {
        for (const { fd, file, before } of observations) {
          const retained = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(file, { bigint: true });
          // Adding a sibling changes timestamps, never the identity/trust boundary.
          for (const stat of [retained, named]) if (!stat.isDirectory()
            || ['dev', 'ino', 'mode', 'uid', 'gid'].some(key => stat[key] !== before[key])) {
            throw new Error('BUSTER_BOOT_ARCHIVE_ROOT_CHANGED');
          }
        }
      };
      assertDirectories();
      fs.linkSync(temporary, destination); // EEXIST denies, even for equal content.
      fs.unlinkSync(temporary); temporary = undefined;
      fs.fsyncSync(observations.at(-1).fd);
      assertDirectories();
      return receipt;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (temporary !== undefined) fs.unlinkSync(temporary);
      for (const { fd } of observations) if (fd !== undefined) fs.closeSync(fd);
    }
  } });
}

/** Low-level immutable I/O only, not publication/admission authority. Productive
 * original boot publication uses the coordinator's original Core reservation.
 */
export function publishBusterBootSourceClosure(parent, archiveRoot) {
  return prepareBusterBootSourceClosure(parent, archiveRoot).publish();
}

/** Read the named original archive only. Missing/corrupt A is a denial; this
 * path does not inspect current config, regenerate an archive or compare old
 * reader hashes against B. It returns inert bytes, not executable authority.
 */
export function readBusterBootSourceArchive(receipt) {
  const compressed = receipt?.schemaVersion === 'buster-boot-source-archive-receipt.v2';
  closed(receipt, ['schemaVersion', 'file', 'digest', 'byteLength', 'generationDigest', ...(compressed ? ['contentByteLength'] : [])], 'BUSTER_BOOT_ARCHIVE_RECEIPT_INVALID');
  if (!['buster-boot-source-archive-receipt.v1', 'buster-boot-source-archive-receipt.v2'].includes(receipt.schemaVersion)
    || typeof receipt.file !== 'string' || !path.isAbsolute(receipt.file) || path.resolve(receipt.file) !== receipt.file
    || !digestPattern.test(receipt.digest) || !digestPattern.test(receipt.generationDigest)
    || !Number.isSafeInteger(receipt.byteLength) || receipt.byteLength < 1
    || (compressed && (!Number.isSafeInteger(receipt.contentByteLength) || receipt.contentByteLength < 1))
    || path.basename(receipt.file) !== `${receipt.generationDigest.slice(7)}.json${compressed ? '.gz' : ''}`) throw new Error('BUSTER_BOOT_ARCHIVE_RECEIPT_INVALID');
  const observations = [];
  try {
    let current = '/';
    trustedDirectory(current, observations);
    for (const part of path.dirname(receipt.file).split('/').filter(Boolean)) {
      current = path.join(current, part); trustedDirectory(current, observations);
    }
    const bytes = readTrusted(receipt.file, observations, receipt.byteLength, 0o444);
    if (bytes.byteLength !== receipt.byteLength || sha256(bytes) !== receipt.digest) throw new Error('BUSTER_BOOT_ARCHIVE_DIGEST_MISMATCH');
    const content = compressed ? gunzipSync(bytes, { maxOutputLength: receipt.contentByteLength }) : bytes;
    if (compressed && content.byteLength !== receipt.contentByteLength) throw new Error('BUSTER_BOOT_ARCHIVE_CONTENT_SIZE_MISMATCH');
    const closure = JSON.parse(content.toString('utf8'));
    closed(closure, ['schemaVersion', 'expectedReceipt', 'installedPackageRoot', 'files'], 'BUSTER_BOOT_ARCHIVE_INVALID');
    if (!['buster-boot-source-closure.v1', 'buster-boot-source-closure.v2'].includes(closure.schemaVersion) || !Array.isArray(closure.files)
      || closure.expectedReceipt?.generationDigest !== receipt.generationDigest) throw new Error('BUSTER_BOOT_ARCHIVE_INVALID');
    closed(closure.expectedReceipt, ['schemaVersion', 'callerId', 'role', 'serviceInstanceId', 'generationDigest',
      'selectionDigest', 'packageReceiptDigest', 'imageReceiptDigest'], 'BUSTER_BOOT_ARCHIVE_INVALID');
    if (closure.expectedReceipt.schemaVersion !== 'pipeline-expected-delivery.v1'
      || closure.expectedReceipt.callerId !== 'buster-preparation' || closure.expectedReceipt.role !== 'buster'
      || typeof closure.expectedReceipt.serviceInstanceId !== 'string' || !closure.expectedReceipt.serviceInstanceId
      || ['generationDigest', 'selectionDigest', 'packageReceiptDigest', 'imageReceiptDigest'].some(key => !digestPattern.test(closure.expectedReceipt[key]))
      || typeof closure.installedPackageRoot !== 'string' || !path.isAbsolute(closure.installedPackageRoot)
      || path.resolve(closure.installedPackageRoot) !== closure.installedPackageRoot) throw new Error('BUSTER_BOOT_ARCHIVE_INVALID');
    const names = new Set();
    for (const file of closure.files) {
      closed(file, ['name', 'digest', 'byteLength', 'bytes'], 'BUSTER_BOOT_ARCHIVE_INVALID');
      const memberKinds = closure.schemaVersion === 'buster-boot-source-closure.v2' ? /^(generation|reader|package|package-alias)\//u : /^(generation|reader)\//u;
      if (typeof file.name !== 'string' || !memberKinds.test(file.name)
        || path.posix.normalize(file.name) !== file.name || file.name.includes('\\')
        || file.name.split('/').some(part => !part || part === '.' || part === '..')
        || names.has(file.name) || typeof file.bytes !== 'string' || !digestPattern.test(file.digest)
        || !Number.isSafeInteger(file.byteLength) || file.byteLength < 0) throw new Error('BUSTER_BOOT_ARCHIVE_INVALID');
      names.add(file.name);
      const content = Buffer.from(file.bytes, 'base64');
      if (content.toString('base64') !== file.bytes || content.byteLength !== file.byteLength
        || sha256(content) !== file.digest) throw new Error('BUSTER_BOOT_ARCHIVE_MEMBER_MISMATCH');
    }
    for (const [name, digest] of [['image-receipt.json', closure.expectedReceipt.imageReceiptDigest],
      ['package-receipt.json', closure.expectedReceipt.packageReceiptDigest]]) {
      if (closure.files.find(file => file.name === `generation/${name}`)?.digest !== digest) throw new Error('BUSTER_BOOT_ARCHIVE_INVALID');
    }
    for (const name of ['generation/pipeline.config.json', 'generation/selections/buster-preparation.json',
      'generation/selections/buster-runtime.json', 'reader/swarm.ts', 'reader/swarm.schema.json']) {
      if (!names.has(name)) throw new Error('BUSTER_BOOT_ARCHIVE_INVALID');
    }
    if (closure.schemaVersion === 'buster-boot-source-closure.v2') {
      const sourceFiles = new Map(closure.files.map(file => [file.name, file]));
      const packageReceipt = JSON.parse(Buffer.from(sourceFiles.get('generation/package-receipt.json').bytes, 'base64').toString('utf8'));
      if (packageReceipt.schemaVersion !== 'pipeline-runtime-bundle.v2' || !Array.isArray(packageReceipt.files)) throw new Error('BUSTER_BOOT_ARCHIVE_INVALID');
      for (const item of packageReceipt.files) {
        const archived = sourceFiles.get(`${item.kind === 'file' ? 'package' : 'package-alias'}/${item.path}`);
        if (!archived || (item.kind === 'file' && (archived.digest !== item.digest || archived.byteLength !== item.byteLength))
          || (item.kind === 'symlink' && Buffer.from(archived.bytes, 'base64').toString('utf8') !== item.target)
          || !['file', 'symlink'].includes(item.kind)) throw new Error('BUSTER_BOOT_ARCHIVE_CODE_CLOSURE_MISMATCH');
      }
      if (closure.files.filter(file => /^(package|package-alias)\//u.test(file.name)).length !== packageReceipt.files.length) {
        throw new Error('BUSTER_BOOT_ARCHIVE_CODE_CLOSURE_MISMATCH');
      }
    }
    for (const { file, fd, before } of observations) {
      // Ancestor directories are identity/trust boundaries, not inventories.
      // Other native jobs may add siblings (including under /dev) during this
      // read. Keep full byte/metadata observations for the archive file itself.
      const unchanged = stat => before.isDirectory()
        ? stat.isDirectory() && ['dev', 'ino', 'mode', 'uid', 'gid'].every(key => stat[key] === before[key])
        : same(before, stat);
      if ((fd !== undefined && !unchanged(fs.fstatSync(fd, { bigint: true })))
        || !unchanged(fs.lstatSync(file, { bigint: true }))) throw new Error('BUSTER_BOOT_ARCHIVE_CHANGED');
    }
    for (const file of closure.files) Object.freeze(file);
    Object.freeze(closure.files); Object.freeze(closure.expectedReceipt);
    return Object.freeze(closure);
  } finally { for (const { fd } of observations) if (fd !== undefined) fs.closeSync(fd); }
}

/** Original-only restoration. No current capture/settings/image input exists
 * on this path; caller still owes native/ledger/journal/accounted-retirement
 * admission before executing these restored bytes or activating current B.
 */
export function materializeBusterBootSourceArchive(receipt, destination) {
  return restoreBusterSourceClosure(readBusterBootSourceArchive(receipt), destination);
}

export function captureBusterChildBootReceipts(startupBase, systemRoot, packageRoot) {
  const startup = captureBusterStartupFile(startupBase);
  try {
    const capture = captureBoot('/run/pipeline-delivery', systemRoot, 'buster-runtime', packageRoot, '/app/skills', startup);
    return Object.freeze({ capture, startup });
  } catch (error) { startup.close(); throw error; }
}
export function verifyBusterChildBootReceipt() {
  return captureBusterChildBootReceipts('/run/kubeclaw-buster', SYSTEM_ROOT, '/app');
}

export function verifyPipelineBootReceipt(expectedMount, callerId) {
  if (expectedMount !== '/run/pipeline-delivery') throw new Error('PIPELINE_DELIVERY_MOUNT_INVALID');
  const packageRoot = callerId.startsWith('prism-') ? '/app/prism' : '/app';
  return capturePipelineBootReceipts(expectedMount, SYSTEM_ROOT, callerId, packageRoot, `${packageRoot}/skills`);
}

export function assertPipelineBootCapture(capture, callerId) {
  if (!verifiedCaptures.has(capture) || capture.selectionReceipt.callerId !== callerId) throw new Error('PIPELINE_VERIFIED_CAPTURE_REQUIRED');
}

/** Distinct original v10 boot-source wire readback. The receiving composition,
 * package and retained full inputs are held separately from all received wires.
 * This is not a productive boot capture: it never enters verifiedCaptures and
 * cannot bypass source/caller, installed-code or native startup admission.
 */
export function receivePipelineV10BootSource(wires, inputs, services, callerId, packageReceiptDigest) {
  // Hold one composition across all reads, even if an input reader calls back
  // into its caller. Never select the receiver from an incoming receipt.
  services = structuredClone(services);
  wires = structuredClone(wires);
  closed(wires, ['expected', 'image', 'selection', 'owner'], 'PIPELINE_V10_BOOT_SOURCE_INVALID');
  const expected = receivePipelineV10ExpectedDelivery(wires.expected, inputs, services, callerId, packageReceiptDigest);
  const image = receivePipelineV10ImageReceipt(wires.image, inputs, services, packageReceiptDigest);
  const service = services.find(value => value.callerId === callerId);
  const selection = receivePipelineV10ServiceSelection(wires.selection, inputs, service, packageReceiptDigest);
  const owner = selection.role === 'buster'
    ? receiveBusterV10SelectedOwnerProjection(wires.owner, inputs, selection, service, packageReceiptDigest)
    : null;
  if (selection.role !== 'buster' && wires.owner !== null) throw new Error('PIPELINE_V10_BOOT_OWNER_UNEXPECTED');
  inputs.assertCurrent();
  return Object.freeze({ expected, image, selection, owner, activationAllowed: false });
}


/** Observe a distinct full-input v10 release at its physical installed boundary.
 * This is SOURCE readback, not a Swarm capture or startup authorization: it is
 * deliberately absent from verifiedCaptures. The real materializer uses it on
 * staged v2 output while productive source/runtime admission remains closed.
 * Caller composition is held separately; no received wire selects authority.
 */
export function capturePipelineV10BootSource(expectedFile, systemRoot, callerId, packageRoot, runtimeSurface, services) {
  services = structuredClone(services);
  for (const directory of [systemRoot, packageRoot]) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.resolve(directory) !== directory
      || fs.realpathSync(directory) !== directory) throw new Error('PIPELINE_BOOT_IDENTITY_INVALID');
  }
  if (typeof expectedFile !== 'string' || !path.isAbsolute(expectedFile) || path.resolve(expectedFile) !== expectedFile
    || fs.realpathSync(expectedFile) !== expectedFile || typeof runtimeSurface !== 'string'
    || !path.isAbsolute(runtimeSurface) || !callers.includes(callerId) || !Array.isArray(services)) {
    throw new Error('PIPELINE_BOOT_IDENTITY_INVALID');
  }
  const service = services.find(value => value?.callerId === callerId);
  if (!service) throw new Error('PIPELINE_EXPECTED_DELIVERY_CALLER_REQUIRED');
  const observations = [], directories = new Set();
  let inputs, isClosed = false;
  const close = () => {
    if (isClosed) return;
    isClosed = true;
    inputs?.close();
    for (const { fd } of observations) if (fd !== undefined) fs.closeSync(fd);
  };
  const directory = file => {
    if (!directories.has(file)) { trustedDirectory(file, observations, 0o755); directories.add(file); }
  };
  const read = (file, maximum = PACKAGE_RECEIPT_LIMIT) => readTrusted(file, observations, maximum, 0o444);
  const assertCurrent = () => {
    if (isClosed) throw new Error('PIPELINE_V10_BOOT_SOURCE_CLOSED');
    inputs.assertCurrent();
    for (const { file, fd, before } of observations) {
      if ((fd !== undefined && !same(before, fs.fstatSync(fd, { bigint: true }))) || !same(before, fs.lstatSync(file, { bigint: true }))) {
        throw new Error('PIPELINE_BOOT_RECEIPT_CHANGED');
      }
    }
  };
  try {
    directory(systemRoot); directory(path.dirname(expectedFile)); directory(path.join(systemRoot, 'selections'));
    const expected = JSON.parse(read(expectedFile, RECEIPT_LIMIT));
    const packageBytes = read(path.join(systemRoot, 'package-receipt.json'));
    const packageDigest = sha256(packageBytes), receipt = JSON.parse(packageBytes);
    verifyInstalledRuntimeBundle(receipt, packageRoot, service.role, runtimeSurface, observations);
    const source = capturePipelineMaterializerInputSource(path.join(systemRoot, 'config'));
    inputs = source.declared?.capture;
    if (source.rootSchemaVersion !== 'pipeline-entry.v10' || !inputs) throw new Error('PIPELINE_V10_BOOT_SOURCE_REQUIRED');
    // Retain physical trust and descriptors for EVERY original input, including
    // unselected schemas/packages. A matching seven-file projection is not v10.
    for (const member of inputs.members) {
      const file = path.join(systemRoot, member.relativePath);
      let parent = path.dirname(file);
      const parents = [];
      while (parent !== systemRoot) { parents.push(parent); parent = path.dirname(parent); }
      for (const ancestor of parents.reverse()) directory(ancestor);
      const bytes = read(file, Number.MAX_SAFE_INTEGER);
      if (bytes.byteLength !== member.byteLength || sha256(bytes) !== `sha256:${member.sha256}`) {
        throw new Error('PIPELINE_GENERATION_CHANGED');
      }
    }
    const image = JSON.parse(read(path.join(systemRoot, 'image-receipt.json')));
    const selection = JSON.parse(read(path.join(systemRoot, 'selections', `${callerId}.json`)));
    const owner = service.role === 'buster'
      ? JSON.parse(read(path.join(systemRoot, 'selections', `${callerId}.buster.json`))) : null;
    const received = receivePipelineV10BootSource({ expected, image, selection, owner }, inputs, services, callerId, packageDigest);
    const foundation = receipt.packages.find(record => record.id === 'plugin-foundation');
    const sdk = receipt.packages.find(record => record.id === 'plugin-sdk');
    if (fs.realpathSync(fileURLToPath(import.meta.url)) !== path.join(packageRoot, foundation.target, 'config/pipeline-boot.mjs')) {
      throw new Error('PIPELINE_READER_RESOLUTION_MISMATCH');
    }
    for (const asset of swarmReaderAssets) {
      const expectedAsset = asset.name === 'registry-digest.ts' ? path.join(packageRoot, foundation.target, 'registry/digest.ts')
        : asset.name === 'registry-errors.ts' ? path.join(packageRoot, foundation.target, 'registry/errors.ts')
        : asset.name === 'sdk-values.ts' ? path.join(packageRoot, sdk.target, 'src/values.ts')
        : path.join(packageRoot, foundation.target, 'config', asset.name);
      if (fs.realpathSync(fileURLToPath(swarmReaderAssetLocations[asset.name])) !== expectedAsset) throw new Error('PIPELINE_READER_RESOLUTION_MISMATCH');
      const bytes = readTrusted(new URL(swarmReaderAssetLocations[asset.name]), observations, Number.MAX_SAFE_INTEGER);
      if (sha256(bytes) !== asset.digest || bytes.byteLength !== asset.byteLength) throw new Error('PIPELINE_READER_CHANGED');
    }
    assertCurrent();
    return Object.freeze({ ...received, inputGenerationSha256: inputs.inputGenerationSha256,
      sourceMemberCount: inputs.members.length, installedPackageRoot: packageRoot, assertCurrent, close });
  } catch (error) { close(); throw error; }
}
