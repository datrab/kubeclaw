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
export async function materializePipelineGeneration({ authorRoot, packageRoot, output, services, publisher, busterRuntimeSource }) {
  for (const directory of [authorRoot, packageRoot, output]) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.resolve(directory) !== directory) throw new Error('PIPELINE_MATERIALIZATION_PATH_INVALID');
  }
  if (!Array.isArray(services) || services.length === 0) throw new Error('PIPELINE_RELEASE_COMPOSITION_REQUIRED');
  // One original caller/binding composition owns this entire publication.
  // Installed imports yield below; never reread mutable caller-owned tuples
  // after validating a different composition or selecting its source policy.
  services = structuredClone(services);
  if (busterRuntimeSource !== undefined) {
    if (!(busterRuntimeSource instanceof Uint8Array)) throw new Error('PIPELINE_V10_RUNTIME_BYTES_REQUIRED');
    busterRuntimeSource = Buffer.from(busterRuntimeSource);
  }
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
    const { createPipelineGenerationReceipt, createPipelineServiceSelection, createBusterSelectedOwnerProjection, createPipelineV10ServiceSelection, createBusterV10SelectedOwnerProjection, receivePipelineV10ServiceSelection, receiveBusterV10SelectedOwnerProjection, createPipelineV10ImageReceipt, receivePipelineV10ImageReceipt, createPipelineV10ExpectedDelivery, receivePipelineV10ExpectedDelivery } = await import(pathToFileURL(path.join(directory, 'pipeline-generation.ts')).href);
    const { verifyInstalledRuntimeBundle, assertRuntimeBundleObservations } = await import(pathToFileURL(path.join(directory, 'runtime-bundle-receipt.mjs')).href);
    verifyInstalledRuntimeBundle(receipt, packageRoot, receipt.role, receipt.runtimeSurface, observations);
    const inputSource = capturePipelineMaterializerInputSource(authorRoot);
    inputCapture = inputSource.declared?.capture;
    if (busterRuntimeSource !== undefined && (inputSource.rootSchemaVersion !== 'pipeline-entry.v10' || receipt.role !== 'buster')) {
      throw new Error('PIPELINE_V10_RUNTIME_CALLER_REQUIRED');
    }
    // Validate the complete release composition before source/caller admission.
    // A valid first tuple must not hide a missing, duplicated or foreign caller.
    const callers = new Set();
    for (const service of services) {
      if (!service || service.role !== receipt.role || callers.has(service.callerId)) throw new Error('PIPELINE_RELEASE_COMPOSITION_INVALID');
      callers.add(service.callerId);
    }
    const requiredCallers = receipt.role === 'prism' ? (callers.has('prism-agent-bridge') ? ['prism-agent-bridge'] : ['prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion'])
      : receipt.role === 'buster' ? ['buster-preparation', 'buster-runtime'] : [];
    if (requiredCallers.length === 0 || callers.size !== requiredCallers.length || requiredCallers.some(caller => !callers.has(caller))) throw new Error('PIPELINE_RELEASE_CALLER_CLOSURE_REQUIRED');
    // All v10 release callers must match the same captured root's exact
    // owner/profile tuples before source/caller admission. This local join is
    // not an activation grant and never emits a legacy output.
    if (inputSource.rootSchemaVersion === 'pipeline-entry.v10') {
      const { validateSwarmSelection } = await import(pathToFileURL(path.join(directory, 'swarm-bundle.ts')).href);
      const sourceRoot = JSON.parse(inputSource.declared.capture.read('config/pipeline.config.json'));
      const workerCore = JSON.parse(inputSource.declared.capture.read('config/components/worker-core.config.json'));
      for (const service of services) {
        validateSwarmSelection(service);
        const expected = sourceRoot.bindings.filter(binding => binding.role === service.role
          && binding.instanceId === service.serviceInstanceId
          && service.bindings.some(selected => selected.owner === binding.owner))
          .map(({ owner, instanceId, profileId }) => ({ owner, instanceId, profileId }));
        const ordered = bindings => [...bindings].sort((a, b) => a.owner.localeCompare(b.owner));
        if (!isDeepStrictEqual(ordered(service.bindings), ordered(expected))) throw new Error('PIPELINE_RELEASE_BINDING_MISMATCH');

      }
      for (const service of services) {
        // Preserve the original versioned consumer set: v3 WorkerCore is
        // mandatory for these callers, not an optional caller-owned subset.
        if (['prism-control', 'prism-worker', 'buster-preparation'].includes(service.callerId)
          && service.bindings.some(binding => binding.owner === 'worker-core') !== (workerCore.schemaVersion === 'pipeline-component.v3')) {
          throw new Error('WORKER_CORE_VERSIONED_SELECTION_REQUIRED');
        }
      }
    }
    if (inputSource.rootSchemaVersion === 'pipeline-entry.v10' && receipt.role === 'buster') {
      const { inspectPipelineV10BusterServiceSelection } = await import(pathToFileURL(path.join(directory, 'pipeline-v10-receiver.ts')).href);
      const selected = services.map(service => ({ service, original: inspectPipelineV10BusterServiceSelection({ role: service.role,
        callerId: service.callerId, serviceInstanceId: service.serviceInstanceId }, inputSource.declared.capture) }));
      const parent = selected.find(value => value.service.callerId === 'buster-preparation');
      const child = selected.find(value => value.service.callerId === 'buster-runtime');
      if (parent.service.serviceInstanceId !== child.service.serviceInstanceId
        || parent.original.profileId !== child.original.profileId) throw new Error('PIPELINE_BUSTER_HANDOFF_SELECTION_MISMATCH');
    }
    // Prepare the distinct full-input v10 producer identity, never a relabeled
    // legacy v1 receipt. Source/caller and output/boot admission remain closed.
    if (inputSource.rootSchemaVersion === 'pipeline-entry.v10') {
      for (const service of services) {
        const candidate = createPipelineV10ServiceSelection(inputSource.declared.capture, service, hash(packageBytes));
        // Exercise the versioned wire readback against the SAME retained
        // original inputs and separately held caller/package tuple. This does
        // not open the source/caller or output/boot admission below.
        const received = receivePipelineV10ServiceSelection(JSON.parse(jsonBytes(candidate)),
          inputSource.declared.capture, service, hash(packageBytes));
        if (receipt.role === 'buster') {
          const owner = createBusterV10SelectedOwnerProjection(inputSource.declared.capture, received);
          receiveBusterV10SelectedOwnerProjection(JSON.parse(jsonBytes(owner)), inputSource.declared.capture,
            received, service, hash(packageBytes));
        }
      }
    }
    if (inputSource.rootSchemaVersion === 'pipeline-entry.v10') {
      // Bind and read back the whole versioned release output against retained
      // inputs and the separately held release composition/package. This is
      // still a candidate: source/caller and boot gates below remain closed.
      const { receivePipelineV10BootSource } = await import(pathToFileURL(path.join(directory, 'pipeline-boot.mjs')).href);
      const image = createPipelineV10ImageReceipt(inputSource.declared.capture, services, hash(packageBytes));
      receivePipelineV10ImageReceipt(JSON.parse(jsonBytes(image)), inputSource.declared.capture, services, hash(packageBytes));
      for (const service of services) {
        // Read back each expected-delivery v2 against the original full release,
        // never against a tuple or image identity supplied by received bytes.
        const expected = createPipelineV10ExpectedDelivery(inputSource.declared.capture, services, service.callerId, hash(packageBytes));
        receivePipelineV10ExpectedDelivery(JSON.parse(jsonBytes(expected)), inputSource.declared.capture,
          services, service.callerId, hash(packageBytes));
        const selection = createPipelineV10ServiceSelection(inputSource.declared.capture, service, hash(packageBytes));
        const owner = receipt.role === 'buster'
          ? createBusterV10SelectedOwnerProjection(inputSource.declared.capture, selection) : null;
        // Exercise the actual installed boot module's distinct v10 readback,
        // with the original full input capture and release held independently.
        // No v1 codec, productive capture or activation grant is returned.
        receivePipelineV10BootSource(JSON.parse(jsonBytes({ expected, image, selection, owner })),
          inputSource.declared.capture, services, service.callerId, hash(packageBytes));
      }
    }
    if (inputSource.rootSchemaVersion === 'pipeline-entry.v10') {
      // Exercise the real installed reader on the distinct physical v2 layout,
      // not only an in-memory wire. No v1 output/verified Swarm capture or
      // publication is authorized by this staged source observation.
      const { capturePipelineV10BootSource, capturePipelineV10BusterRuntimeSource, capturePipelineV10BusterPreparationSource } = await import(pathToFileURL(path.join(directory, 'pipeline-boot.mjs')).href);
      const parent = path.dirname(output);
      if (fs.realpathSync(parent) !== parent || !fs.lstatSync(parent).isDirectory()) throw new Error('PIPELINE_GENERATION_PARENT_INVALID');
      stage = fs.mkdtempSync(path.join(parent, '.pipeline-stage-'));
      await stagePipelineV10BootSource(stage, inputCapture, services, packageBytes, directory, busterRuntimeSource);
      for (const service of services) {
        const expectedFile = path.join(stage, 'expected', service.callerId, 'expected-delivery.json');
        const captured = service.callerId === 'buster-preparation'
          ? await capturePipelineV10BusterPreparationSource(expectedFile, path.join(stage, 'system'), packageRoot, receipt.runtimeSurface, services)
          : service.callerId === 'buster-runtime' && busterRuntimeSource !== undefined
          ? await capturePipelineV10BusterRuntimeSource(expectedFile, path.join(stage, 'system'), packageRoot, receipt.runtimeSurface, services)
          : capturePipelineV10BootSource(expectedFile, path.join(stage, 'system'), service.callerId, packageRoot, receipt.runtimeSurface, services);
        try { captured.assertCurrent(); inputCapture.assertCurrent(); }
        finally { captured.close(); }
      }
      // Installed source readback does not implement Swarm/runtime.v2/startup
      // authorization. Continue through the ORIGINAL direct source preflights
      // below; their unconditional v10 denial remains intact. No v1 output.

    }
    const captures = [], selections = [];
    for (const service of services) {
      const capture = captureSwarmSettings(path.join(authorRoot, 'pipeline.config.json'), service);
      const capturedRoot = capture.identity.files.find(file => file.name === 'pipeline.config.json');
      if (!capturedRoot || capturedRoot.sha256 !== inputSource.rootMember.sha256 || capturedRoot.byteLength !== inputSource.rootMember.byteLength) throw new Error('PIPELINE_AUTHOR_GENERATION_CHANGED');
      // The current v10 loader denies source/caller admission above. Even when
      // that closes, never route v10 through legacy v1 receipts/v3 output codecs.
      if (inputSource.rootSchemaVersion === 'pipeline-entry.v10') throw new Error('PIPELINE_V10_OUTPUT_RECEIVER_REQUIRED');
      captures.push(capture);
      selections.push(createPipelineServiceSelection(capture, service.callerId, hash(packageBytes)));
    }
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

