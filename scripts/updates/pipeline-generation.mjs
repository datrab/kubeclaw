import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { runtimeBundleFiles, validateRuntimeBundleReceipt } from '../../skills/common/plugin-runtime/foundation/config/runtime-bundle-receipt.mjs';

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function syncDirectory(directory) {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function write(directory, relative, bytes) {
  const file = path.join(directory, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o755 });
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o444);
  try { fs.writeFileSync(fd, bytes); fs.fchmodSync(fd, 0o444); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
function sealDirectories(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) sealDirectories(path.join(directory, entry.name));
  fs.chmodSync(directory, 0o755); syncDirectory(directory);
}
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

/** Shared role/release producer: explicit authored tuples only; no environment profile selector. */
export async function materializePipelineGeneration({ authorRoot, packageRoot, output, services, publisher }) {
  for (const directory of [authorRoot, packageRoot, output]) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.resolve(directory) !== directory) throw new Error('PIPELINE_MATERIALIZATION_PATH_INVALID');
  }
  if (!Array.isArray(services) || services.length === 0) throw new Error('PIPELINE_RELEASE_COMPOSITION_REQUIRED');
  if (fs.existsSync(output)) throw new Error('PIPELINE_GENERATION_EXISTS');
  const observations = [];
  let stage, inputCapture;
  try {
    if (fs.realpathSync(packageRoot) !== packageRoot) throw new Error('PIPELINE_PACKAGE_ROOT_NOT_PHYSICAL');
    const rootFd = fs.openSync(packageRoot, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    const rootStat = fs.fstatSync(rootFd, { bigint: true });
    observations.push({ file: packageRoot, fd: rootFd, before: rootStat });
    if (rootStat.uid !== 0n || (rootStat.mode & 0o022n) !== 0n) throw new Error('PIPELINE_PACKAGE_DIRECTORY_NOT_TRUSTED');
    const manifestPath = path.join(packageRoot, 'manifest.json');
    const manifestFd = fs.openSync(manifestPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const manifestStat = fs.fstatSync(manifestFd, { bigint: true });
    observations.push({ file: manifestPath, fd: manifestFd, before: manifestStat });
    if (!manifestStat.isFile() || manifestStat.uid !== 0n || manifestStat.nlink !== 1n
      || (manifestStat.mode & 0o022n) !== 0n || manifestStat.size > 8n * 1024n * 1024n) throw new Error('PIPELINE_PACKAGE_MANIFEST_NOT_TRUSTED');
    const packageBytes = fs.readFileSync(manifestFd);
    const receipt = JSON.parse(packageBytes);
    // Bootstrap with the producer's own verifier, before evaluating ANY code
    // from the candidate package (including its verifier and dependencies).
    // The installed verifier below additionally checks package-local import
    // resolution; it cannot safely be its own first readback check.
    validateRuntimeBundleReceipt(receipt, receipt.role, receipt.runtimeSurface);
    if (!isDeepStrictEqual(runtimeBundleFiles(packageRoot, true, observations),
      [...receipt.files].sort((a, b) => a.path < b.path ? -1 : 1))) {
      throw new Error('PIPELINE_PACKAGE_READBACK_MISMATCH');
    }
    const foundation = receipt.packages?.find(record => record.id === 'plugin-foundation');
    if (!foundation || foundation.target !== 'skills/packages/plugin-foundation') throw new Error('PIPELINE_FOUNDATION_PACKAGE_REQUIRED');
    const directory = path.join(packageRoot, foundation.target, 'config');
    const { captureSwarmSettings } = await import(pathToFileURL(path.join(directory, 'swarm.ts')).href);
    const { capturePipelineInputSet } = await import(pathToFileURL(path.join(directory, 'pipeline-input-set.ts')).href);
    const { capturePipelineMaterializerInputSource } = await import(pathToFileURL(path.join(directory, 'pipeline-v10-input-set.ts')).href);
    const { createPipelineGenerationReceipt, createPipelineServiceSelection, createBusterSelectedOwnerProjection } = await import(pathToFileURL(path.join(directory, 'pipeline-generation.ts')).href);
    const { verifyInstalledRuntimeBundle, assertRuntimeBundleObservations } = await import(pathToFileURL(path.join(directory, 'runtime-bundle-receipt.mjs')).href);
    verifyInstalledRuntimeBundle(receipt, packageRoot, receipt.role, receipt.runtimeSurface, observations);
    const inputSource = capturePipelineMaterializerInputSource(authorRoot);
    inputCapture = inputSource.declared?.capture;
    const callers = new Set(), captures = [], selections = [];
    for (const service of services) {
      if (service.role !== receipt.role || callers.has(service.callerId)) throw new Error('PIPELINE_RELEASE_COMPOSITION_INVALID');
      callers.add(service.callerId);
      const capture = captureSwarmSettings(path.join(authorRoot, 'pipeline.config.json'), service);
      const capturedRoot = capture.identity.files.find(file => file.name === 'pipeline.config.json');
      if (!capturedRoot || capturedRoot.sha256 !== inputSource.rootMember.sha256 || capturedRoot.byteLength !== inputSource.rootMember.byteLength) throw new Error('PIPELINE_AUTHOR_GENERATION_CHANGED');
      // The current v10 loader denies source/caller admission above. Even when
      // that closes, never route v10 through legacy v1 receipts/v3 output codecs.
      if (inputSource.rootSchemaVersion === 'pipeline-entry.v10') throw new Error('PIPELINE_V10_OUTPUT_RECEIVER_REQUIRED');
      captures.push(capture);
      selections.push(createPipelineServiceSelection(capture, service.callerId, hash(packageBytes)));
    }
    const requiredCallers = receipt.role === 'prism' ? (callers.has('prism-agent-bridge') ? ['prism-agent-bridge'] : ['prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion'])
      : receipt.role === 'buster' ? ['buster-preparation', 'buster-runtime'] : [];
    if (requiredCallers.length === 0 || callers.size !== requiredCallers.length || requiredCallers.some(caller => !callers.has(caller))) throw new Error('PIPELINE_RELEASE_CALLER_CLOSURE_REQUIRED');
    if (receipt.role === 'buster') {
      const parent = selections.find(selection => selection.callerId === 'buster-preparation');
      const child = selections.find(selection => selection.callerId === 'buster-runtime');
      const parentBinding = parent.bindings.find(binding => binding.owner === 'buster-engine');
      const childBinding = child.bindings.find(binding => binding.owner === 'buster-engine');
      if (parent.serviceInstanceId !== child.serviceInstanceId || parentBinding.instanceId !== childBinding.instanceId
        || parentBinding.profileId !== childBinding.profileId) throw new Error('PIPELINE_BUSTER_HANDOFF_SELECTION_MISMATCH');
    }
    const generation = createPipelineGenerationReceipt(captures[0]);
    if (captures.some(capture => createPipelineGenerationReceipt(capture).digest !== generation.digest)) throw new Error('PIPELINE_AUTHOR_GENERATION_CHANGED');
    const parent = path.dirname(output);
    if (fs.realpathSync(parent) !== parent || !fs.lstatSync(parent).isDirectory()) throw new Error('PIPELINE_GENERATION_PARENT_INVALID');
    stage = fs.mkdtempSync(path.join(parent, '.pipeline-stage-'));
    // Bind every admitted source/schema/owner member, not a recursive/latest
    // directory walk. The v10 loader must supply its full original input set;
    // current v3 captures intentionally still contain their seven admitted files.
    inputCapture ??= capturePipelineInputSet(authorRoot, captures[0].identity.files.map(file => ({
      relativePath: file.name, byteLength: file.byteLength, sha256: file.sha256,
    })));
    for (const member of inputCapture.members) write(stage, `system/${member.relativePath}`, inputCapture.read(member.relativePath));
    write(stage, 'system/package-receipt.json', packageBytes);
    const image = { schemaVersion: 'pipeline-image-generation.v1', generationDigest: generation.digest,
      packageReceiptDigest: hash(packageBytes), selectionDigests: Object.fromEntries(selections.map(selection => [selection.callerId, selection.digest])) };
    const imageBytes = jsonBytes(image);
    write(stage, 'system/image-receipt.json', imageBytes);
    for (const selection of selections) {
      if (selection.role === 'buster') {
        const capture = captures.find(value => value.identity.callerId === selection.callerId);
        write(stage, `system/selections/${selection.callerId}.buster.json`,
          jsonBytes(createBusterSelectedOwnerProjection(capture, selection)));
      }
      write(stage, `system/selections/${selection.callerId}.json`, jsonBytes(selection));
      write(stage, `expected/${selection.callerId}/expected-delivery.json`, jsonBytes({
        schemaVersion: 'pipeline-expected-delivery.v1', role: selection.role, serviceInstanceId: selection.serviceInstanceId,
        callerId: selection.callerId, generationDigest: generation.digest, selectionDigest: selection.digest,
        packageReceiptDigest: hash(packageBytes), imageReceiptDigest: hash(imageBytes),
      }));
    }
    sealDirectories(stage);
    // All source profiles and installed-code descriptors stay checked until publication.
    for (const capture of captures) if (createPipelineGenerationReceipt(captureSwarmSettings(path.join(authorRoot, 'pipeline.config.json'),
      services.find(service => service.callerId === capture.identity.callerId))).digest !== generation.digest) throw new Error('PIPELINE_AUTHOR_GENERATION_CHANGED');
    inputCapture.assertCurrent();
    assertRuntimeBundleObservations(observations);
    execFileSync(publisher, [stage, output], { stdio: 'pipe' });
    stage = undefined;
    syncDirectory(parent);
    return Object.freeze({ generationDigest: generation.digest, imageReceiptDigest: hash(imageBytes), callers: [...callers], output, inputGenerationSha256: inputCapture.inputGenerationSha256 });
  } finally {
    inputCapture?.close();
    for (const { fd } of observations) if (fd !== undefined) fs.closeSync(fd);
    if (stage) fs.rmSync(stage, { recursive: true, force: true });
  }
}

/** Exact install identity supplied by the release renderer, never inferred from a Pod name. */
export function declaredPipelineServices(authorRoot, { role, namespace, releaseName, deployment = 'services' }) {
  if (!['buster', 'prism'].includes(role) || ![namespace, releaseName].every(value =>
    typeof value === 'string' && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(value))) throw new Error('PIPELINE_DECLARED_RELEASE_IDENTITY_REQUIRED');
  if (!['services', 'agent-bridge'].includes(deployment) || (deployment === 'agent-bridge' && role !== 'prism')) throw new Error('PIPELINE_DECLARED_DEPLOYMENT_INVALID');
  const root = JSON.parse(fs.readFileSync(path.join(authorRoot, 'pipeline.config.json')));
  if (!Array.isArray(root.bindings)) throw new Error('PIPELINE_ROOT_BINDINGS_REQUIRED');
  const owners = role === 'prism' ? (deployment === 'agent-bridge' ? { 'prism-agent-bridge': ['prism-control'] } : {
    'prism-control': ['prism-control', 'prism-execution'],
    'prism-worker': ['prism-worker', 'prism-control', 'prism-execution'], 'prism-studio': ['prism-studio'], 'prism-ingestion': ['prism-control'],
  }) : { 'buster-preparation': ['buster-engine'], 'buster-runtime': ['buster-engine', 'worker-core'] };
  const workerCoreV3 = JSON.parse(fs.readFileSync(path.join(authorRoot, 'components/worker-core.config.json'))).schemaVersion === 'pipeline-component.v3';
  return Object.entries(owners).map(([callerId, originalConsumed]) => {
    const consumed = workerCoreV3 && ['prism-control', 'prism-worker', 'buster-preparation'].includes(callerId)
      ? [...originalConsumed, 'worker-core'] : originalConsumed;
    const container = role === 'buster' ? 'buster-v2-runtime' : callerId;
    const serviceInstanceId = `${namespace}/${releaseName}/${container}`;
    const bindings = root.bindings.filter(binding => binding.role === role && binding.instanceId === serviceInstanceId && consumed.includes(binding.owner))
      .map(({ owner, instanceId, profileId }) => ({ owner, instanceId, profileId }));
    if (bindings.length !== consumed.length || consumed.some(owner => bindings.filter(binding => binding.owner === owner).length !== 1)) {
      throw new Error(`PIPELINE_DECLARED_RELEASE_BINDING_REQUIRED:${callerId}:${serviceInstanceId}`);
    }
    return { role, serviceInstanceId, callerId, bindings };
  });
}
