import { PORTABLE_JSON_ENCODING, portableJson, sha256Text } from '@kubeclaw/plugin-sdk/values';
import { swarmReaderAssets, validateSwarmSelection } from './swarm-bundle.ts';
import type { captureSwarmSettings } from './swarm.ts';
import type { SwarmSelection } from './swarm-bundle.ts';
import type { capturePipelineInputSet } from './pipeline-input-set.ts';
import { preflightPipelineV10Owners } from './swarm-bundle.ts';
import { composePipelineV10InputSet } from './pipeline-v10-input-set.ts';

type Capture = ReturnType<typeof captureSwarmSettings>;
type Digest = `sha256:${string}`;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
}

/** Generation identity binds raw relative paths, byte lengths, profiles and validator/schema code. */
export function createPipelineGenerationReceipt(capture: Capture) {
  const profiles = Object.entries(capture.authors).flatMap(([owner, author]) =>
    Object.entries(author.profiles).map(([profileId, profile]) => ({ owner, profileId,
      digest: sha256Text(portableJson(profile.settings)) })));
  profiles.sort((a, b) => portableJson([a.owner, a.profileId]) < portableJson([b.owner, b.profileId]) ? -1 : 1);
  const body = {
    schemaVersion: 'pipeline-generation.v1', encoding: PORTABLE_JSON_ENCODING,
    rootSchemaVersion: 'pipeline-entry.v3',
    files: capture.identity.files.map(file => ({ path: file.name, byteLength: file.byteLength,
      digest: `sha256:${file.sha256}` })).sort((a, b) => a.path < b.path ? -1 : 1),
    readerAssets: [...swarmReaderAssets].sort((a, b) => a.name < b.name ? -1 : 1), profiles,
  };
  const receipt = { ...body, digest: sha256Text(portableJson(body)) };
  deepFreeze(receipt);
  return receipt;
}

export interface PipelineServiceSelection extends SwarmSelection {
  readonly schemaVersion: 'pipeline-service-selection.v1';
  readonly generationDigest: Digest;
  readonly packageReceiptDigest: Digest;
  readonly digest: Digest;
}

/** Only a producer holding the actual release composition and package receipt calls this. */
export function createPipelineServiceSelection(capture: Capture, callerId: SwarmSelection['callerId'],
  packageReceiptDigest: Digest): PipelineServiceSelection {
  if (!digestPattern.test(packageReceiptDigest)) throw new Error('PIPELINE_PACKAGE_DIGEST_INVALID');
  if (capture.identity.callerId !== callerId) throw new Error('PIPELINE_SERVICE_CALLER_MISMATCH');
  const generation = createPipelineGenerationReceipt(capture);
  const bindings = capture.identity.bindings;
  const first = bindings[0];
  if (!first || bindings.some(binding => binding.role !== first.role
    || binding.instanceId !== first.instanceId)) throw new Error('PIPELINE_SERVICE_BINDINGS_INVALID');
  const body = {
    schemaVersion: 'pipeline-service-selection.v1' as const, role: first.role,
    serviceInstanceId: first.instanceId, callerId, generationDigest: generation.digest,
    bindings: bindings.map(({ owner, instanceId, profileId }) => ({ owner, instanceId, profileId }))
      .sort((a, b) => a.owner < b.owner ? -1 : 1), packageReceiptDigest,
  };
  const result = { ...body, digest: sha256Text(portableJson(body)) };
  deepFreeze(result);
  return result;
}

/** Validate the closed wire receipt before sending its exact tuple projection to the loader. */
export function readPipelineServiceSelection(value: unknown, callerId: SwarmSelection['callerId']): PipelineServiceSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'bindings,callerId,digest,generationDigest,packageReceiptDigest,role,schemaVersion,serviceInstanceId') {
    throw new Error('PIPELINE_SERVICE_SELECTION_INVALID');
  }
  const receipt = value as PipelineServiceSelection;
  if (receipt.schemaVersion !== 'pipeline-service-selection.v1' || receipt.callerId !== callerId
    || !digestPattern.test(receipt.generationDigest) || !digestPattern.test(receipt.packageReceiptDigest)
    || !digestPattern.test(receipt.digest)) throw new Error('PIPELINE_SERVICE_SELECTION_INVALID');
  const { digest, ...body } = receipt;
  if (sha256Text(portableJson(body)) !== digest) throw new Error('PIPELINE_SERVICE_SELECTION_DIGEST_MISMATCH');
  const snapshot = JSON.parse(portableJson(receipt)) as PipelineServiceSelection;
  validateSwarmSelection(selectionProjection(snapshot));
  deepFreeze(snapshot);
  return snapshot;
}

