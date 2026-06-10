// integrations/git-worktree.ts — Nova Git worktree policy

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { log } from '../core/logger.ts';
import { getRunStats } from '../core/runtime.ts';
import { STATUS } from '../core/constants.ts';
import { gitExec, headHash, invalidateHeadHash, setRepoRoot } from '../core/git-context.ts';
import { FAIL_PATTERNS, classifyGitPushError } from '../services/failures/classification.ts';
import { transitionModuleStatus } from '../lifecycle-state.ts';
import { sleep } from '../timing.ts';
import { buildSubprocessEnv } from '../security.ts';

type AnyRecord = Record<string, any>;
type PorcelainEntry = { raw: string; status: string; path: string };
type StashEntry = { ref: string; sha: string; subject: string };
type GitStructuredError = Error & { code?: string; gitSync?: AnyRecord; pollingGit?: AnyRecord };
type RuntimeStashState = { stashRef: string | null; stashSha?: string | null; paths: string[] } | null;
type GitCommitPushOptions = { addPaths?: string[]; captureHash?: boolean; softFail?: boolean; budget?: any; signal?: any };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { getRepoRoot, gitExec, headHash, invalidateHeadHash, setRepoRoot } from '../core/git-context.ts';
export { classifyGitPushError } from '../services/failures/classification.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function incrementStat(config: AnyRecord, key: string) {
  const stats = getRunStats(config);
  if (stats && typeof stats[key] === 'number') stats[key]++;
}

const SWARM_RUNTIME_ROOT_SEGMENT = '.swarm';
const SWARM_RUNTIME_PATH_SEGMENT = `/${SWARM_RUNTIME_ROOT_SEGMENT}/`;

function normalizeRepoPathForRuntimeCheck(relPathName: unknown): string {
  const normalized = String(relPathName || '')
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '');
  return `/${normalized}`;
}

function parsePorcelainEntries(repoRoot: string, args: string[] = ['status', '--porcelain', '--untracked-files=all']): PorcelainEntry[] {
  const output = gitExec(repoRoot, args);
  return output
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => {
      const trimmedUnstagedStatus = line.length > 2 && line[1] === ' ' && line[2] !== ' ' && /^[MADRCUT]$/.test(line[0] || '');
      const status = trimmedUnstagedStatus ? ` ${line[0]}` : line.slice(0, 2);
      const payload = line.slice(trimmedUnstagedStatus ? 2 : 3).trim();
      const filePath = payload.includes(' -> ') ? (payload.split(' -> ').pop() ?? '').trim() : payload;
      return { raw: line, status, path: filePath };
    });
}

function partitionRuntimeStateEntries(entries: PorcelainEntry[] = []) {
  const runtimeEntries: PorcelainEntry[] = [];
  const nonRuntimeEntries: PorcelainEntry[] = [];

  for (const entry of entries) {
    if (isRuntimeStatePath(normalizeRepoPathForRuntimeCheck(entry.path))) runtimeEntries.push(entry);
    else nonRuntimeEntries.push(entry);
  }

  return { runtimeEntries, nonRuntimeEntries };
}

function listStashRefs(repoRoot: string): string[] {
  return listStashEntries(repoRoot).map(entry => entry.ref);
}

function listStashEntries(repoRoot: string): StashEntry[] {
  const output = gitExec(repoRoot, ['stash', 'list', '--format=%gd%x00%H%x00%s']);
  return output
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean)
    .map((line: string) => {
      const [ref = '', sha = '', subject = ''] = line.split('\0');
      return { ref, sha, subject };
    })
    .filter((entry: StashEntry) => entry.ref && entry.sha);
}

function resolveStashRefBySha(repoRoot: string, stashState: RuntimeStashState): string | null {
  if (!stashState?.stashSha) return stashState?.stashRef || null;
  const entry = listStashEntries(repoRoot).find(stashEntry => stashEntry.sha === stashState.stashSha);
  return entry?.ref || null;
}

function getConflictedPaths(repoRoot: string): string[] {
  return gitExec(repoRoot, ['diff', '--name-only', '--diff-filter=U'])
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean);
}

function gitPath(repoRoot: string, gitPathName: string): string {
  const resolved = gitExec(repoRoot, ['rev-parse', '--git-path', gitPathName]).trim();
  return path.isAbsolute(resolved) ? resolved : path.join(repoRoot, resolved);
}

function isRebaseInProgress(repoRoot: string): boolean {
  try {
    return fs.existsSync(gitPath(repoRoot, 'rebase-merge')) || fs.existsSync(gitPath(repoRoot, 'rebase-apply'));
  } catch (_error) {
    return (
      fs.existsSync(path.join(repoRoot, '.git', 'rebase-merge')) ||
      fs.existsSync(path.join(repoRoot, '.git', 'rebase-apply'))
    );
  }
}

