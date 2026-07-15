import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Buster Git Workflows — repo synchronization and push policy
// ═══════════════════════════════════════════════════════════════
//
// Buster-specific Git workflows built on shared Git primitives.
// Destructive sync/push policy remains Buster-owned.

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import os from 'os';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { getRepoRoot, gitExec, getCurrentBranch } from '../git-primitives.ts';
import { sleep } from '../timing.ts';
import type { TimeBudget } from '../timing.ts';
import { isRuntimeStatePath } from '../runtime-state-paths.ts';

export { getRepoRoot, gitExec, getCurrentBranch };

interface GitLogger {
  info?: (tag: string, msg: string) => void;
  warn?: (tag: string, msg: string) => void;
}

interface GitWorkflowOptions {
  logger?: GitLogger | null;
}

export interface GitSyncSuccess {
  ok: true;
  target_hash: string;
  actual_hash: string;
  error: null;
  detail: null;
}

export interface GitSyncFailure {
  ok: false;
  target_hash: string | null;
  actual_hash: null;
  error: 'missing_target_hash' | 'git_sync_failed';
  detail: string;
}

export type GitSyncResult = GitSyncSuccess | GitSyncFailure;

interface GitPushOptions extends GitWorkflowOptions {
  maxAttempts: number;
  retryDelayMs: number;
  commitMessage?: string;
  addPaths?: string[];
  budget?: TimeBudget | null;
  signal?: AbortSignal | null;
}

export interface GitPushResult {
  pushed: boolean;
  hash: string;
}