/** This is selection provenance only, never a grant or image-authentication shortcut. */
export function selectionProjection(receipt: PipelineServiceSelection): SwarmSelection {
  return Object.freeze({ role: receipt.role, serviceInstanceId: receipt.serviceInstanceId,
    callerId: receipt.callerId, bindings: receipt.bindings });
}

/** Immutable delivery of the complete admitted Buster owner, including every
 * profile. This v1 projection covers the supported v3 generation only; it is
 * not runtime.v1 ENV source authority or permission to activate v10.
 */
export function createBusterSelectedOwnerProjection(capture: Capture, selection: PipelineServiceSelection) {
  if (!['buster-preparation', 'buster-runtime'].includes(selection.callerId)
    || selection.role !== 'buster' || capture.identity.callerId !== selection.callerId
    || createPipelineGenerationReceipt(capture).digest !== selection.generationDigest) {
    throw new Error('BUSTER_SELECTED_OWNER_IDENTITY_MISMATCH');
  }
  // A shared generation contains multiple service tuples. Equal owner settings
  // alone cannot join the received service/instance/bindings to this capture.
  // Reconstruct only from the retained original, never from current authors.
  const originalSelection = createPipelineServiceSelection(capture, selection.callerId, selection.packageReceiptDigest);
  if (portableJson(selection) !== portableJson(originalSelection)) {
    throw new Error('BUSTER_SELECTED_OWNER_IDENTITY_MISMATCH');
  }
  const binding = selection.bindings.find(value => value.owner === 'buster-engine');
  const author = capture.authors['buster-engine'];
  const component = capture.components['buster-engine'];
  if (!binding || !author || !component
    || portableJson(author.profiles[binding.profileId]?.settings) !== portableJson(component.settings)) {
    throw new Error('BUSTER_SELECTED_OWNER_PROFILE_MISMATCH');
  }
  const projection = structuredClone({ schemaVersion: 'buster-selected-owner-projection.v1',
    generationDigest: selection.generationDigest, selectionDigest: selection.digest,
    packageReceiptDigest: selection.packageReceiptDigest, callerId: selection.callerId,
    serviceInstanceId: selection.serviceInstanceId, binding, author, settings: component.settings });
  deepFreeze(projection);
  return projection;
}

/** Receive only the exact caller-bound projection of the already verified
 * original generation. No current B lookup, partial merge or ENV fallback.
 */
export function receiveBusterSelectedOwnerProjection(value: unknown, capture: Capture, selection: PipelineServiceSelection) {
  const expected = createBusterSelectedOwnerProjection(capture, selection);
  if (portableJson(value) !== portableJson(expected)) throw new Error('BUSTER_SELECTED_OWNER_PROJECTION_MISMATCH');
  return expected;
}

/** Versioned producer identity for the complete retained v10 source set.
 * Deliberately distinct from generation.v1: never relabel the v3 codec or infer
 * source/caller/native authorization from these public source digests.
 */
export function createPipelineV10GenerationReceipt(inputs: ReturnType<typeof capturePipelineInputSet>) {
  inputs.assertCurrent();
  const replacements = ['config/pipeline.config.json', 'schemas/pipeline-entry.schema.json'].map(name => {
    const member = inputs.members.find(value => value.relativePath === name);
    if (!member) throw new Error('PIPELINE_V10_GENERATION_INPUT_SET_REQUIRED');
    return member;
  });
  const declared = composePipelineV10InputSet(replacements);
  if (portableJson(inputs.members) !== portableJson(declared.members)) throw new Error('PIPELINE_V10_GENERATION_INPUT_SET_REQUIRED');
  const root = JSON.parse(inputs.read('config/pipeline.config.json').toString('utf8'));
  const names = ['prism-control', 'prism-studio', 'prism-worker', 'prism-execution', 'buster-engine', 'worker-core'];
  const authors = Object.fromEntries(names.map(owner => [owner,
    JSON.parse(inputs.read(`config/components/${owner}.config.json`).toString('utf8'))]));
  preflightPipelineV10Owners(root, authors);
  const profiles = names.flatMap(owner => Object.entries(authors[owner].profiles).map(([profileId, profile]) => ({
    owner, profileId, digest: sha256Text(portableJson((profile as { settings: unknown }).settings)),
  })));
  profiles.sort((a, b) => portableJson([a.owner, a.profileId]) < portableJson([b.owner, b.profileId]) ? -1 : 1);
  const body = { schemaVersion: 'pipeline-generation.v2' as const, encoding: PORTABLE_JSON_ENCODING,
    rootSchemaVersion: 'pipeline-entry.v10' as const, inputGenerationSha256: inputs.inputGenerationSha256,
    files: inputs.members.map(member => ({ path: member.relativePath, byteLength: member.byteLength,
      digest: `sha256:${member.sha256}` })),
    readerAssets: [...swarmReaderAssets].sort((a, b) => a.name < b.name ? -1 : 1), profiles };
  inputs.assertCurrent();
  const receipt = { ...body, digest: sha256Text(portableJson(body)) };
  deepFreeze(receipt);
  return receipt;
}