function createStructuredGitError(config: AnyRecord | null, code: string, message: string, details: AnyRecord = {}): GitStructuredError {
  const error: GitStructuredError = new Error(message);
  error.code = code;
  error.gitSync = {
    code,
    repo_root: config?.repo_root || null,
    project: config?.project || null,
    ...details,
  };
  return error;
}

function collectRuntimeStateStash(config: AnyRecord): RuntimeStashState {
  const entries = parsePorcelainEntries(config.repo_root);
  if (entries.length === 0) return null;

  const { runtimeEntries, nonRuntimeEntries } = partitionRuntimeStateEntries(entries);
  if (nonRuntimeEntries.length > 0) {
    const unsafePaths = nonRuntimeEntries.map(entry => entry.path);
    throw createStructuredGitError(
      config,
      FAIL_PATTERNS.GIT_SYNC_FAILED,
      `[${FAIL_PATTERNS.GIT_SYNC_FAILED}] Refusing to stash non-runtime local changes before pull-rebase.\n` +
        `  Unsafe paths: ${unsafePaths.slice(0, 10).join(', ')}\n` +
        `  Recovery:\n` +
        `    cd ${config.repo_root}\n` +
        `    git status\n` +
        `    # Commit, discard, or move these files manually, then resume the full pipeline:\n` +
        `    node pipeline.ts --project ${config.project} --resume`,
      {
        reason: 'non_runtime_dirty_paths',
        unsafe_paths: unsafePaths,
      },
    );
  }

  const stashPaths = [...new Set(runtimeEntries.map(entry => entry.path).filter(Boolean))];
  if (stashPaths.length === 0) return null;

  const beforeShas = new Set(listStashEntries(config.repo_root).map(entry => entry.sha));
  gitExec(config.repo_root, ['stash', 'push', '--include-untracked', '-m', 'pipeline-pre-push-runtime-state'], { stdio: 'ignore' });
  const afterEntries = listStashEntries(config.repo_root);
  const stashEntry = afterEntries.find(entry => !beforeShas.has(entry.sha)) || null;

  log('DEBUG', `Stashed ${stashPaths.length} runtime-state path(s) before pull-rebase`);
  return { stashRef: stashEntry?.ref || null, stashSha: stashEntry?.sha || null, paths: stashPaths };
}

function restoreRuntimeStateStash(config: AnyRecord, stashState: RuntimeStashState) {
  if (!stashState?.stashRef && !stashState?.paths?.length) return;

  const stashRef = resolveStashRefBySha(config.repo_root, stashState);
  if (!stashRef) {
    log('WARN', 'Runtime-state stash entry was not found during restore');
    return;
  }

  try {
    gitExec(config.repo_root, ['stash', 'pop', stashRef], { stdio: 'ignore' });
    log('DEBUG', 'Restored stashed runtime-state worktree after push');
    return;
  } catch (popErr) {
    const conflicts = getConflictedPaths(config.repo_root);
    if (conflicts.length === 0) throw popErr;

    const runtimeConflicts = conflicts.filter(file => isRuntimeStatePath(normalizeRepoPathForRuntimeCheck(file)));
    if (runtimeConflicts.length !== conflicts.length) {
      const nonRuntimeConflicts = conflicts.filter(file => !isRuntimeStatePath(normalizeRepoPathForRuntimeCheck(file)));
      throw createStructuredGitError(
        config,
        FAIL_PATTERNS.GIT_REBASE_CONFLICT,
        `[${FAIL_PATTERNS.GIT_REBASE_CONFLICT}] Restoring stashed local changes after pull-rebase produced non-runtime conflicts.\n` +
          `  Conflicted paths: ${nonRuntimeConflicts.slice(0, 10).join(', ')}\n` +
          `  Recovery:\n` +
          `    cd ${config.repo_root}\n` +
          `    git status\n` +
          `    git stash list\n` +
          `    # Resolve or recover the conflicted files manually, then resume the full pipeline:\n` +
          `    node pipeline.ts --project ${config.project} --resume`,
        {
          reason: 'stash_pop_non_runtime_conflict',
          conflicted_paths: conflicts,
          stash_ref: stashRef,
          stash_sha: stashState.stashSha || null,
        },
      );
    }

    log('WARN', `Stash pop conflicted on runtime-state files only — restoring stashed versions for ${runtimeConflicts.join(', ')}`);
    for (const file of runtimeConflicts) {
      gitExec(config.repo_root, ['checkout', '--theirs', '--', file], { stdio: 'ignore' });
      gitExec(config.repo_root, ['add', '--', file], { stdio: 'ignore' });
    }

    const currentStashRef = resolveStashRefBySha(config.repo_root, stashState);
    if (currentStashRef) {
      try {
        gitExec(config.repo_root, ['stash', 'drop', currentStashRef], { stdio: 'ignore' });
      } catch (dropErr) {
        log('WARN', `Runtime-state stash drop failed after conflict cleanup: ${errorMessage(dropErr).split('\n')[0]}`);
      }
    }

    log('DEBUG', 'Resolved runtime-state stash conflicts in favor of the stashed runtime state');
  }
}

