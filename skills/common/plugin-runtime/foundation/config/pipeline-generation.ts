import { PORTABLE_JSON_ENCODING, portableJson, sha256Text } from '@kubeclaw/plugin-sdk/values';
import { swarmReaderAssets, validateSwarmSelection } from './swarm-bundle.ts';
import type { captureSwarmSettings } from './swarm.ts';
import type { SwarmSelection } from './swarm-bundle.ts';

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
