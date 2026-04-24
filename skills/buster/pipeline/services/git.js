// ═══════════════════════════════════════════════════════════════
// Buster Git Utilities — Shared git operations
// ═══════════════════════════════════════════════════════════════
//
// Reusable git helpers for buster's verify-task.js and buster-pipeline.js.
// All commands use execFileSync (array args, no shell injection).
//
// Timeouts: 30s for most ops, 60s for push, 30s for pull/rebase.
// maxBuffer: 50MB for push/pull (large repos).

import { execFileSync } from 'child_process';

// ─── Repo Root Cache ──────────────────────────────────────────────────────────

let _repoRootCache = new Map();

/**
 * Get the git repo root, cached by start directory.
 * @param {string} [startDir=process.cwd()]
 * @returns {string}
 */
export function getRepoRoot(startDir = process.cwd()) {
  const cacheKey = startDir || process.cwd();
  if (!_repoRootCache.has(cacheKey)) {
    _repoRootCache.set(
      cacheKey,
      execFileSync('git', ['-C', cacheKey, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    );
  }
  return _repoRootCache.get(cacheKey);
}

// ─── gitExec ─────────────────────────────────────────────────────────────────

/**
 * Run a git command safely with array args (no shell injection).
 * @param {string}   repoRoot - Path to the git repository
 * @param {string[]} args     - Git subcommand and arguments
 * @param {object}   [opts]   - Options forwarded to execFileSync
 * @returns {string} stdout (trimmed)
 */
export function gitExec(repoRoot, args, opts = {}) {
  const defaults = { encoding: 'utf8', timeout: 30000, maxBuffer: 50 * 1024 * 1024 };
  const result = execFileSync('git', ['-C', repoRoot, ...args], { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}

// ─── getCurrentBranch ────────────────────────────────────────────────────────

/**
 * Get the current branch name.
 * Handles detached HEAD by falling back to the remote tracking branch.
 * @param {string} repoRoot
 * @returns {string} branch name (never 'HEAD')
 */
export function getCurrentBranch(repoRoot) {
  let currentBranch;
  try {
    currentBranch = gitExec(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    currentBranch = 'HEAD';
  }

  if (!currentBranch || currentBranch === 'HEAD') {
    // Detached HEAD — resolve from remote tracking refs.
    // Exclude origin/HEAD (symbolic ref) to avoid resolving back to 'HEAD'.
    try {
      const refs = gitExec(repoRoot, [
        'for-each-ref', '--format=%(refname:short)',
        '--sort=-committerdate', '--points-at=HEAD', 'refs/remotes/origin/',
      ]);
      const realRef = refs.split('\n').find(r => r && r !== 'origin/HEAD');
      currentBranch = realRef ? realRef.replace('origin/', '') : 'main';
    } catch {
      currentBranch = 'main';
    }
  }

  return currentBranch;
}

// ─── gitSync ─────────────────────────────────────────────────────────────────

/**
 * Sync the repo to a known state: fetch + reset-hard.
 * If expectedHash is provided, resets to that exact commit (deterministic).
 * Otherwise, resets to origin/<currentBranch> (fast-forward).
 *
 * @param {string}      repoRoot
 * @param {string|null} [expectedHash] - Specific commit to reset to, or null
 * @param {object}      [opts]
 * @param {object}      [opts.logger]  - Logger with .info(tag, msg) / .warn(tag, msg)
 * @returns {Promise<string|null>} Actual short hash after sync, or null on failure
 */
export async function gitSync(repoRoot, expectedHash = null, opts = {}) {
  const logger = opts.logger || null;
  const log = (level, msg) => { if (logger) logger[level]?.('GIT', msg); };

  try {
    gitExec(repoRoot, ['fetch', 'origin'], { stdio: 'ignore', timeout: 30000 });
    log('info', 'Fetched from origin');

    if (expectedHash) {
      gitExec(repoRoot, ['reset', '--hard', expectedHash], { stdio: 'ignore' });
      log('info', `Reset to expected hash: ${expectedHash}`);
    } else {
      const branch = getCurrentBranch(repoRoot);
      gitExec(repoRoot, ['reset', '--hard', `origin/${branch}`], { stdio: 'ignore' });
      log('info', `Reset to origin/${branch}`);
    }

    const actualHash = gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']);
    log('info', `Git sync complete: ${actualHash}`);
    return actualHash;
  } catch (e) {
    log('warn', `Git sync failed: ${e.message?.split('\n')[0]}`);
    return null;
  }
}

// ─── gitPushWithRetry ────────────────────────────────────────────────────────

/**
 * Push to origin with rebase-before-push strategy and retry.
 *
 * If opts.commitMessage is provided, performs `git add -A` + `git commit` first.
 * Each attempt: pull --rebase → push. On rebase failure with attempts remaining,
 * aborts and retries. Exponential backoff between attempts.
 *
 * @param {string}  repoRoot
 * @param {string}  branch
 * @param {object}  [opts]
 * @param {number}  [opts.maxAttempts=3]
 * @param {number}  [opts.retryDelayMs=2000]
 * @param {string}  [opts.commitMessage]  - If set, runs add -A + commit before push loop
 * @param {object}  [opts.logger]         - Logger with .warn(tag, msg)
 * @returns {Promise<{ pushed: boolean, hash: string }>}
 */
export async function gitPushWithRetry(repoRoot, branch, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 2000;
  const logger = opts.logger || null;
  const log = (level, msg) => { if (logger) logger[level]?.('GIT', msg); };

  if (opts.commitMessage) {
    gitExec(repoRoot, ['add', '-A'], { stdio: 'ignore' });
    gitExec(repoRoot, ['commit', '-m', opts.commitMessage], { stdio: 'ignore' });
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      gitExec(repoRoot, ['pull', '--rebase', 'origin', branch], { stdio: 'ignore', timeout: 30000 });
    } catch (rebaseErr) {
      log('warn', `Rebase attempt ${attempt}/${maxAttempts}: ${rebaseErr.message?.split('\n')[0]}`);
      try { gitExec(repoRoot, ['rebase', '--abort'], { stdio: 'ignore' }); } catch { /* ok */ }
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * Math.pow(2, attempt - 1)));
        continue;
      }
      // Final attempt: rebase failed, try push anyway
    }

    try {
      gitExec(repoRoot, ['push', 'origin', `HEAD:${branch}`], { stdio: 'ignore', timeout: 60000 });
      const hash = gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']);
      return { pushed: true, hash };
    } catch (e) {
      if (attempt === maxAttempts) throw e;
      log('warn', `Push attempt ${attempt}/${maxAttempts} failed: ${e.message?.split('\n')[0]}`);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * Math.pow(2, attempt - 1)));
    }
  }

  // Unreachable: final attempt either returns or throws
  return { pushed: false, hash: '' };
}
