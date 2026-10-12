import { sourceGit } from './source-git.ts';
import { GateDeadline } from './deadline.ts';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { attestSourceSnapshot, type SourceSnapshotV1 } from '@kubeclaw/pipeline-test-gate-contract';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const GIT_OBJECT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

export interface CommittedSourceSnapshot {
  readonly sourceSnapshot: SourceSnapshotV1;
  readonly repositoryArchive: Buffer;
}

/** Build immutable input from one committed Git tree. Working-tree bytes are never read. */
export async function buildCommittedSourceSnapshot(options: {
  repositoryRoot: string;
  repositoryId: string;
  pipelineStageId: string;
  creatorAuthority: string;
  attestationPrivateKey: string | Buffer;
  revision?: string;
  maximumArchiveBytes: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<CommittedSourceSnapshot> {
  const deadline = new GateDeadline(options.timeoutMs ?? 30_000, options.signal);
  try {
    deadline.check();
    if (!path.isAbsolute(options.repositoryRoot) || !(await fs.stat(options.repositoryRoot)).isDirectory()) {
      throw new Error('NOVA_SOURCE_REPOSITORY_INVALID');
    }
    if (!ID.test(options.repositoryId) || !ID.test(options.pipelineStageId)
      || !ID.test(options.creatorAuthority)) throw new Error('NOVA_SOURCE_IDENTITY_INVALID');
    assertArchiveLimit(options.maximumArchiveBytes);
    const root = await fs.realpath(options.repositoryRoot);
    const top = await fs.realpath((await sourceGit(root, ['rev-parse', '--show-toplevel'], 65536, deadline.signal)).toString('utf8').trim());
    if (top !== root) throw new Error('NOVA_SOURCE_REPOSITORY_ROOT_REQUIRED');
    const requested = options.revision ?? 'HEAD';
    const revision = (await sourceGit(root, ['rev-parse', '--verify', '--end-of-options', `${requested}^{commit}`], 65536, deadline.signal)).toString('utf8').trim();
    const tree = (await sourceGit(root, ['rev-parse', '--verify', `${revision}^{tree}`], 65536, deadline.signal)).toString('utf8').trim();
    if (!GIT_OBJECT.test(revision) || !GIT_OBJECT.test(tree)) throw new Error('NOVA_SOURCE_GIT_IDENTITY_INVALID');
    const repositoryArchive = await sourceGit(root, ['archive', '--format=tar.gz', revision], options.maximumArchiveBytes, deadline.signal);
    if (repositoryArchive.byteLength < 1 || repositoryArchive.byteLength > options.maximumArchiveBytes) {
      throw new Error('NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED');
    }
    deadline.check();
    const archiveContentDigest = `sha256:${crypto.createHash('sha256').update(repositoryArchive).digest('hex')}`;
    const snapshot = Object.freeze({
      sourceSnapshot: attestSourceSnapshot({ schemaVersion: 'source-snapshot.v1', sourceType: 'git-commit',
        pipelineStageId: options.pipelineStageId,
        repositoryId: options.repositoryId, revision: `git:${revision}`, tree: `git:${tree}`,
        archiveContentDigest, archiveSizeBytes: repositoryArchive.byteLength,
        creatorAuthority: options.creatorAuthority }, options.attestationPrivateKey),
      repositoryArchive,
    });
    deadline.check();
    return snapshot;
  } finally { deadline.dispose(); }
}

function assertArchiveLimit(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 128 * 1024 * 1024) throw new Error('NOVA_SOURCE_ARCHIVE_LIMIT_INVALID');
}
