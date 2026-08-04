import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Buster Git Workflows — repo synchronization and push policy
// ═══════════════════════════════════════════════════════════════
//
// Buster-specific Git workflows built on shared Git primitives.
// Destructive sync/push policy remains Buster-owned.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { getRepoRoot, gitExec, getCurrentBranch } from '../git-primitives.ts';
import { sleep } from '../timing.ts';
import { isRuntimeStatePath } from '../runtime-state-paths.ts';
import { busterEnvironmentSnapshot } from '../buster-environment.ts';
import { ensureGitIdentity, hasScopedStagedChanges } from './git-identity.ts';
import { logGit } from './git-workflow-contracts.ts';
import type { GitLogger, GitPushOptions, GitWorkflowOptions } from './git-workflow-contracts.ts';
import { normalizeNonNegativeNumber, normalizePositiveInteger, normalizePushBranch, normalizeScopedAddPaths } from './git-push-policy.ts';

export { getRepoRoot, gitExec, getCurrentBranch };

interface GitSyncSuccess {
  ok: true;
  target_hash: string;
  actual_hash: string;
  error: null;
  detail: null;
}

interface GitSyncFailure {
  ok: false;
  target_hash: string | null;
  actual_hash: null;
  error: 'missing_target_hash' | 'git_sync_failed';
  detail: string;
}

export interface GitPushResult {
  pushed: boolean;
  hash: string;
}

interface PushAttemptContext {
  repoRoot: string; branch: string; attempt: number; maxAttempts: number; retryDelayMs: number;
  options: GitPushOptions; logger: GitLogger | null;
}

function firstLine(error: unknown): string {
  const detail = error instanceof Error && error.message ? error.message : String(error || 'missing_error_detail');
  return detail.split('\n').at(0) || 'missing_error_detail';
}

function normalizeGitTargetHash(expectedHash: unknown): string | null {
  if (typeof expectedHash !== 'string') return null;
  const trimmed = expectedHash.trim();
  return trimmed ? trimmed : null;
}

function gitHashMatchesTarget(actualHash: string, targetHash: string): boolean {
  const normalizedActual = actualHash.toLowerCase();
  const normalizedTarget = targetHash.toLowerCase();
  return selectTruthyValue(() => (normalizedActual === normalizedTarget), () => ((/^[0-9a-f]+$/i.test(targetHash) && normalizedActual.startsWith(normalizedTarget))));
}

function trackedRuntimeStatePaths(repoRoot: string): string[] {
  const output = gitExec(repoRoot, ['ls-files', '-z', '--cached', '--modified', '--others', '--exclude-standard']);
  return [...new Set(
    output
      .split('\0')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => isRuntimeStatePath(entry))
      .filter((entry) => fs.existsSync(path.join(repoRoot, entry))),
  )];
}