export const __gitWorktreeTest = {
  collectRuntimeStateStash,
  isRebaseInProgress,
  restoreRuntimeStateStash,
};

// ─── Git Pull Core ────────────────────────────────────────────────────────────

export function isRuntimeStatePath(relPathName: unknown): boolean {
  const p = normalizeRepoPathForRuntimeCheck(relPathName);
  const swarmIndex = p.indexOf(SWARM_RUNTIME_PATH_SEGMENT);
  if (swarmIndex === -1) return false;

  const swarmPath = p.slice(swarmIndex + SWARM_RUNTIME_PATH_SEGMENT.length);
  return (
    swarmPath.startsWith('logs/') ||
    /^[^/]+-gate-status\.json$/.test(swarmPath) ||
    /^.*summary.*\.(json|md)$/.test(swarmPath) ||
    /^.*project-summary.*$/.test(swarmPath)
  );
}

function tryAutoResolveRebaseForRuntimeState(config: AnyRecord): boolean {
  const conflictOut = gitExec(config.repo_root, ['diff', '--name-only', '--diff-filter=U']);
  const conflicts = conflictOut.split('\n').map(s => s.trim()).filter(Boolean);
  if (conflicts.length === 0) return false;

  const runtimeConflicts = conflicts.filter(isRuntimeStatePath);
  if (runtimeConflicts.length !== conflicts.length) {
    const nonRuntime = conflicts.filter(p => !isRuntimeStatePath(p));
    log('WARN', `Rebase has non-runtime conflicts — manual safety path required: ${nonRuntime.join(', ')}`);
    return false;
  }

  log('WARN', `Auto-resolving ${runtimeConflicts.length} runtime-state rebase conflict(s) in favor of remote/main`);
  for (const file of runtimeConflicts) {
    gitExec(config.repo_root, ['checkout', '--theirs', '--', file], { stdio: 'ignore' });
    gitExec(config.repo_root, ['add', '--', file], { stdio: 'ignore' });
  }

  while (true) {
    try {
      gitExec(config.repo_root, ['rebase', '--continue'], {
        stdio: 'ignore',
        env: buildSubprocessEnv({ GIT_EDITOR: 'true' }),
      });
    } catch (e) {
      const stillRebasing = isRebaseInProgress(config.repo_root);
      if (!stillRebasing) break;

      const nextConflictOut = gitExec(config.repo_root, ['diff', '--name-only', '--diff-filter=U']);
      const nextConflicts = nextConflictOut.split('\n').map(s => s.trim()).filter(Boolean);
      if (nextConflicts.length === 0) throw e;

      const nextRuntime = nextConflicts.filter(isRuntimeStatePath);
      if (nextRuntime.length !== nextConflicts.length) {
        const nonRuntime = nextConflicts.filter(p => !isRuntimeStatePath(p));
        log('WARN', `Rebase advanced into non-runtime conflicts — aborting auto-resolve: ${nonRuntime.join(', ')}`);
        throw e;
      }

      for (const file of nextRuntime) {
        gitExec(config.repo_root, ['checkout', '--theirs', '--', file], { stdio: 'ignore' });
        gitExec(config.repo_root, ['add', '--', file], { stdio: 'ignore' });
      }
    }

    const stillRebasing = isRebaseInProgress(config.repo_root);
    if (!stillRebasing) break;
  }

  invalidateHeadHash(config);
  log('OK', 'Rebase auto-resolved using remote/main runtime state');
  return true;
}

