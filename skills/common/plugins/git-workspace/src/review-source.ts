import { canonicalJson, parseReviewSubject, parseRuntimeWorkspace, sha256Text } from '@kubeclaw/plugin-sdk';
import type { AdapterInvocation } from '@kubeclaw/plugin-sdk';
import type { GitRunner } from './runner.ts';

/** Recheck at the Git mutation boundary, then consume only the pinned commit. */
export async function verifyApprovedGitSource(repository: string, invocation: AdapterInvocation, runner: GitRunner, allowDirty = false): Promise<string | undefined> {
  const raw = invocation.request.payload.approvedSource;
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('SOURCE_APPROVAL_BINDING_INVALID');
  const accepted = raw as { subject: unknown; sourceRevision: string };
  const subject = parseReviewSubject(accepted.subject, invocation.request.attempt.runId);
  if (subject.repositoryRoot !== repository || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(accepted.sourceRevision)) throw new Error('SOURCE_APPROVAL_REPOSITORY_MISMATCH');
  const read = async (args: string[]) => String((await runner.run(repository, args, invocation.signal)).stdout).trim();
  const actual = await read(['rev-parse', '--verify', 'HEAD^{commit}']);
  const architecture = await read(['rev-parse', '--verify', `${subject.architectureRef}^{commit}`]);
  const dirty = await read(['status', '--porcelain=v1', '--untracked-files=all']);
  const expectedArchitecture = subject.architectureRef === 'HEAD' ? accepted.sourceRevision : subject.architectureRevision;
  if (actual !== accepted.sourceRevision || architecture !== expectedArchitecture || (!allowDirty && dirty)) throw new Error('REVIEW_SUBJECT_STALE');
  if (canonicalJson([...subject.paths].sort()) !== canonicalJson(subject.paths)) throw new Error('REVIEW_SUBJECT_PATHS_INVALID');
  return accepted.sourceRevision;
}

export async function verifyApprovedWorkspace(workspace: string, invocation: AdapterInvocation, runner: GitRunner, revision?: string): Promise<void> {
  const raw = invocation.request.payload.approvedSource as { subject: unknown; sourceRevision: string } | undefined;
  if (!raw) return;
  const subject = parseReviewSubject(raw.subject, invocation.request.attempt.runId);
  for (const file of subject.files) {
    const listing = String((await runner.run(workspace, ['--literal-pathspecs', 'ls-tree', '-z', revision ?? raw.sourceRevision, '--', file.path], invocation.signal)).stdout);
    if (listing.slice(0, 6) !== file.mode || listing.slice(listing.indexOf('\t') + 1) !== `${file.path}\0`) throw new Error('SOURCE_APPROVAL_WORKSPACE_MODE_MISMATCH');
    const read = await runner.run(workspace, ['show', `${revision ?? raw.sourceRevision}:${file.path}`], invocation.signal);
    const content = String(read.stdout);
    if (sha256Text(content) !== file.digest || Buffer.byteLength(content) !== file.sizeBytes) throw new Error('SOURCE_APPROVAL_WORKSPACE_BYTES_MISMATCH');
  }
}

export async function verifyApprovedTransition(repository: string, invocation: AdapterInvocation, runner: GitRunner, revision: string): Promise<void> {
  const raw = invocation.request.payload.approvedSource as { sourceRevision: string } | undefined;
  if (!raw) return;
  const parent = String((await runner.run(repository, ['rev-parse', '--verify', `${revision}^1`], invocation.signal)).stdout).trim();
  if (parent !== raw.sourceRevision) throw new Error('SOURCE_APPROVAL_TRANSITION_PARENT_MISMATCH');
  await verifyApprovedWorkspace(repository, invocation, runner, revision);
}

/** Forge commits exactly one child of the worktree's original owned source. */
export async function verifyWorkspaceCommit(workspace: string, invocation: AdapterInvocation, runner: GitRunner, revision?: string): Promise<void> {
  const expected = invocation.request.payload.expectedParent;
  if (expected === undefined) return;
  const reference = parseRuntimeWorkspace(invocation.request.payload.workspaceReference, invocation.request.attempt);
  if (expected !== reference.sourceRevision || reference.workspacePath !== workspace) throw new Error('GIT_WORKSPACE_COMMIT_BINDING_INVALID');
  const actual = String((await runner.run(workspace, ['rev-parse', '--verify', revision ? `${revision}^1` : 'HEAD^{commit}'], invocation.signal)).stdout).trim();
  if (actual !== expected) throw new Error('GIT_WORKSPACE_SOURCE_MOVED');
}

export function pinnedMergeRevision(invocation: AdapterInvocation, actual: string): string {
  const expected = invocation.request.payload.sourceRevision;
  if (expected === undefined) return actual;
  if (typeof expected !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(expected)) throw new Error('GIT_MERGE_REVISION_INVALID');
  if (actual !== expected) throw new Error('GIT_MERGE_SOURCE_MOVED');
  return expected;
}
