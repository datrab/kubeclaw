// integrations/git.js — Git operations
// Extracted from pipeline-original.js (module 02)

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { getRunStats } from '../core/runtime.js';
import { addHistory } from '../services/status-store.js';
import { STATUS } from '../core/constants.js';
import { gitExec, headHash, invalidateHeadHash, setRepoRoot } from '../core/git.js';
import { FAIL_PATTERNS, classifyGitPushError } from '../services/failures.js';
import { getTrackedAgentCount } from '../agents/shutdown.js';

export { getRepoRoot, gitExec, headHash, invalidateHeadHash, setRepoRoot } from '../core/git.js';
export { classifyGitPushError } from '../services/failures.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function incrementStat(config, key) {
  const stats = getRunStats(config);
  if (stats && typeof stats[key] === 'number') stats[key]++;
}

function normalizeRepoPathForRuntimeCheck(relPathName) {
  return `/${String(relPathName || '').replace(/^\.?\/?/, '').replace(/\\/g, '/')}`;
}

function parsePorcelainEntries(repoRoot, args = ['status', '--porcelain', '--untracked-files=all']) {
  const output = gitExec(repoRoot, args);
  return output
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => {
      const status = line.slice(0, 2);
      const payload = line.slice(3).trim();
      const filePath = payload.includes(' -> ') ? payload.split(' -> ').pop().trim() : payload;
      return { raw: line, status, path: filePath };
    });
}

function partitionRuntimeStateEntries(entries = []) {
  const runtimeEntries = [];
  const nonRuntimeEntries = [];

  for (const entry of entries) {
    if (isRuntimeStatePath(normalizeRepoPathForRuntimeCheck(entry.path))) runtimeEntries.push(entry);
    else nonRuntimeEntries.push(entry);
  }

  return { runtimeEntries, nonRuntimeEntries };
}

function listStashRefs(repoRoot) {
  try {
    const output = gitExec(repoRoot, ['stash', 'list']);
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.split(':')[0]);
  } catch {
    return [];
  }
}

function getConflictedPaths(repoRoot) {
  try {
    return gitExec(repoRoot, ['diff', '--name-only', '--diff-filter=U'])
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function createStructuredGitError(config, code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.gitSync = {
    code,
    repo_root: config?.repo_root || null,
    project: config?.project || null,
    ...details,
  };
  return error;
}

function collectRuntimeStateStash(config) {
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
        `    node pipeline.js --project ${config.project} --resume`,
      {
        reason: 'non_runtime_dirty_paths',
        unsafe_paths: unsafePaths,
      },
    );
  }

  const stashPaths = [...new Set(runtimeEntries.map(entry => entry.path).filter(Boolean))];
  if (stashPaths.length === 0) return null;

  const beforeRefs = listStashRefs(config.repo_root);
  gitExec(config.repo_root, ['stash', 'push', '--include-untracked', '-m', 'pipeline-pre-push-runtime-state'], { stdio: 'ignore' });
  const afterRefs = listStashRefs(config.repo_root);
  const stashRef = afterRefs.find(ref => !beforeRefs.includes(ref)) || afterRefs[0] || null;

  log('DEBUG', `Stashed ${stashPaths.length} runtime-state path(s) before pull-rebase`);
  return { stashRef, paths: stashPaths };
}

function restoreRuntimeStateStash(config, stashState) {
  if (!stashState?.stashRef && !stashState?.paths?.length) return;

  try {
    const args = stashState.stashRef ? ['stash', 'pop', stashState.stashRef] : ['stash', 'pop'];
    gitExec(config.repo_root, args, { stdio: 'ignore' });
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
          `    node pipeline.js --project ${config.project} --resume`,
        {
          reason: 'stash_pop_non_runtime_conflict',
          conflicted_paths: conflicts,
          stash_ref: stashState.stashRef,
        },
      );
    }

    log('WARN', `Stash pop conflicted on runtime-state files only — restoring HEAD versions for ${runtimeConflicts.join(', ')}`);
    for (const file of runtimeConflicts) {
      gitExec(config.repo_root, ['checkout', '--ours', '--', file], { stdio: 'ignore' });
      gitExec(config.repo_root, ['add', '--', file], { stdio: 'ignore' });
    }

    if (stashState.stashRef) {
      try {
        gitExec(config.repo_root, ['stash', 'drop', stashState.stashRef], { stdio: 'ignore' });
      } catch (dropErr) {
        log('WARN', `Runtime-state stash drop failed after conflict cleanup: ${dropErr.message?.split('\n')[0]}`);
      }
    }

    log('DEBUG', 'Resolved runtime-state stash conflicts in favor of the pulled checkout');
  }
}

