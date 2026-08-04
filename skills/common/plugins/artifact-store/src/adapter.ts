import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  canonicalJson,
  type AdapterActivationContext,
  type AdapterInstance,
  type ArtifactRef,
  type AdapterInvocation,
} from '@kubeclaw/plugin-sdk';

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

function blobPath(root: string, digest: string): string {
  const hash = digest.slice('sha256:'.length);
  return path.join(root, 'blobs', 'sha256', hash.slice(0, 2), `${hash.slice(2)}.json`);
}

function writeImmutable(file: string, bytes: Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    const descriptor = fs.openSync(file, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = fs.readFileSync(file);
    if (!existing.equals(bytes)) throw new Error('ARTIFACT_DIGEST_COLLISION');
  }
}

function appendCatalog(root: string, artifact: ArtifactRef): void {
  const file = path.join(root, 'catalog.jsonl');
  const descriptor = fs.openSync(file, 'a', 0o600);
  try {
    fs.writeSync(descriptor, `${canonicalJson(artifact)}\n`);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function catalogContains(
  root: string,
  artifactId: string,
  namespace: string,
  digest: string,
): boolean {
  const file = path.join(root, 'catalog.jsonl');
  if (!fs.existsSync(file)) return false;
  return fs.readFileSync(file, 'utf8').split('\n').some((line) => {
    if (line.length === 0) return false;
    try {
      const artifact = JSON.parse(line) as Partial<ArtifactRef>;
      return artifact.artifactId === artifactId
        && artifact.namespace === namespace
        && artifact.digest === digest;
    } catch {
      throw new Error('ARTIFACT_CATALOG_INVALID');
    }
  });
}

function latestArtifact(
  root: string,
  artifactId: string,
  namespace: string,
  runId: string,
): ArtifactRef {
  const file = path.join(root, 'catalog.jsonl');
  if (!fs.existsSync(file)) throw new Error('ARTIFACT_NOT_FOUND');
  let latest: ArtifactRef | undefined;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.length === 0) continue;
    let artifact: ArtifactRef;
    try {
      artifact = JSON.parse(line) as ArtifactRef;
    } catch {
      throw new Error('ARTIFACT_CATALOG_INVALID');
    }
    if (
      artifact.artifactId === artifactId
      && artifact.namespace === namespace
      && artifact.producer.runId === runId
    ) {
      latest = artifact;
    }
  }
  if (!latest) throw new Error('ARTIFACT_NOT_FOUND');
  return latest;
}

function readArtifact(root: string, artifact: ArtifactRef): {
  readonly value: unknown;
  readonly digest: string;
  readonly sizeBytes: number;
  readonly artifact: ArtifactRef;
} {
  const file = blobPath(root, artifact.digest);
  if (!fs.existsSync(file)) throw new Error('ARTIFACT_NOT_FOUND');
  const bytes = fs.readFileSync(file);
  const actual = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  if (actual !== artifact.digest) throw new Error('ARTIFACT_INTEGRITY_FAILED');
  return {
    value: JSON.parse(bytes.toString('utf8')),
    digest: artifact.digest,
    sizeBytes: bytes.byteLength,
    artifact,
  };
}

async function invokeArtifact(root: string, maxArtifactBytes: number, invocation: AdapterInvocation): Promise<Readonly<Record<string, unknown>>> {
  const { request, signal, confidential, fence } = invocation;
  if (!confidential) fence.assertCurrent();
  if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
  if (request.capability === 'artifacts.read' && request.operation === 'get_json') {
    const digest = digestValue(request.payload.digest);
    const artifactId = requiredText(request.resource.canonicalId, 'ID');
    const namespace = requiredText(request.payload.namespace, 'NAMESPACE');
    if (!catalogContains(root, artifactId, namespace, digest)) throw new Error('ARTIFACT_NOT_FOUND');
    const stored = readArtifact(root, { artifactId, namespace, mediaType: 'application/json', digest, sizeBytes: 0, producer: request.attempt });
    return { value: stored.value, digest: stored.digest, sizeBytes: stored.sizeBytes };
  }
  if (request.capability === 'artifacts.read' && request.operation === 'get_latest_json') {
    return readArtifact(root, latestArtifact(root, requiredText(request.resource.canonicalId, 'ID'), requiredText(request.payload.namespace, 'NAMESPACE'), request.attempt.runId));
  }
  if (request.capability !== 'artifacts.write' || request.operation !== 'put_json') throw new Error(`ARTIFACT_OPERATION_UNSUPPORTED:${request.capability}:${request.operation}`);
  const artifactId = requiredText(request.resource.canonicalId, 'ID');
  const namespace = requiredText(request.payload.namespace, 'NAMESPACE');
  const mediaType = requiredText(request.payload.mediaType, 'MEDIA_TYPE');
  if (mediaType !== 'application/json') throw new Error('ARTIFACT_MEDIA_TYPE_UNSUPPORTED');
  const bytes = Buffer.from(canonicalJson(request.payload.value));
  if (bytes.byteLength > maxArtifactBytes) throw new Error('ARTIFACT_SIZE_EXCEEDED');
  const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  writeImmutable(blobPath(root, digest), bytes);
  const artifact: ArtifactRef = { artifactId, namespace, mediaType, digest, sizeBytes: bytes.byteLength, producer: request.attempt };
  appendCatalog(root, artifact);
  return { artifact };
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const configured = context.config.artifactRoot;
  if (typeof configured !== 'string' || configured.length === 0) throw new Error('artifactRoot is required');
  const maximum = context.config.maxArtifactBytes ?? 16 * 1024 * 1024;
  if (!Number.isSafeInteger(maximum) || Number(maximum) <= 0) throw new Error('maxArtifactBytes is invalid');
  const maxArtifactBytes = Number(maximum);
  const root = path.resolve(configured);
  return {
    async ready() {
      fs.mkdirSync(path.join(root, 'blobs', 'sha256'), { recursive: true, mode: 0o700 });
    },
    async invoke(invocation) { return invokeArtifact(root, maxArtifactBytes, invocation); },
    async shutdown() {},
  };
}