/** Source-bound v10 delivery candidate, NOT a Swarm capture or boot grant.
 * The distinct v2 wire must never pass a legacy selection/owner receiver.
 */
export function createPipelineV10ServiceSelection(inputs: ReturnType<typeof capturePipelineInputSet>,
  selection: SwarmSelection, packageReceiptDigest: Digest) {
  // Snapshot the caller tuple before consulting the captured author tree.
  selection = structuredClone(selection);
  validateSwarmSelection(selection);
  if (!digestPattern.test(packageReceiptDigest)) throw new Error('PIPELINE_PACKAGE_DIGEST_INVALID');
  const generation = createPipelineV10GenerationReceipt(inputs);
  const root = JSON.parse(inputs.read('config/pipeline.config.json').toString('utf8'));
  const worker = JSON.parse(inputs.read('config/components/worker-core.config.json').toString('utf8'));
  const ordered = (bindings: SwarmSelection['bindings']) => [...bindings].sort((a, b) => a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0);
  const expected = root.bindings.filter((binding: SwarmSelection['bindings'][number] & { role: string }) =>
    binding.role === selection.role && binding.instanceId === selection.serviceInstanceId
    && selection.bindings.some(value => value.owner === binding.owner))
    .map(({ owner, instanceId, profileId }: SwarmSelection['bindings'][number]) => ({ owner, instanceId, profileId }));
  if (portableJson(ordered(selection.bindings)) !== portableJson(ordered(expected))) {
    throw new Error('PIPELINE_RELEASE_BINDING_MISMATCH');
  }
  if (['prism-control', 'prism-worker', 'buster-preparation'].includes(selection.callerId)
    && selection.bindings.some(value => value.owner === 'worker-core') !== (worker.schemaVersion === 'pipeline-component.v3')) {
    throw new Error('WORKER_CORE_VERSIONED_SELECTION_REQUIRED');
  }
  const body = { schemaVersion: 'pipeline-service-selection.v2' as const, ...selection,
    bindings: ordered(selection.bindings), generationDigest: generation.digest, packageReceiptDigest };
  inputs.assertCurrent();
  const receipt = { ...body, digest: sha256Text(portableJson(body)) };
  deepFreeze(receipt);
  return receipt;
}

/** Exact original full-owner candidate. All profiles remain in the projection;
 * source/caller/native admission stays separately required, never inferred here.
 */
export function createBusterV10SelectedOwnerProjection(inputs: ReturnType<typeof capturePipelineInputSet>,
  selection: ReturnType<typeof createPipelineV10ServiceSelection>) {
  const tuple: SwarmSelection = { role: selection.role, callerId: selection.callerId,
    serviceInstanceId: selection.serviceInstanceId, bindings: selection.bindings };
  const expected = createPipelineV10ServiceSelection(inputs, tuple, selection.packageReceiptDigest);
  if (selection.role !== 'buster' || portableJson(selection) !== portableJson(expected)) {
    throw new Error('BUSTER_SELECTED_OWNER_IDENTITY_MISMATCH');
  }
  const binding = selection.bindings.find(value => value.owner === 'buster-engine');
  const author = JSON.parse(inputs.read('config/components/buster-engine.config.json').toString('utf8'));
  if (!binding || !Object.hasOwn(author.profiles, binding.profileId)) throw new Error('BUSTER_SELECTED_OWNER_PROFILE_MISMATCH');
  const projection = { schemaVersion: 'buster-selected-owner-projection.v2' as const,
    generationDigest: selection.generationDigest, selectionDigest: selection.digest,
    packageReceiptDigest: selection.packageReceiptDigest, callerId: selection.callerId,
    serviceInstanceId: selection.serviceInstanceId, binding: structuredClone(binding), author,
    settings: structuredClone(author.profiles[binding.profileId].settings) };
  inputs.assertCurrent();
  deepFreeze(projection);
  return projection;
}

