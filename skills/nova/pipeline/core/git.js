// core/git.js — Core git helpers safe for core-layer consumers

import { execFileSync } from 'child_process';

export function getRepoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

/**
 * Run a git command safely with array args.
 * @param {string} repoRoot - Path to the git repository
 * @param {string[]} args - Git subcommand and arguments
 * @param {object} opts - Options for execFileSync
 * @returns {string} stdout (trimmed)
 */
export function gitExec(repoRoot, args, opts = {}) {
  const defaults = { encoding: 'utf8', timeout: 30000, maxBuffer: 50 * 1024 * 1024 };
  const result = execFileSync('git', ['-C', repoRoot, ...args], { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}

// ─── Git Hash Cache ───────────────────────────────────────────────────────────
// Avoid spawning `git rev-parse --short HEAD` on every lifecycle/status mutation.
// Invalidated after any git operation that changes HEAD.
// _repoRoot is set by setRepoRoot() which loadConfig calls after resolving repo_root.

let _headHashCache = null;
let _repoRoot = null;

/**
 * Set the repo root for headHash() calls that occur before config is passed explicitly.
 * Must be called by loadConfig after resolving repo_root.
 */
export function setRepoRoot(repoRoot) {
  if (_repoRoot !== repoRoot) _headHashCache = null;
  _repoRoot = repoRoot;
}

export function headHash() {
  if (_headHashCache) return _headHashCache;
  try {
    if (_repoRoot) {
      _headHashCache = gitExec(_repoRoot, ['rev-parse', '--short', 'HEAD']);
      return _headHashCache;
    }
    // Before setRepoRoot is called: return empty string rather than using CWD.
    // This only affects commit_hash in initial PENDING history entries — informational only.
    return '';
  } catch { return ''; }
}

export function invalidateHeadHash() {
  _headHashCache = null;
}
