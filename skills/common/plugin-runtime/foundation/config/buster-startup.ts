import { randomUUID } from 'node:crypto';
import { portableJson, sha256Text } from '@kubeclaw/plugin-sdk/values';
import { assertPipelineBootCapture, type PipelineBootCapture } from './pipeline-boot.mjs';
import { readPipelineServiceSelection, type PipelineServiceSelection } from './pipeline-generation.ts';
import { swarmReaderAssets } from './swarm-bundle.ts';

type Digest = `sha256:${string}`;
export interface BusterStartupHandoff {
  readonly schemaVersion: 'buster-system-generation-handoff.v1';
  readonly parentBootId: string;
  readonly entryPath: '/etc/kubeclaw/config/pipeline.config.json';
  readonly generationDigest: Digest;
  readonly parentSelection: PipelineServiceSelection;
  readonly childSelection: PipelineServiceSelection;
  readonly imageReceiptDigest: Digest;
  readonly readerSchemaDigests: Readonly<Record<string, Digest>>;
  readonly digest: Digest;
}
export interface BusterStartupAssociation {
  readonly schemaVersion: 'buster-preparation-startup-association.v1';
  readonly parentBootId: string;
  readonly handoffDigest: Digest;
  readonly generationDigest: Digest;
}
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
function closed(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function sameEngineSelection(parent: PipelineServiceSelection, child: PipelineServiceSelection): void {
  const parentEngine = parent.bindings.find(binding => binding.owner === 'buster-engine')!;
  const childEngine = child.bindings.find(binding => binding.owner === 'buster-engine')!;
  if (parent.role !== 'buster' || child.role !== 'buster' || parent.serviceInstanceId !== child.serviceInstanceId
    || parent.generationDigest !== child.generationDigest || parent.packageReceiptDigest !== child.packageReceiptDigest
    || portableJson(parentEngine) !== portableJson(childEngine)) throw new Error('BUSTER_STARTUP_ENGINE_SELECTION_MISMATCH');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Decode provenance only. Filesystem trust, lifetime and fd3 association remain separate required boundaries. */
export function readBusterStartupHandoff(value: unknown): BusterStartupHandoff {
  if (!closed(value, ['schemaVersion', 'parentBootId', 'entryPath', 'generationDigest', 'parentSelection',
    'childSelection', 'imageReceiptDigest', 'readerSchemaDigests', 'digest'])
    || value.schemaVersion !== 'buster-system-generation-handoff.v1' || value.entryPath !== '/etc/kubeclaw/config/pipeline.config.json'
    || typeof value.parentBootId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value.parentBootId)
    || !['generationDigest', 'imageReceiptDigest', 'digest'].every(key => typeof value[key] === 'string' && digestPattern.test(value[key] as string))
    || !closed(value.readerSchemaDigests, swarmReaderAssets.map(asset => asset.name))) throw new Error('BUSTER_STARTUP_HANDOFF_INVALID');
  const { digest, ...body } = value;
  if (sha256Text(portableJson(body)) !== digest) throw new Error('BUSTER_STARTUP_HANDOFF_DIGEST_MISMATCH');
  const parent = readPipelineServiceSelection(value.parentSelection, 'buster-preparation');
  const child = readPipelineServiceSelection(value.childSelection, 'buster-runtime');
  sameEngineSelection(parent, child);
  if (parent.generationDigest !== value.generationDigest
    || swarmReaderAssets.some(asset => (value.readerSchemaDigests as Record<string, unknown>)[asset.name] !== asset.digest)) {
    throw new Error('BUSTER_STARTUP_READER_GENERATION_MISMATCH');
  }
  return freeze(JSON.parse(portableJson(value)) as BusterStartupHandoff);
}

/** Only the already boot-verified parent can prepare the closed startup object. */
export function createBusterStartupHandoff(parent: PipelineBootCapture, childValue: unknown): BusterStartupHandoff {
  assertPipelineBootCapture(parent, 'buster-preparation');
  const child = readPipelineServiceSelection(childValue, 'buster-runtime');
  sameEngineSelection(parent.selectionReceipt, child);
  if (parent.bootProvenance.imageSelectionDigests['buster-runtime'] !== child.digest) throw new Error('BUSTER_STARTUP_CHILD_RECEIPT_NOT_IN_IMAGE');
  const body = {
    schemaVersion: 'buster-system-generation-handoff.v1' as const, parentBootId: randomUUID(),
    entryPath: '/etc/kubeclaw/config/pipeline.config.json' as const,
    generationDigest: parent.selectionReceipt.generationDigest, parentSelection: parent.selectionReceipt,
    childSelection: child, imageReceiptDigest: parent.bootProvenance.expectedReceipt.imageReceiptDigest,
    readerSchemaDigests: Object.fromEntries(swarmReaderAssets.map(asset => [asset.name, asset.digest])),
  };
  return readBusterStartupHandoff({ ...body, digest: sha256Text(portableJson(body)) });
}
export function busterStartupAssociation(handoff: BusterStartupHandoff): BusterStartupAssociation {
  const validated = readBusterStartupHandoff(handoff);
  return Object.freeze({ schemaVersion: 'buster-preparation-startup-association.v1', parentBootId: validated.parentBootId,
    handoffDigest: validated.digest, generationDigest: validated.generationDigest });
}
export function assertBusterStartupAssociation(value: unknown, handoff: BusterStartupHandoff): void {
  if (!closed(value, ['schemaVersion', 'parentBootId', 'handoffDigest', 'generationDigest'])
    || portableJson(value) !== portableJson(busterStartupAssociation(handoff))) throw new Error('BUSTER_STARTUP_ASSOCIATION_MISMATCH');
}

// All v1 association strings are ASCII with fixed lengths, so this is an exact wire bound.
export const busterStartupAssociationBytes = Buffer.byteLength(portableJson({
  schemaVersion: 'buster-preparation-startup-association.v1', parentBootId: '00000000-0000-4000-8000-000000000000',
  handoffDigest: `sha256:${'0'.repeat(64)}`, generationDigest: `sha256:${'0'.repeat(64)}`,
}));