/** Read back a v2 wire against the retained original inputs and the receiving
 * caller/package tuple. Never derive the expected tuple from untrusted wire.
 * This source-bound comparison is not source/caller or boot authorization.
 */
export function receivePipelineV10ServiceSelection(value: unknown,
  inputs: ReturnType<typeof capturePipelineInputSet>, selection: SwarmSelection,
  packageReceiptDigest: Digest) {
  const expected = createPipelineV10ServiceSelection(inputs, selection, packageReceiptDigest);
  if (portableJson(value) !== portableJson(expected)) throw new Error('PIPELINE_V10_SERVICE_SELECTION_MISMATCH');
  return expected;
}

/** Receive the full original owner, including unselected profiles, only after
 * the independently supplied receiving tuple and package have matched. No
 * legacy v1 receiver, current-author lookup, partial merge or ENV fallback.
 */
export function receiveBusterV10SelectedOwnerProjection(value: unknown,
  inputs: ReturnType<typeof capturePipelineInputSet>, selectionValue: unknown,
  selection: SwarmSelection, packageReceiptDigest: Digest) {
  const received = receivePipelineV10ServiceSelection(selectionValue, inputs, selection, packageReceiptDigest);
  const expected = createBusterV10SelectedOwnerProjection(inputs, received);
  if (portableJson(value) !== portableJson(expected)) throw new Error('BUSTER_V10_SELECTED_OWNER_PROJECTION_MISMATCH');
  return expected;
}

/** Versioned full-release output candidate. This binds the exact original caller
 * closure, complete Buster owner projections and package, not boot authority.
 * Never feed this v2 receipt to the legacy image/expected-delivery receivers.
 */
export function createPipelineV10ImageReceipt(inputs: ReturnType<typeof capturePipelineInputSet>,
  services: readonly SwarmSelection[], packageReceiptDigest: Digest) {
  if (!Array.isArray(services) || services.length === 0) throw new Error('PIPELINE_RELEASE_COMPOSITION_REQUIRED');
  services = structuredClone(services);
  const selections = services.map(service => createPipelineV10ServiceSelection(inputs, service, packageReceiptDigest));
  const role = selections[0]!.role;
  const callers = new Set(selections.map(selection => selection.callerId));
  if (selections.some(selection => selection.role !== role) || callers.size !== selections.length) {
    throw new Error('PIPELINE_RELEASE_COMPOSITION_INVALID');
  }
  const required = role === 'buster' ? ['buster-preparation', 'buster-runtime']
    : role === 'prism' ? (callers.has('prism-agent-bridge') ? ['prism-agent-bridge']
      : ['prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion']) : [];
  if (!required.length || callers.size !== required.length || required.some(caller => !callers.has(caller as SwarmSelection['callerId']))) {
    throw new Error('PIPELINE_RELEASE_CALLER_CLOSURE_REQUIRED');
  }
  if (role === 'buster' && selections.some(selection => selection.serviceInstanceId !== selections[0]!.serviceInstanceId)) {
    throw new Error('PIPELINE_BUSTER_HANDOFF_SELECTION_MISMATCH');
  }
  const ordered = [...selections].sort((a, b) => a.callerId < b.callerId ? -1 : 1);
  const generation = createPipelineV10GenerationReceipt(inputs);
  const body = { schemaVersion: 'pipeline-image-generation.v2' as const, role,
    generationDigest: generation.digest, inputGenerationSha256: inputs.inputGenerationSha256, packageReceiptDigest,
    selectionDigests: Object.fromEntries(ordered.map(selection => [selection.callerId, selection.digest])),
    ownerProjectionDigests: Object.fromEntries(ordered.filter(selection => selection.role === 'buster')
      .map(selection => [selection.callerId, sha256Text(portableJson(createBusterV10SelectedOwnerProjection(inputs, selection)))])) };
  inputs.assertCurrent();
  const receipt = { ...body, digest: sha256Text(portableJson(body)) };
  deepFreeze(receipt);
  return receipt;
}

/** Full output readback is compared to independently held original composition
 * and package, never to caller identities obtained from the received image.
 * Existing source/caller and native boot admission remain separately required.
 */
export function receivePipelineV10ImageReceipt(value: unknown,
  inputs: ReturnType<typeof capturePipelineInputSet>, services: readonly SwarmSelection[], packageReceiptDigest: Digest) {
  const expected = createPipelineV10ImageReceipt(inputs, services, packageReceiptDigest);
  if (portableJson(value) !== portableJson(expected)) throw new Error('PIPELINE_V10_IMAGE_RECEIPT_MISMATCH');
  return expected;
}
