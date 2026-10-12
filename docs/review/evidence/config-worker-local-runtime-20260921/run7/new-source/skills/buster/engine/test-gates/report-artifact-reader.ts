import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ArtifactRefV1 } from '@kubeclaw/pipeline-test-gate-contract';

export interface ReportArtifactReader {
  read(artifact: ArtifactRefV1, maximumBytes: number, signal?: AbortSignal): Promise<Buffer>;
}

const DIGEST = /^sha256:[a-f0-9]{64}$/u;

async function readArtifactBytes(handle: Awaited<ReturnType<typeof fs.promises.open>>, expectedBytes: number,
  signal?: AbortSignal): Promise<Buffer> {
  const bytes = Buffer.alloc(expectedBytes + 1);
  let offset = 0;
  while (offset < bytes.byteLength) {
    if (signal?.aborted) throw signal.reason ?? new Error('REPORT_ADAPTER_CANCELLED');
    const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset !== expectedBytes) {
    throw new Error('REPORT_ARTIFACT_SIZE_MISMATCH');
  }
  return bytes.subarray(0, offset);
}

export class FileReportArtifactReader implements ReportArtifactReader {
  readonly #roots: string[];

  constructor(roots: readonly string[]) {
    if (roots.length === 0) throw new Error('REPORT_ARTIFACT_ROOT_REQUIRED');
    this.#roots = roots.map((root) => {
      if (!path.isAbsolute(root)) throw new Error('REPORT_ARTIFACT_ROOT_NOT_ABSOLUTE');
      const canonical = fs.realpathSync(root);
      if (canonical === path.parse(canonical).root) throw new Error('REPORT_ARTIFACT_ROOT_TOO_BROAD');
      return canonical;
    });
  }

  async read(artifact: ArtifactRefV1, maximumBytes: number, signal?: AbortSignal): Promise<Buffer> {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('REPORT_ADAPTER_SOURCE_LIMIT_INVALID');
    if (!artifact.storageUrl.startsWith('file:')) throw new Error('REPORT_ARTIFACT_STORAGE_UNSUPPORTED');
    if (!DIGEST.test(artifact.contentDigest)) throw new Error('REPORT_ARTIFACT_DIGEST_INVALID');
    if (artifact.sizeBytes > maximumBytes) throw new Error('REPORT_ADAPTER_SOURCE_LIMIT');
    const candidate = fileURLToPath(artifact.storageUrl);
    let handle: Awaited<ReturnType<typeof fs.promises.open>>;
    try {
      handle = await fs.promises.open(candidate, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    } catch {
      throw new Error('REPORT_ARTIFACT_PATH_FORBIDDEN');
    }
    try {
      const opened = fs.realpathSync(candidate);
      if (!this.#roots.some((root) => opened.startsWith(`${root}${path.sep}`))) {
        throw new Error('REPORT_ARTIFACT_PATH_FORBIDDEN');
      }
      const descriptor = await handle.stat();
      const current = fs.statSync(opened);
      if (!descriptor.isFile() || descriptor.dev !== current.dev || descriptor.ino !== current.ino) {
        throw new Error('REPORT_ARTIFACT_PATH_FORBIDDEN');
      }
      if (descriptor.size !== artifact.sizeBytes || descriptor.size > maximumBytes) {
        throw new Error('REPORT_ARTIFACT_SIZE_MISMATCH');
      }
      const content = await readArtifactBytes(handle, artifact.sizeBytes, signal);
      const digest = `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
      if (digest !== artifact.contentDigest) throw new Error('REPORT_ARTIFACT_DIGEST_MISMATCH');
      return content;
    } finally {
      await handle.close();
    }
  }
}

