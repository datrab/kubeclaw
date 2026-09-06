import crypto from 'node:crypto';
import {
  canonicalJson,
  type AdapterActivationContext,
  type AdapterInstance,
  type ArtifactRef,
  type AdapterInvocation,
} from '@kubeclaw/plugin-sdk';
import {
  FileDurableBlobStore,
  FileDurableRecordStore,
  type DurableRecordStore,
  type DurableBlobStore,
} from '@kubeclaw/plugin-foundation/observability/durable-records';

const DEFAULT_MAXIMUM_RECORDS = 100_000;
const DEFAULT_MAXIMUM_STORE_BYTES = 256 * 1024 * 1024;

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || /[\r\n]/.test(value)) {
    throw new Error(`ARTIFACT_${label}_INVALID`);
  }
  return value;
}

function digestValue(value: unknown): string {
  const digest = requiredText(value, 'DIGEST');
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error('ARTIFACT_DIGEST_INVALID');
  return digest;
}

function stream(namespace: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,245}$/.test(namespace)) throw new Error('ARTIFACT_NAMESPACE_INVALID');
  return `artifacts/${namespace}`;
}

async function findArtifact(
  records: DurableRecordStore,
  blobs: DurableBlobStore,
  artifactId: string,
  namespace: string,
  predicate: (artifact: ArtifactRef) => boolean,
): Promise<{
  readonly value: unknown;
  readonly digest: string;
  readonly sizeBytes: number;
  readonly artifact: ArtifactRef;
}> {
  const matches = (await records.read<ArtifactRef>(stream(namespace)))
    .map((record) => record.payload)
    .filter((artifact) => artifact.artifactId === artifactId && predicate(artifact))
    .reverse();
  for (const artifact of matches) {
    try {
      return await readArtifact(blobs, artifact);
    } catch (error) {
      // Metadata is the bounded write intent. It becomes visible only after its
      // content-addressed blob exists. This also recovers a crash between the
      // metadata and blob writes without hiding an older completed artifact.
      if (error instanceof Error && error.message === 'ARTIFACT_NOT_FOUND') continue;
      throw error;
    }
  }
  throw new Error('ARTIFACT_NOT_FOUND');
}

async function readArtifact(blobs: DurableBlobStore, artifact: ArtifactRef): Promise<{
  readonly value: unknown;
  readonly digest: string;
  readonly sizeBytes: number;
  readonly artifact: ArtifactRef;
}> {
  let bytes: Buffer;
  try { bytes = await blobs.get(artifact.digest); } catch (error) {
    if (error instanceof Error && error.message === 'DURABLE_BLOB_NOT_FOUND') throw new Error('ARTIFACT_NOT_FOUND');
    if (error instanceof Error && error.message === 'DURABLE_BLOB_INTEGRITY_FAILED') throw new Error('ARTIFACT_INTEGRITY_FAILED');
    throw error;
  }
  return { value: JSON.parse(bytes.toString('utf8')), digest: artifact.digest, sizeBytes: bytes.byteLength, artifact };
}

async function invokeArtifact(
  records: DurableRecordStore,
  blobs: DurableBlobStore,
  maximumArtifactBytes: number,
  invocation: AdapterInvocation,
): Promise<Readonly<Record<string, unknown>>> {
  const { request, signal, confidential, fence } = invocation;
  if (!confidential) fence.assertCurrent();
  if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
  const artifactId = requiredText(request.resource.canonicalId, 'ID');
  if (request.capability === 'artifacts.read' && request.operation === 'get_json') {
    const digest = digestValue(request.payload.digest);
    const namespace = requiredText(request.payload.namespace, 'NAMESPACE');
    const stored = await findArtifact(records, blobs, artifactId, namespace, (entry) => entry.digest === digest);
    return { value: stored.value, digest: stored.digest, sizeBytes: stored.sizeBytes };
  }
  if (request.capability === 'artifacts.read' && request.operation === 'get_latest_json') {
    const namespace = requiredText(request.payload.namespace, 'NAMESPACE');
    return findArtifact(records, blobs, artifactId, namespace, (entry) => entry.producer.runId === request.attempt.runId);
  }
  if (request.capability !== 'artifacts.write' || request.operation !== 'put_json') {
    throw new Error(`ARTIFACT_OPERATION_UNSUPPORTED:${request.capability}:${request.operation}`);
  }
  const namespace = requiredText(request.payload.namespace, 'NAMESPACE');
  const mediaType = requiredText(request.payload.mediaType, 'MEDIA_TYPE');
  if (mediaType !== 'application/json') throw new Error('ARTIFACT_MEDIA_TYPE_UNSUPPORTED');
  const bytes = Buffer.from(canonicalJson(request.payload.value));
  if (bytes.byteLength > maximumArtifactBytes) throw new Error('ARTIFACT_SIZE_EXCEEDED');
  const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  const artifact: ArtifactRef = {
    artifactId,
    namespace,
    mediaType,
    digest,
    sizeBytes: bytes.byteLength,
    producer: request.attempt,
  };
  // Admit the bounded metadata record before the blob. A failed admission must
  // not leave an unreferenced blob. If blob storage fails, the same idempotent
  // request can retry and complete the missing content-addressed write.
  const committed = await records.append(
    stream(namespace),
    request.idempotencyKey,
    artifact,
  );
  await blobs.put(bytes);
  return { artifact: committed.record.payload };
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const configured = context.config.artifactRoot;
  if (typeof configured !== 'string' || configured.length === 0) throw new Error('artifactRoot is required');
  const maximum = context.config.maxArtifactBytes ?? 16 * 1024 * 1024;
  if (!Number.isSafeInteger(maximum) || Number(maximum) <= 0) throw new Error('maxArtifactBytes is invalid');
  const maximumStoreBytes = context.config.maximumStoreBytes ?? DEFAULT_MAXIMUM_STORE_BYTES;
  const maximumRecords = context.config.maximumRecords ?? DEFAULT_MAXIMUM_RECORDS;
  if (!Number.isSafeInteger(maximumStoreBytes) || Number(maximumStoreBytes) < 1) throw new Error('maximumStoreBytes is invalid');
  if (!Number.isSafeInteger(maximumRecords) || Number(maximumRecords) < 1) throw new Error('maximumRecords is invalid');
  const records = new FileDurableRecordStore(configured, {
    maximumRecords: Number(maximumRecords),
    maximumBytes: Number(maximumStoreBytes),
    maximumRecordBytes: 64 * 1024,
  });
  const blobs = new FileDurableBlobStore(configured, Number(maximum), Number(maximumStoreBytes));
  return {
    async ready() { await records.read<ArtifactRef>('artifacts/readiness'); },
    async invoke(invocation) { return invokeArtifact(records, blobs, Number(maximum), invocation); },
    async shutdown() {},
  };
}