function _gitPullCore(config: AnyRecord) {
  try {
    gitExec(config.repo_root, ['pull', '--rebase', '--quiet'], { stdio: 'ignore' });
    invalidateHeadHash(config);
    log('DEBUG', 'Git pull succeeded');
    return { attempted: true, ok: true };
  } catch (e) {
    const msg = errorMessage(e);
    incrementStat(config, 'git_pull_failures');

    // Check if we're stuck in a rebase
    const isRebasing = isRebaseInProgress(config.repo_root);

    if (isRebasing) {
      log('WARN', 'Git pull left repo in REBASING state');
      try {
        if (tryAutoResolveRebaseForRuntimeState(config)) {
          return { attempted: true, ok: true, recovered: 'runtime_auto_resolve' };
        }

        log('WARN', 'Aborting rebase recovery path');
        gitExec(config.repo_root, ['rebase', '--abort'], { stdio: 'ignore' });

        // Recovery refused: rebase conflict on files outside the runtime-state allowlist.
        // Auto-resolution is only permitted for canonical .swarm runtime artifacts.
        // Non-runtime conflicts (source code, config files) must be resolved manually
        // to prevent silent data loss or incorrect merge results.
        throw new Error(
          `[${FAIL_PATTERNS.GIT_REBASE_CONFLICT}] Git rebase conflict detected before push — auto-resolution refused.\n` +
          `  Reason: Conflicted files are outside the runtime-state allowlist (non-runtime source files cannot be auto-resolved safely).\n` +
          `  Recovery:\n` +
          `    cd ${config.repo_root}\n` +
          `    git rebase --abort\n` +
          `    git pull --rebase origin HEAD\n` +
          `    # Resolve conflicts manually, then:\n` +
          `    git add <resolved-files>\n` +
          `    git rebase --continue\n` +
          `  Then resume the pipeline:\n` +
          `    node pipeline.ts --project ${config.project} --resume`
        );
      } catch (abortErr) {
        log('ERROR', `Rebase recovery failed: ${errorMessage(abortErr).split('\n')[0]}`);
        throw abortErr;
      }
    } else {
      log('DEBUG', `Git pull failed (non-rebase): ${msg.split('\n')[0]}`);
    }

    return { attempted: true, ok: false, reason: msg.split('\n')[0] || 'git_pull_failed' };
  }
}

// ─── Public Git Pull Functions ────────────────────────────────────────────────

/** Pull before push — throws on conflict to protect local commits. */
export function gitPullBeforePush(config: AnyRecord) {
  return _gitPullCore(config);
}

// ─── Push With Retry ─────────────────────────────────────────────────────────

/**
 * Push to origin with retry for transient failures (network timeouts,
 * SSH drops, remote temporarily unavailable).
 * @param {object} config - Pipeline config
 * @param {number} maxRetries - Number of attempts (default: 3)
 * @param {number} delayMs - Delay between retries in ms (default: 5000)
 * @param {object} opts - Optional abort/deadline controls: { budget, signal }
 */
export async function gitPushWithRetry(config: AnyRecord, maxRetries = 3, delayMs = 5000, opts: { budget?: any; signal?: any } = {}) {
  const { budget = null, signal = null } = opts;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      gitExec(config.repo_root, ['push', 'origin', 'HEAD'], { stdio: 'ignore', timeout: 60000 });
      log('OK', `Git push succeeded (attempt ${attempt}/${maxRetries})`);
      return;
    } catch (e) {
      const failCode = classifyGitPushError(errorMessage(e));
      if (attempt === maxRetries) {
        incrementStat(config, 'git_push_failures');
        log('ERROR', `Git push failed after ${maxRetries} attempts [${failCode}]: ${errorMessage(e).split('\n')[0]}`);
        throw e;
      }
      log('WARN', `git push failed (attempt ${attempt}/${maxRetries}) [${failCode}]: ${errorMessage(e).split('\n')[0]}`);
      await sleep(delayMs, { budget, signal });
    }
  }
}

// ─── Commit and Push ──────────────────────────────────────────────────────────

/**
 * Unified git add → commit → pull-before-push → push with retry.
 * Replaces scattered git-sync logic across gitSyncBeforeBuster, releaseBlueprint,
 * and gate-fix. Ensures consistent behavior: invalidateHeadHash always called,
 * push always retried, hash optionally captured.
 *
 * @param {object} config - Pipeline config
 * @param {string} message - Commit message
 * @param {object} opts
 * @param {string[]} opts.addPaths - Paths to git add (default: ['-A'])
 * @param {boolean} opts.captureHash - Return commit hash after push (default: false)
 * @param {boolean} opts.softFail - Log warning instead of throwing on error (default: false)
 * @returns {{ committed: boolean, hash?: string }}
 */