function titleCaseAgent(value: string): string {
  const normalized = String(selectDefinedValue(() => (value), () => (''))).trim().replace(/[-_]+/g, ' ');
  if (!normalized) return 'Buster';
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function firstLine(error: unknown): string {
  if (error instanceof Error) return selectTruthyValue(() => ((selectTruthyValue(() => (error.message), () => (String(error)))).split('\n')[0]), () => ('missing_error_detail'));
  return selectTruthyValue(() => (String(selectTruthyValue(() => (error), () => ('missing_error_detail'))).split('\n')[0]), () => ('missing_error_detail'));
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

function logGit(logger: GitLogger | null, level: 'info' | 'warn', msg: string): void {
  if (logger) logger[level]?.('GIT', msg);
}

function gitConfigValue(repoRoot: string, key: string): string | null {
  try {
    const value = gitExec(repoRoot, ['config', '--get', key]);
    return selectTruthyValue(() => (value), () => (null));
  } catch (_error: unknown) {
    return null;
  }
}

function ensureGitIdentity(repoRoot: string, logger: GitLogger | null): void {
  const existingName = gitConfigValue(repoRoot, 'user.name');
  const existingEmail = gitConfigValue(repoRoot, 'user.email');
  if (existingName && existingEmail) return;

  const rawAgent = process.env.CURRENT_AGENT ? process.env.CURRENT_AGENT : process.env.AGENT_NAME ? process.env.AGENT_NAME : 'buster';
  const agent = String(rawAgent).trim() ? String(rawAgent).trim() : 'buster';
  const fallbackName = `${titleCaseAgent(agent)} Agent`;
  const fallbackEmail = `${agent.toLowerCase()}@kubeclaw.swarm`;

  if (!existingName) {
    gitExec(repoRoot, ['config', 'user.name', fallbackName]);
    logGit(logger, 'info', `Configured local git user.name for ${agent}`);
  }
  if (!existingEmail) {
    gitExec(repoRoot, ['config', 'user.email', fallbackEmail]);
    logGit(logger, 'info', `Configured local git user.email for ${agent}`);
  }
}

function hasScopedStagedChanges(repoRoot: string, addPaths: string[]): boolean {
  try {
    gitExec(repoRoot, ['diff', '--cached', '--quiet', '--', ...addPaths]);
    return false;
  } catch (_error: unknown) {
    return true;
  }
}

// ─── gitSync ─────────────────────────────────────────────────────────────────

/**
 * Sync the repo to a deterministic task commit: fetch + reset-hard.
 *
 * DELETE_LEGACY: task repo sync must be tied to an explicit typed commit
 * identity; branch-derived sync is not accepted.
 *
 * STRICTIFY_TS_SLICE: Git failures stay nonthrowing for task lifecycle cleanup,
 * but return typed failure metadata instead of a magic null sentinel.
 */
export async function gitSync(repoRoot: string, expectedHash: string, opts: GitWorkflowOptions = {}): Promise<GitSyncResult> {
  const logger = selectTruthyValue(() => (opts.logger), () => (null));
  const targetHash = normalizeGitTargetHash(expectedHash);
  if (!targetHash) {
    const detail = 'gitSync requires explicit expectedHash; branch-derived sync is deleted';
    logGit(logger, 'warn', detail);
    return {
      ok: false,
      target_hash: null,
      actual_hash: null,
      error: 'missing_target_hash',
      detail,
    };
  }

  let runtimeState: { root: string; paths: string[] } | null = null;
  try {
    runtimeState = preserveRuntimeState(repoRoot);
    gitExec(repoRoot, ['fetch', 'origin'], { stdio: 'ignore', timeout: 30000 });
    logGit(logger, 'info', 'Fetched from origin');

    gitExec(repoRoot, ['reset', '--hard', targetHash], { stdio: 'ignore' });
    restoreRuntimeState(repoRoot, runtimeState);
    runtimeState = null;
    logGit(logger, 'info', `Reset to expected hash: ${targetHash}`);

    const actualHash = gitExec(repoRoot, ['rev-parse', 'HEAD']);
    if (!gitHashMatchesTarget(actualHash, targetHash)) {
      throw new Error(`gitSync HEAD mismatch: expected ${targetHash}, got ${actualHash}`);
    }
    logGit(logger, 'info', `Git sync complete: ${actualHash}`);
    return {
      ok: true,
      target_hash: targetHash,
      actual_hash: actualHash,
      error: null,
      detail: null,
    };
  } catch (error: unknown) {
    restoreRuntimeState(repoRoot, runtimeState);
    const detail = firstLine(error);
    logGit(logger, 'warn', `Git sync failed: ${detail}`);
    return {
      ok: false,
      target_hash: targetHash,
      actual_hash: null,
      error: 'git_sync_failed',
      detail,
    };
  }
}

// ─── gitPushWithRetry ────────────────────────────────────────────────────────

function normalizePositiveInteger(value: unknown, field: string): number {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) {
    throw new Error(`gitPushWithRetry ${field} is required`);
  }
  const numeric = Number(value);
  if (selectTruthyValue(() => (!Number.isInteger(numeric)), () => (numeric < 1))) {
    throw new Error(`gitPushWithRetry ${field} must be a positive integer`);
  }
  return numeric;
}

function normalizeNonNegativeNumber(value: unknown, field: string): number {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) {
    throw new Error(`gitPushWithRetry ${field} is required`);
  }
  const numeric = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(numeric)), () => (numeric < 0))) {
    throw new Error(`gitPushWithRetry ${field} must be a non-negative number`);
  }
  return numeric;
}

function normalizeScopedAddPaths(addPaths: unknown): string[] {
  if (selectTruthyValue(() => (!Array.isArray(addPaths)), () => (addPaths.length === 0))) {
    throw new Error('gitPushWithRetry commit mode requires non-empty opts.addPaths');
  }
  const normalized = addPaths.map((entry) => String(selectDefinedValue(() => (entry), () => (''))).trim()).filter(Boolean);
  if (normalized.length !== addPaths.length) {
    throw new Error('gitPushWithRetry opts.addPaths must not contain empty pathspecs');
  }
  for (const pathspec of normalized) {
    if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (pathspec === '.'), () => (pathspec === './'))), () => (pathspec === ':/'))), () => (pathspec === '-A'))), () => (pathspec.startsWith('-')))) {
      throw new Error(`gitPushWithRetry opts.addPaths contains unsafe broad pathspec: ${pathspec}`);
    }
  }
  return normalized;
}

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
          ...process.env,
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
  try { gitExec(repoRoot, ['rebase', '--abort'], { stdio: 'ignore' }); } catch (_error: unknown) { /* best-effort abort */ }
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