function dirtyWorktreeDetails(repoRoot) {
  try {
    const entries = parsePorcelainEntries(repoRoot);
    const { runtimeEntries, nonRuntimeEntries } = partitionRuntimeStateEntries(entries);
    const paths = entries.map(entry => entry.path);
    const unsafePaths = nonRuntimeEntries.map(entry => entry.path);
    return {
      hasUnsafeChanges: unsafePaths.length > 0,
      unsafePaths,
      runtimeOnly: paths.length > 0 && runtimeEntries.length === paths.length,
    };
  } catch {
    return { hasUnsafeChanges: true, unsafePaths: ['git-status-unavailable'], runtimeOnly: false };
  }
}

function hasUnpushedLocalCommits(repoRoot) {
  try {
    const upstream = gitExec(repoRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).trim();
    if (!upstream) return false;
    return Boolean(gitExec(repoRoot, ['rev-list', `${upstream}..HEAD`, '--count']).trim() !== '0');
  } catch {
    return false;
  }
}

function createPollingSafetyError(config, reason, details) {
  const error = new Error(
    `[POLLING_GIT_UNSAFE] Shared-worktree polling pull refused: ${reason}. ${details}`
  );
  error.code = 'POLLING_GIT_UNSAFE';
  error.pollingGit = {
    reason,
    details,
    repo_root: config?.repo_root || null,
    fail_closed: true,
  };
  return error;
}

export function assessPollingPullSafety(config, opts = {}) {
  const trackedAgentCount = opts.trackedAgentCount ?? getTrackedAgentCount();
  if (trackedAgentCount > 0) {
    return {
      safe: true,
      action: 'skip',
      reason: 'active_session',
      details: `tracked_agents=${trackedAgentCount}`,
    };
  }

  const dirtyState = dirtyWorktreeDetails(config.repo_root);
  if (dirtyState.runtimeOnly) {
    return {
      safe: true,
      action: 'skip',
      reason: 'runtime_state_only',
      details: 'only runtime-state files are dirty',
    };
  }
  if (dirtyState.hasUnsafeChanges) {
    return {
      safe: false,
      action: 'fail',
      reason: 'dirty_worktree',
      details: `local modifications or untracked files present: ${dirtyState.unsafePaths.slice(0, 5).join(', ')}`,
    };
  }

  if (hasUnpushedLocalCommits(config.repo_root)) {
    return {
      safe: false,
      action: 'fail',
      reason: 'unpushed_commits',
      details: 'local branch is ahead of upstream',
    };
  }

  return { safe: true, action: 'pull', reason: 'clean', details: 'shared worktree clean' };
}

// ─── Git Pull Core ────────────────────────────────────────────────────────────

export function isRuntimeStatePath(relPathName) {
  const p = String(relPathName || '').replace(/\\/g, '/');
  return (
    p.includes('/.swarm/logs/') ||
    /\/\.swarm\/modules\/[^/]+\/status\.json$/.test(p) ||
    /\/\.swarm\/[^/]+-gate-status\.json$/.test(p) ||
    /\/\.swarm\/.*summary.*\.(json|md)$/.test(p) ||
    /\/\.swarm\/.*project-summary.*$/.test(p)
  );
}

