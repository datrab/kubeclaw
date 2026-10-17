import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ArtifactRefV1 } from '@kubeclaw/pipeline-test-gate-contract';

/** Read the original producer bytes, not a new artifact relabelled at completion.
 * This is the existing durable-output receipt path, not QB-R02 input sealing.
 */
export async function readManagedEvidence(
  artifactRoot: string, artifact: ArtifactRefV1, maximumBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  artifact = Object.freeze({ ...artifact });
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0
    || !Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes < 0
    || artifact.sizeBytes > maximumBytes) {
    throw new Error('OBSERVABILITY_EVIDENCE_OBJECT_TOO_LARGE');
  }
  const source = new URL(artifact.storageUrl);
  if (source.protocol !== 'file:') {
    throw new Error(`OBSERVABILITY_EVIDENCE_STORAGE_UNSUPPORTED:${source.protocol}`);
  }
  const root = fs.realpathSync(artifactRoot);
  const candidate = fs.realpathSync(source);
  if (!candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error('OBSERVABILITY_EVIDENCE_PATH_FORBIDDEN');
  }
  const handle = await fs.promises.open(candidate,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    signal?.throwIfAborted();
    const opened = await handle.stat({ bigint: true });
    const currentPath = fs.realpathSync(candidate);
    const current = fs.statSync(currentPath, { bigint: true });
    if (!opened.isFile() || !currentPath.startsWith(`${root}${path.sep}`)
      || opened.dev !== current.dev || opened.ino !== current.ino) {
      throw new Error('OBSERVABILITY_EVIDENCE_PATH_FORBIDDEN');
    }
    if (opened.size > BigInt(maximumBytes)) {
      throw new Error('OBSERVABILITY_EVIDENCE_OBJECT_TOO_LARGE');
    }
    if (opened.size !== BigInt(artifact.sizeBytes)) {
      throw new Error('OBSERVABILITY_EVIDENCE_SOURCE_CHANGED');
    }
    // I/O chunks are not a new budget or reservation. Never readFile a growing
    // source and allocate beyond the existing admitted producer byte count.
    const chunks: Buffer[] = [], hash = crypto.createHash('sha256');
    let offset = 0;
    while (offset < artifact.sizeBytes) {
      signal?.throwIfAborted();
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, artifact.sizeBytes - offset));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset);
      signal?.throwIfAborted();
      if (bytesRead === 0) throw new Error('OBSERVABILITY_EVIDENCE_SOURCE_CHANGED');
      const bytes = chunk.subarray(0, bytesRead);
      chunks.push(bytes); hash.update(bytes); offset += bytesRead;
    }
    signal?.throwIfAborted();
    const { bytesRead: extra } = await handle.read(Buffer.alloc(1), 0, 1, offset);
    signal?.throwIfAborted();
    const final = await handle.stat({ bigint: true });
    if (extra !== 0 || ['dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs']
      .some(key => opened[key as keyof typeof opened] !== final[key as keyof typeof final])
      || `sha256:${hash.digest('hex')}` !== artifact.contentDigest) {
      throw new Error('OBSERVABILITY_EVIDENCE_SOURCE_CHANGED');
    }
    return Buffer.concat(chunks, artifact.sizeBytes);
  } finally {
    await handle.close();
    signal?.throwIfAborted();
  }
}
