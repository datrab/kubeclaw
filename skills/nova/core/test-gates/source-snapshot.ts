import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { attestSourceSnapshot, type SourceSnapshotV1 } from '@kubeclaw/pipeline-test-gate-contract';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const GIT_OBJECT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

function git(repositoryRoot: string, args: readonly string[], encoding: 'utf8'): string;
function git(repositoryRoot: string, args: readonly string[], encoding: 'buffer'): Buffer;
function git(repositoryRoot: string, args: readonly string[], encoding: 'utf8' | 'buffer'): string | Buffer {
  return execFileSync('git', ['-C', repositoryRoot, ...args], {
    encoding: encoding === 'utf8' ? 'utf8' : 'buffer',
    maxBuffer: 160 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export interface CommittedSourceSnapshot {
  readonly sourceSnapshot: SourceSnapshotV1;
  readonly repositoryArchive: Buffer;
}

/** Build immutable input from one committed Git tree. Working-tree bytes are never read. */
export function buildCommittedSourceSnapshot(options: {
  repositoryRoot: string;
  repositoryId: string;
  pipelineStageId: string;
  creatorAuthority: string;
  attestationPrivateKey: string | Buffer;
  revision?: string;
  maximumArchiveBytes: number;
}): CommittedSourceSnapshot {
  if (!path.isAbsolute(options.repositoryRoot) || !fs.statSync(options.repositoryRoot).isDirectory()) {
    throw new Error('NOVA_SOURCE_REPOSITORY_INVALID');
  }
  if (!ID.test(options.repositoryId) || !ID.test(options.pipelineStageId)
    || !ID.test(options.creatorAuthority)) throw new Error('NOVA_SOURCE_IDENTITY_INVALID');
  if (!Number.isSafeInteger(options.maximumArchiveBytes) || options.maximumArchiveBytes < 1
    || options.maximumArchiveBytes > 128 * 1024 * 1024) throw new Error('NOVA_SOURCE_ARCHIVE_LIMIT_INVALID');
  const root = fs.realpathSync(options.repositoryRoot);
  const top = fs.realpathSync(git(root, ['rev-parse', '--show-toplevel'], 'utf8').trim());
  if (top !== root) throw new Error('NOVA_SOURCE_REPOSITORY_ROOT_REQUIRED');
  const requested = options.revision ?? 'HEAD';
  const revision = git(root, ['rev-parse', '--verify', '--end-of-options', `${requested}^{commit}`], 'utf8').trim();
  const tree = git(root, ['rev-parse', '--verify', `${revision}^{tree}`], 'utf8').trim();
  if (!GIT_OBJECT.test(revision) || !GIT_OBJECT.test(tree)) throw new Error('NOVA_SOURCE_GIT_IDENTITY_INVALID');
  const repositoryArchive = git(root, ['archive', '--format=tar.gz', revision], 'buffer');
  if (repositoryArchive.byteLength < 1 || repositoryArchive.byteLength > options.maximumArchiveBytes) {
    throw new Error('NOVA_SOURCE_ARCHIVE_SIZE_EXCEEDED');
  }
  const archiveContentDigest = `sha256:${crypto.createHash('sha256').update(repositoryArchive).digest('hex')}`;
  return Object.freeze({
    sourceSnapshot: attestSourceSnapshot({ schemaVersion: 'source-snapshot.v1', sourceType: 'git-commit',
      pipelineStageId: options.pipelineStageId,
      repositoryId: options.repositoryId, revision: `git:${revision}`, tree: `git:${tree}`,
      archiveContentDigest, archiveSizeBytes: repositoryArchive.byteLength,
      creatorAuthority: options.creatorAuthority }, options.attestationPrivateKey),
    repositoryArchive,
  });
}