/** Shared physical v2 output route, used by the real role materializer before
 * source admission. It only stages bytes: no publisher or activation grant.
 */
export async function stagePipelineV10BootSource(stage, inputs, services, packageBytes, installedConfigDirectory, busterRuntimeSource) {
  services = structuredClone(services);
  packageBytes = Buffer.from(packageBytes);
  if (busterRuntimeSource !== undefined) {
    if (!(busterRuntimeSource instanceof Uint8Array)) throw new Error('PIPELINE_V10_RUNTIME_BYTES_REQUIRED');
    busterRuntimeSource = Buffer.from(busterRuntimeSource);
  }
  if (!path.isAbsolute(stage) || path.resolve(stage) !== stage || fs.realpathSync(stage) !== stage
    || !fs.lstatSync(stage).isDirectory()) throw new Error('PIPELINE_GENERATION_PARENT_INVALID');
  const { createPipelineV10ImageReceipt, createPipelineV10ServiceSelection,
    createBusterV10SelectedOwnerProjection, createPipelineV10ExpectedDelivery } =
    await import(pathToFileURL(path.join(installedConfigDirectory, 'pipeline-generation.ts')).href);
  const image = createPipelineV10ImageReceipt(inputs, services, hash(packageBytes));
  if (busterRuntimeSource !== undefined) {
    const service = services.find(value => value.callerId === 'buster-runtime');
    if (!service || services.some(value => value.role !== 'buster')) throw new Error('PIPELINE_V10_RUNTIME_CALLER_REQUIRED');
    const { inspectPipelineV10BusterRuntimeSourceIdentity } = await import(pathToFileURL(path.join(installedConfigDirectory, 'pipeline-v10-receiver.ts')).href);
    inspectPipelineV10BusterRuntimeSourceIdentity({ role: service.role, callerId: service.callerId,
      serviceInstanceId: service.serviceInstanceId }, busterRuntimeSource, inputs);
    write(stage, 'system/runtime/buster-runtime.json', busterRuntimeSource);
  }
  for (const member of inputs.members) write(stage, `system/${member.relativePath}`, inputs.read(member.relativePath));
  write(stage, 'system/package-receipt.json', packageBytes);
  write(stage, 'system/image-receipt.json', jsonBytes(image));
  for (const service of services) {
    const selection = createPipelineV10ServiceSelection(inputs, service, hash(packageBytes));
    write(stage, `system/selections/${service.callerId}.json`, jsonBytes(selection));
    if (selection.role === 'buster') write(stage, `system/selections/${service.callerId}.buster.json`,
      jsonBytes(createBusterV10SelectedOwnerProjection(inputs, selection)));
    write(stage, `expected/${service.callerId}/expected-delivery.json`,
      jsonBytes(createPipelineV10ExpectedDelivery(inputs, services, service.callerId, hash(packageBytes))));
  }
  inputs.assertCurrent();
  sealDirectories(stage);
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