export async function gitCommitAndPush(config: AnyRecord, message: string, { addPaths = ['-A'], captureHash = false, softFail = false, budget = null, signal = null }: GitCommitPushOptions = {}): Promise<{ committed: boolean; hash?: string; error?: string }> {
  try {
    gitExec(config.repo_root, ['add', ...addPaths], { stdio: 'ignore' });

    const staged = gitExec(config.repo_root, ['diff', '--cached', '--name-only']);
    if (!staged) {
      log('INFO', 'No staged changes — nothing to push');
      return { committed: false };
    }

    gitExec(config.repo_root, ['commit', '-m', message], { stdio: 'ignore' });
    invalidateHeadHash(config);

    // Only runtime-state files may be auto-stashed around pull-rebase.
    // Source/config/test files must fail closed so ambiguous local work is never discarded.
    const stashState = collectRuntimeStateStash(config);

    try {
      const pullResult = gitPullBeforePush(config);
      if (pullResult?.ok === false) {
        throw createStructuredGitError(
          config,
          FAIL_PATTERNS.GIT_SYNC_FAILED,
          `[${FAIL_PATTERNS.GIT_SYNC_FAILED}] Git pull-before-push failed.\n` +
            `  Reason: ${pullResult.reason || 'git pull failed'}\n` +
            `  Recovery:\n` +
            `    cd ${config.repo_root}\n` +
            `    git status\n` +
            `    node pipeline.ts --project ${config.project} --resume`,
          {
            reason: 'pull_before_push_failed',
            pull_result: pullResult,
          },
        );
      }
      await gitPushWithRetry(config, 3, 5000, { budget, signal });
    } finally {
      restoreRuntimeStateStash(config, stashState);
    }

    const hash = captureHash ? gitExec(config.repo_root, ['rev-parse', 'HEAD']) : undefined;
    // No invalidateHeadHash here — rev-parse reads HEAD, doesn't change it.
    // The invalidation after commit (above) is sufficient.

    log('OK', `Committed and pushed: ${message.slice(0, 60)}${hash ? ` (${hash.substring(0, 8)})` : ''}`);
    return hash ? { committed: true, hash } : { committed: true };
  } catch (e) {
    if (softFail) {
      log('WARN', `Git commit+push failed (soft): ${errorMessage(e).split('\n')[0]}`);
      return { committed: false, error: errorMessage(e) };
    }
    throw e;
  }
}

// ─── Git Sync Before Buster ───────────────────────────────────────────────────

/**
 * Commit and push all Forge output before handing off to Buster.
 * Records the commit hash and diff stat in the module status object.
 *
 * @param {object} config - Pipeline config
 * @param {string} moduleDir - Module directory name
 * @param {object} status - Module status object (mutated with forge_commit_hash, forge_diff_stat)
 * @returns {{ commitHash: string, lifecycleMutation: object|null }} commit hash and lifecycle mutation evidence
 */
export async function gitSyncBeforeBuster(config: AnyRecord, moduleDir: string, status: AnyRecord, opts: { budget?: any; signal?: any } = {}) {
  const { budget = null, signal = null } = opts;
  log('STEP', 'Git sync: committing and pushing Forge output before Buster');

  try {
    // Commit any uncommitted Forge output + push.
    // If Forge already committed (porcelain empty), gitCommitAndPush returns committed:false.
    // In that case we STILL need to push — Forge may have committed but not pushed.
    const result = await gitCommitAndPush(config,
      `[pipeline] Module ${status.module_id}: Forge output — ready for Buster`,
      { captureHash: true }
    );

    if (!result.committed) {
      // Nothing new to commit, but ensure any existing unpushed commits get pushed
      log('INFO', 'No uncommitted changes (Forge already committed) — pushing existing commits');
      gitPullBeforePush(config);
      await gitPushWithRetry(config, 3, 5000, { budget, signal });
    }

    // Record commit hash (always — whether we committed or Forge did)
    const commitHash = result.hash || gitExec(config.repo_root, ['rev-parse', 'HEAD']);
    const shortHash = commitHash.substring(0, 8);

    status.forge_commit_hash = commitHash;

    // Capture diff stat so the next Forge attempt knows exactly what files
    // were changed if this attempt fails. Cheap (one git command, ~5-20 lines).
    try {
      status.forge_diff_stat = gitExec(config.repo_root, ['diff', '--stat', 'HEAD~1', 'HEAD']);
    } catch (_error) {
      status.forge_diff_stat = null; // first commit or shallow clone
    }

    const gitSyncTransition = transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
      note: `Git sync complete (${shortHash})`,
    });
    log('OK', `Forge commit hash recorded: ${shortHash}`);

    return { commitHash, lifecycleMutation: gitSyncTransition.lifecycleMutation };
  } catch (e) {
    throw new Error(`[${FAIL_PATTERNS.GIT_SYNC_FAILED}] Git sync failed before Buster handoff: ${errorMessage(e)}`);
  }
}