function tryAutoResolveRebaseForRuntimeState(config) {
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
        env: { ...process.env, GIT_EDITOR: 'true' },
      });
    } catch (e) {
      const rebaseDir = path.join(config.repo_root, '.git', 'rebase-merge');
      const rebaseApplyDir = path.join(config.repo_root, '.git', 'rebase-apply');
      const stillRebasing = fs.existsSync(rebaseDir) || fs.existsSync(rebaseApplyDir);
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

    const rebaseDir = path.join(config.repo_root, '.git', 'rebase-merge');
    const rebaseApplyDir = path.join(config.repo_root, '.git', 'rebase-apply');
    const stillRebasing = fs.existsSync(rebaseDir) || fs.existsSync(rebaseApplyDir);
    if (!stillRebasing) break;
  }

  invalidateHeadHash();
  log('OK', 'Rebase auto-resolved using remote/main runtime state');
  return true;
}

function _gitPullCore(config, allowDestructiveRecovery) {
  try {
    gitExec(config.repo_root, ['pull', '--rebase', '--quiet'], { stdio: 'ignore' });
    invalidateHeadHash();
    log('DEBUG', 'Git pull succeeded');
    return { attempted: true, ok: true };
  } catch (e) {
    const msg = e.message || '';
    incrementStat(config, 'git_pull_failures');

    // Check if we're stuck in a rebase
    const rebaseDir = path.join(config.repo_root, '.git', 'rebase-merge');
    const rebaseApplyDir = path.join(config.repo_root, '.git', 'rebase-apply');
    const isRebasing = fs.existsSync(rebaseDir) || fs.existsSync(rebaseApplyDir);

    if (isRebasing) {
      log('WARN', 'Git pull left repo in REBASING state');
      try {
        if (!allowDestructiveRecovery && tryAutoResolveRebaseForRuntimeState(config)) {
          return { attempted: true, ok: true, recovered: 'runtime_auto_resolve' };
        }

        log('WARN', 'Aborting rebase recovery path');
        gitExec(config.repo_root, ['rebase', '--abort'], { stdio: 'ignore' });

        if (allowDestructiveRecovery) {
          const branch = gitExec(config.repo_root, ['branch', '--show-current']).trim();
          if (branch) {
            log('WARN', `Performing destructive reset to origin/${branch} — any unpushed local commits will be lost`);
            gitExec(config.repo_root, ['fetch', 'origin', branch], { stdio: 'ignore' });
            gitExec(config.repo_root, ['reset', '--hard', `origin/${branch}`], { stdio: 'ignore' });
            invalidateHeadHash();
            log('OK', `Rebase aborted — reset to origin/${branch}`);
            return { attempted: true, ok: true, recovered: 'reset_hard' };
          } else {
            log('OK', 'Rebase aborted — detached HEAD, skipping reset');
            return { attempted: true, ok: true, recovered: 'rebase_abort_only' };
          }
        } else {
          // Recovery refused: rebase conflict on files outside the runtime-state allowlist.
          // Auto-resolution is only permitted for .swarm/logs/ and status.json paths.
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
            `    node pipeline.js --project ${config.project} --resume`
          );
        }
      } catch (abortErr) {
        log('ERROR', `Rebase recovery failed: ${abortErr.message?.split('\n')[0]}`);
        if (!allowDestructiveRecovery) throw abortErr;
      }
    } else {
      log('DEBUG', `Git pull failed (non-rebase): ${msg.split('\n')[0]}`);
    }

    return { attempted: true, ok: false, reason: msg.split('\n')[0] || 'git_pull_failed' };
  }
}

// ─── Public Git Pull Functions ────────────────────────────────────────────────

/**
 * Git pull with context-sensitive rebase abort recovery.
 *
 * Two public functions — use the one that matches your context:
 *
 *   gitPullForPolling(config)
 *     During status polling loops in the shared repo worktree. Pull only when
 *     the repo is provably safe (no tracked live sessions, no dirty worktree,
 *     no local-only commits). Unsafe cases fail closed and skip the pull.
 *
 *   gitPullBeforePush(config)
 *     Before git push (Forge→Buster handoff, blueprint release, gate fix).
 *     Local commits exist that must NOT be lost. If rebase conflicts occur,
 *     throw an error instead of resetting. The caller handles the error
 *     (typically: retry the module).
 */

/** Pull during polling loops — fail closed unless the shared worktree is provably clean. */
export function gitPullForPolling(config, opts = {}) {
  const safety = assessPollingPullSafety(config, opts);
  if (safety.action === 'skip') {
    log('INFO', `Skipping polling git pull (${safety.reason}) — ${safety.details}`);
    return { attempted: false, skipped: true, ...safety };
  }
  if (!safety.safe) {
    throw createPollingSafetyError(config, safety.reason, safety.details);
  }

  return _gitPullCore(config, false);
}

