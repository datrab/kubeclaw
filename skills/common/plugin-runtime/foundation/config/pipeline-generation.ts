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
