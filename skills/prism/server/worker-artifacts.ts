import { createHash } from 'node:crypto';
import type { WorkerArtifactRefV1, WorkerEvidenceRefV1 } from '@kubeclaw/pipeline-worker-core-contract';
const digest = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export function artifactLocation(artifact: WorkerArtifactRefV1, origin: URL): URL {
  const url = new URL(artifact.storageUrl);
  if (url.origin !== origin.origin || url.pathname !== `/v1/internal/artifacts/${artifact.contentDigest}`
    || url.search || url.hash || url.username || url.password || artifact.artifactId !== `artifact:${artifact.contentDigest}`) {
    throw new Error('Prism artifact location or identity is not allowed');
  }
  return url;
}
async function responseBytes(response: Response, maximum: number): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > maximum) {
    await response.body?.cancel(); throw new Error('Prism artifact response exceeds its byte limit');
  }
  const reader = response.body?.getReader(); if (!reader) throw new Error('Prism artifact response is empty');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error('Prism artifact response exceeds its byte limit');
      chunks.push(value);
    }
  } finally { try { await reader.cancel(); } finally { reader.releaseLock(); } }
  return Buffer.concat(chunks, size);
}
export class WorkerArtifactClient {
  readonly origin: URL;
  readonly #headers: Record<string, string>;
  constructor(origin: URL, secret: string, spiffeEnabled: boolean) {
    this.origin = new URL(origin);
    this.#headers = spiffeEnabled ? {} : { authorization: `Bearer ${secret}` };
  }
  async read(artifact: WorkerArtifactRefV1, signal: AbortSignal): Promise<Buffer> {
    const response = await fetch(artifactLocation(artifact, this.origin), { headers: this.#headers, signal, redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Prism artifact read failed: ${response.status}`); }
    const bytes = await responseBytes(response, artifact.sizeBytes);
    if (bytes.byteLength !== artifact.sizeBytes || digest(bytes) !== artifact.contentDigest) throw new Error('Prism artifact failed integrity validation');
    return bytes;
  }
  async upload(id: string, type: string, mediaType: string, content: Uint8Array, signal: AbortSignal): Promise<WorkerEvidenceRefV1> {
    const bytes = Buffer.from(content); const contentDigest = digest(bytes);
    const storageUrl = new URL(`/v1/internal/artifacts/${contentDigest}`, this.origin).toString();
    const response = await fetch(storageUrl, { method: 'POST', headers: { ...this.#headers, 'content-type': 'application/octet-stream' },
      body: new Uint8Array(bytes), signal, redirect: 'error' });
    const acknowledgment = await responseBytes(response, 8192);
    if (!response.ok) throw new Error(`Prism artifact upload failed: ${response.status}: ${acknowledgment.toString('utf8')}`);
    const stored = JSON.parse(acknowledgment.toString('utf8')) as { artifactId?: string; digest?: string; sizeBytes?: number };
    if (stored.artifactId !== `artifact:${contentDigest}` || stored.digest !== contentDigest || stored.sizeBytes !== bytes.byteLength) {
      throw new Error('Prism artifact upload acknowledgment failed integrity validation');
    }
    return { evidenceId: id, type, artifact: { artifactId: stored.artifactId, type, mediaType, contentDigest, sizeBytes: bytes.byteLength, storageUrl } };
  }
}