/** Pull before push — throws on conflict to protect local commits. */
export function gitPullBeforePush(config) {
  return _gitPullCore(config, false);
}

// ─── Push With Retry ─────────────────────────────────────────────────────────

/**
 * Push to origin with retry for transient failures (network timeouts,
 * SSH drops, remote temporarily unavailable).
 * @param {object} config - Pipeline config
 * @param {number} maxRetries - Number of attempts (default: 3)
 * @param {number} delayMs - Delay between retries in ms (default: 5000)
 */
export async function gitPushWithRetry(config, maxRetries = 3, delayMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      gitExec(config.repo_root, ['push', 'origin', 'HEAD'], { stdio: 'ignore', timeout: 60000 });
      log('OK', `Git push succeeded (attempt ${attempt}/${maxRetries})`);
      return;
    } catch (e) {
      const failCode = classifyGitPushError(e.message);
      if (attempt === maxRetries) {
        incrementStat(config, 'git_push_failures');
        log('ERROR', `Git push failed after ${maxRetries} attempts [${failCode}]: ${e.message?.split('\n')[0]}`);
        throw e;
      }
      log('WARN', `git push failed (attempt ${attempt}/${maxRetries}) [${failCode}]: ${e.message?.split('\n')[0]}`);
      await sleep(delayMs);
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
export async function gitCommitAndPush(config, message, { addPaths = ['-A'], captureHash = false, softFail = false } = {}) {
  try {
    gitExec(config.repo_root, ['add', ...addPaths], { stdio: 'ignore' });

    const staged = gitExec(config.repo_root, ['diff', '--cached', '--name-only']);
    if (!staged) {
      log('INFO', 'No staged changes — nothing to push');
      return { committed: false };
    }

    gitExec(config.repo_root, ['commit', '-m', message], { stdio: 'ignore' });
    invalidateHeadHash();

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
            `    node pipeline.js --project ${config.project} --resume`,
          {
            reason: 'pull_before_push_failed',
            pull_result: pullResult,
          },
        );
      }
      await gitPushWithRetry(config);
    } finally {
      restoreRuntimeStateStash(config, stashState);
    }

    const hash = captureHash ? gitExec(config.repo_root, ['rev-parse', 'HEAD']) : null;
    // No invalidateHeadHash here — rev-parse reads HEAD, doesn't change it.
    // The invalidation after commit (above) is sufficient.

    log('OK', `Committed and pushed: ${message.slice(0, 60)}${hash ? ` (${hash.substring(0, 8)})` : ''}`);
    return { committed: true, hash };
  } catch (e) {
    if (softFail) {
      log('WARN', `Git commit+push failed (soft): ${e.message?.split('\n')[0]}`);
      return { committed: false, error: e.message };
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
 * @returns {string} commit hash
 */
export async function gitSyncBeforeBuster(config, moduleDir, status) {
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
      await gitPushWithRetry(config);
    }

    // Record commit hash (always — whether we committed or Forge did)
    const commitHash = result.hash || gitExec(config.repo_root, ['rev-parse', 'HEAD']);
    const shortHash = commitHash.substring(0, 8);

    status.forge_commit_hash = commitHash;

    // Capture diff stat so the next Forge attempt knows exactly what files
    // were changed if this attempt fails. Cheap (one git command, ~5-20 lines).
    try {
      status.forge_diff_stat = gitExec(config.repo_root, ['diff', '--stat', 'HEAD~1', 'HEAD']);
    } catch {
      status.forge_diff_stat = null; // first commit or shallow clone
    }

    addHistory(status, STATUS.READY_FOR_TESTING, 'pipeline', `Git sync complete (${shortHash})`);
    log('OK', `Forge commit hash recorded: ${shortHash}`);

    return commitHash;
  } catch (e) {
    throw new Error(`[${FAIL_PATTERNS.GIT_SYNC_FAILED}] Git sync failed before Buster handoff: ${e.message}`);
  }
}