function preserveRuntimeState(repoRoot: string): { root: string; paths: string[] } | null {
  const paths = trackedRuntimeStatePaths(repoRoot);
  if (paths.length === 0) return null;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-runtime-state-'));
  for (const relPath of paths) {
    const source = path.join(repoRoot, relPath);
    const target = path.join(root, relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  return { root, paths };
}

function restoreRuntimeState(repoRoot: string, snapshot: { root: string; paths: string[] } | null): void {
  if (!snapshot) return;
  try {
    for (const relPath of snapshot.paths) {
      const source = path.join(snapshot.root, relPath);
      const target = path.join(repoRoot, relPath);
      if (!fs.existsSync(source)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
  } finally {
    fs.rmSync(snapshot.root, { recursive: true, force: true });
  }
}

// ─── gitPushWithRetry ────────────────────────────────────────────────────────

function normalizeRepoRelativePath(value: unknown): string {
  return String(selectDefinedValue(() => (value), () => ('')))
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^(?:\.\/)+/, '')
    .trim();
}

function pathMatchesScopedPathspec(filePath: string, pathspecs: string[] = []): boolean {
  const normalizedFilePath = normalizeRepoRelativePath(filePath);
  if (!normalizedFilePath) return false;
  return pathspecs.some((pathspec) => selectTruthyValue(() => (normalizedFilePath === pathspec), () => (normalizedFilePath.startsWith(`${pathspec}/`))));
}

function isRebaseInProgress(repoRoot: string): boolean {
  try {
    const rebaseMergePath = gitExec(repoRoot, ['rev-parse', '--git-path', 'rebase-merge']);
    const rebaseApplyPath = gitExec(repoRoot, ['rev-parse', '--git-path', 'rebase-apply']);
    if (fs.existsSync(rebaseMergePath)) return true;
    return fs.existsSync(rebaseApplyPath);
  } catch (_error: unknown) {
    return false;
  }
}

function getConflictedPaths(repoRoot: string): string[] {
  try {
    return gitExec(repoRoot, ['diff', '--name-only', '--diff-filter=U'])
      .split('\n')
      .map((line) => normalizeRepoRelativePath(line))
      .filter(Boolean);
  } catch (_error: unknown) {
    return [];
  }
}

function tryAutoResolveRebaseForScopedPaths(repoRoot: string, addPaths: string[], logger: GitLogger | null): boolean {
  const conflicts = getConflictedPaths(repoRoot);
  if (conflicts.length === 0) return false;
  if (conflicts.some((file) => !pathMatchesScopedPathspec(file, addPaths))) {
    const nonScoped = conflicts.filter((file) => !pathMatchesScopedPathspec(file, addPaths));
    logGit(logger, 'warn', `Scoped Buster rebase has out-of-scope conflicts: ${nonScoped.join(', ')}`);
    return false;
  }

  logGit(logger, 'warn', `Auto-resolving ${conflicts.length} scoped Buster rebase conflict(s) in favor of local task output`);
  while (true) {
    const activeConflicts = getConflictedPaths(repoRoot);
    if (activeConflicts.length === 0) break;
    if (activeConflicts.some((file) => !pathMatchesScopedPathspec(file, addPaths))) return false;

    for (const file of activeConflicts) {
      gitExec(repoRoot, ['checkout', '--theirs', '--', file], { stdio: 'ignore' });
      gitExec(repoRoot, ['add', '--', file], { stdio: 'ignore' });
    }

    try {
      gitExec(repoRoot, ['rebase', '--continue'], {
        stdio: 'ignore',
        env: {
          ...busterEnvironmentSnapshot(),
          GIT_EDITOR: 'true',
        },
      });
    } catch (error: unknown) {
      if (!isRebaseInProgress(repoRoot)) break;
      const stillConflicted = getConflictedPaths(repoRoot);
      if (stillConflicted.length === 0) return false;
      if (stillConflicted.some((file) => !pathMatchesScopedPathspec(file, addPaths))) return false;
    }

    if (!isRebaseInProgress(repoRoot)) break;
  }

  logGit(logger, 'info', 'Scoped Buster rebase auto-resolved');
  return true;
}

function rebuildScopedCommitOnOrigin(repoRoot: string, branch: string, addPaths: string[], commitMessage: string, logger: GitLogger | null): boolean {
  try { gitExec(repoRoot, ['rebase', '--abort'], { stdio: 'ignore' }); } catch (_error: unknown) { /* INTENTIONAL_NONCRITICAL(best_effort_cleanup_failed): cleanup is idempotent or a primary failure remains authoritative. */ /* best-effort abort */ }
  gitExec(repoRoot, ['fetch', 'origin'], { stdio: 'ignore', timeout: 30000 });
  gitExec(repoRoot, ['reset', '--soft', `origin/${branch}`], { stdio: 'ignore' });
  gitExec(repoRoot, ['reset'], { stdio: 'ignore' });
  gitExec(repoRoot, ['add', '--', ...addPaths]);
  if (!hasScopedStagedChanges(repoRoot, addPaths)) {
    logGit(logger, 'info', 'Scoped Buster output already matches origin after rebase rebuild');
    return false;
  }
  gitExec(repoRoot, ['commit', '-m', commitMessage]);
  logGit(logger, 'info', 'Rebuilt scoped Buster artifact commit on current origin');
  return true;
}

function prepareScopedCommit(repoRoot: string, options: GitPushOptions, logger: GitLogger | null): GitPushResult | null {
  if (!options.commitMessage) return null;
  const addPaths = normalizeScopedAddPaths(options.addPaths);
  ensureGitIdentity(repoRoot, logger);
  gitExec(repoRoot, ['add', '--', ...addPaths]);
  if (!hasScopedStagedChanges(repoRoot, addPaths)) return { pushed: false, hash: gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']) };
  gitExec(repoRoot, ['commit', '-m', options.commitMessage]);
  return null;
}

async function recoverRebase(error: unknown, context: PushAttemptContext): Promise<'push' | 'retry' | GitPushResult> {
  const { repoRoot, branch, attempt, maxAttempts, retryDelayMs, options, logger } = context;
  const detail = firstLine(error);
  logGit(logger, 'warn', `Rebase attempt ${attempt}/${maxAttempts}: ${detail}`);
  const addPaths = options.commitMessage ? normalizeScopedAddPaths(options.addPaths) : [];
  if (tryAutoResolveRebaseForScopedPaths(repoRoot, addPaths, logger)) return 'push';
  if (options.commitMessage) {
    const rebuilt = rebuildScopedCommitOnOrigin(repoRoot, branch, addPaths, options.commitMessage, logger);
    return rebuilt ? 'push' : { pushed: false, hash: gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']) };
  }
  try { gitExec(repoRoot, ['rebase', '--abort'], { stdio: 'ignore' }); }
  catch (_error: unknown) { /* INTENTIONAL_NONCRITICAL(best_effort_cleanup_failed): cleanup is idempotent or a primary failure remains authoritative. */ }
  if (attempt >= maxAttempts) throw new Error(`gitPushWithRetry rebase failed after ${maxAttempts} attempt(s): ${detail}`);
  await sleep(retryDelayMs * Math.pow(2, attempt - 1), { budget: options.budget || null, signal: options.signal || null });
  return 'retry';
}