function normalizePushBranch(branch: unknown): string {
  if (typeof branch !== 'string') {
    throw new Error('gitPushWithRetry branch must be a valid branch name');
  }
  const normalized = branch;
  const invalidBranchChecks = [
    () => !normalized,
    () => normalized.startsWith('-'),
    () => normalized.startsWith('/'),
    () => normalized.endsWith('/'),
    () => normalized.endsWith('.'),
    () => normalized === '@',
    () => normalized.includes('..'),
    () => normalized.includes('@{'),
    () => normalized.includes('//'),
    () => /(?:^|\/)\./.test(normalized),
    () => /(?:^|\/)[^/]+\.lock(?:\/|$)/.test(normalized),
    () => /[\s\x00-\x1f\x7f~^:?*[\\]/.test(normalized),
  ];
  if (invalidBranchChecks.some((isInvalidBranch) => isInvalidBranch())) {
    throw new Error(`gitPushWithRetry branch must be a valid branch name: ${String(branch)}`);
  }
  return normalized;
}

/**
 * Push to origin with rebase-before-push strategy and bounded retry.
 *
 * If opts.commitMessage is provided, opts.addPaths must contain explicit
 * pathspecs. Commit mode performs `git add -- <addPaths...>` + `git commit`
 * before pushing. Each attempt: pull --rebase → push. On rebase failure with
 * attempts remaining, aborts and retries with exponential backoff.
 *
 * STRICTIFY_TS_SLICE: after the final rebase failure, fail closed. Do not push
 * over unresolved upstream/rebase state.
 */
export async function gitPushWithRetry(repoRoot: string, branch: string, opts: GitPushOptions = {}): Promise<GitPushResult> {
  const pushBranch = normalizePushBranch(branch);
  const maxAttempts = normalizePositiveInteger(opts.maxAttempts, 'opts.maxAttempts');
  const retryDelayMs = normalizeNonNegativeNumber(opts.retryDelayMs, 'opts.retryDelayMs');
  const budget = selectTruthyValue(() => (opts.budget), () => (null));
  const signal = selectTruthyValue(() => (opts.signal), () => (null));
  const logger = selectTruthyValue(() => (opts.logger), () => (null));

  if (opts.commitMessage) {
    const addPaths = normalizeScopedAddPaths(opts.addPaths);
    ensureGitIdentity(repoRoot, logger);
    gitExec(repoRoot, ['add', '--', ...addPaths]);
    if (!hasScopedStagedChanges(repoRoot, addPaths)) {
      return { pushed: false, hash: gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']) };
    }
    gitExec(repoRoot, ['commit', '-m', opts.commitMessage]);
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      gitExec(repoRoot, ['pull', '--rebase', '--autostash', 'origin', pushBranch], { stdio: 'ignore', timeout: 30000 });
    } catch (rebaseErr: unknown) {
      const detail = firstLine(rebaseErr);
      logGit(logger, 'warn', `Rebase attempt ${attempt}/${maxAttempts}: ${detail}`);
      const commitModeAddPaths = opts.commitMessage ? normalizeScopedAddPaths(opts.addPaths) : [];
      if (tryAutoResolveRebaseForScopedPaths(repoRoot, commitModeAddPaths, logger)) {
        // Rebase is already completed above. Continue to push on this same attempt.
      } else if (opts.commitMessage) {
        const rebuilt = rebuildScopedCommitOnOrigin(repoRoot, pushBranch, commitModeAddPaths, opts.commitMessage, logger);
        if (!rebuilt) return { pushed: false, hash: gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']) };
      } else {
        try { gitExec(repoRoot, ['rebase', '--abort'], { stdio: 'ignore' }); } catch (_error: unknown) { /* best-effort abort */ }
        if (attempt < maxAttempts) {
          await sleep(retryDelayMs * Math.pow(2, attempt - 1), { budget, signal });
          continue;
        }
        throw new Error(`gitPushWithRetry rebase failed after ${maxAttempts} attempt(s): ${detail}`);
      }
    }

    try {
      gitExec(repoRoot, ['push', 'origin', `HEAD:${pushBranch}`], { stdio: 'ignore', timeout: 60000 });
      const hash = gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']);
      return { pushed: true, hash };
    } catch (error: unknown) {
      if (attempt === maxAttempts) throw error;
      logGit(logger, 'warn', `Push attempt ${attempt}/${maxAttempts} failed: ${firstLine(error)}`);
      await sleep(retryDelayMs * Math.pow(2, attempt - 1), { budget, signal });
    }
  }

  throw new Error('gitPushWithRetry exhausted without terminal push result');
}
