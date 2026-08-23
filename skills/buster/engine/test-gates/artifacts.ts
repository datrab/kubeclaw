import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ArtifactRefV1, DeclaredEvidenceV1 } from '@kubeclaw/pipeline-test-gate-contract';

export interface StoredEvidence {
  readonly declaration: DeclaredEvidenceV1;
  readonly artifact: ArtifactRefV1;
}

export interface EvidenceStore {
  store(attemptId: string, evidenceRoot: string, declaration: DeclaredEvidenceV1, maximumBytes: number): Promise<StoredEvidence>;
}

interface StagedEvidenceUse {
  readonly files: number;
  readonly bytes: number;
}

export async function stageEvidenceFiles(evidenceRoot: string, stagingRoot: string,
  declarations: readonly DeclaredEvidenceV1[], maximumFiles: number, maximumBytes: number,
  signal?: AbortSignal): Promise<StagedEvidenceUse> {
  if (declarations.length > maximumFiles) throw new Error('TEST_PROVIDER_ARTIFACT_FILE_LIMIT');
  await fs.promises.mkdir(stagingRoot, { recursive: true });
  const names = new Set<string>();
  let total = 0;
  for (const declaration of declarations) {
    if (signal?.aborted) throw signal.reason ?? new Error('TEST_PROVIDER_CANCELLED');
    if (names.has(declaration.file)) throw new Error(`TEST_PROVIDER_EVIDENCE_DUPLICATE:${declaration.evidenceId}`);
    names.add(declaration.file);
    const content = await readContainedFile(evidenceRoot, declaration.file, maximumBytes - total, signal);
    total += content.byteLength;
    if (total > maximumBytes) throw new Error('TEST_PROVIDER_ARTIFACT_BYTE_LIMIT');
    const stagingBase = path.resolve(stagingRoot);
    const destination = path.resolve(stagingBase, declaration.file);
    if (!destination.startsWith(`${stagingBase}${path.sep}`)) {
      throw new Error(`TEST_EVIDENCE_PATH_FORBIDDEN:${declaration.file}`);
    }
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await fs.promises.writeFile(destination, content, { flag: 'wx', signal });
  }
  return { files: declarations.length, bytes: total };
}

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
}

async function readContainedFile(rootValue: string, relative: string, maximumBytes: number,
  signal?: AbortSignal): Promise<Buffer> {
  if (path.isAbsolute(relative) || relative.length === 0) throw new Error(`TEST_EVIDENCE_PATH_INVALID:${relative}`);
  const root = fs.realpathSync(rootValue);
  const candidate = path.resolve(root, relative);
  if (!candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error(`TEST_EVIDENCE_PATH_FORBIDDEN:${relative}`);
  }
  let handle: Awaited<ReturnType<typeof fs.promises.open>>;
  try {
    handle = await fs.promises.open(candidate,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  } catch {
    throw new Error(`TEST_EVIDENCE_PATH_FORBIDDEN:${relative}`);
  }
  try {
    const sourceStat = await handle.stat();
    if (!sourceStat.isFile()) throw new Error(`TEST_EVIDENCE_PATH_FORBIDDEN:${relative}`);
    const openedPath = fs.realpathSync(candidate);
    if (!openedPath.startsWith(`${root}${path.sep}`)) throw new Error(`TEST_EVIDENCE_PATH_FORBIDDEN:${relative}`);
    const pathStat = fs.statSync(openedPath);
    if (pathStat.dev !== sourceStat.dev || pathStat.ino !== sourceStat.ino) {
      throw new Error(`TEST_EVIDENCE_PATH_FORBIDDEN:${relative}`);
    }
    if (sourceStat.size > maximumBytes) throw new Error('TEST_PROVIDER_ARTIFACT_BYTE_LIMIT');
    const content = await handle.readFile({ signal });
    if (content.byteLength > maximumBytes) throw new Error('TEST_PROVIDER_ARTIFACT_BYTE_LIMIT');
    return content;
  } finally {
    await handle.close();
  }
}

export class FileEvidenceStore implements EvidenceStore {
  readonly #root: string;

  constructor(root: string) {
    if (!path.isAbsolute(root)) throw new Error('TEST_EVIDENCE_STORE_ROOT_NOT_ABSOLUTE');
    fs.mkdirSync(root, { recursive: true });
    this.#root = fs.realpathSync(root);
  }

  async store(attemptId: string, evidenceRoot: string, declaration: DeclaredEvidenceV1, maximumBytes: number): Promise<StoredEvidence> {
    const content = await readContainedFile(evidenceRoot, declaration.file, maximumBytes);
    const digest = `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
    const destinationDirectory = path.join(this.#root, safeName(attemptId));
    await fs.promises.mkdir(destinationDirectory, { recursive: true });
    const destination = path.join(destinationDirectory, `${safeName(declaration.evidenceId)}-${path.basename(declaration.file)}`);
    await fs.promises.writeFile(destination, content, { flag: 'wx' });
    const artifact: ArtifactRefV1 = Object.freeze({
      artifactId: `artifact:${crypto.createHash('sha256').update(`${attemptId}:${declaration.evidenceId}`).digest('hex')}`,
      type: declaration.type,
      mediaType: declaration.mediaType,
      contentDigest: digest,
      sizeBytes: content.byteLength,
      storageUrl: pathToFileURL(destination).href,
    });
    return Object.freeze({ declaration: Object.freeze({ ...declaration }), artifact });
  }
}
