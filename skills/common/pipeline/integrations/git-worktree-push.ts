import { sleep } from '../timing.ts';
import { gitExec, invalidateHeadHash } from '../git-primitives.ts';
import { normalizeScopedGitPaths, resolveDefaultGitAddPaths } from './git-worktree-scope.ts';
import {
  _gitPullCore,
  collectOutOfScopeWorktreeStash,
  collectRuntimeStateStash,
  restoreOutOfScopeWorktreeStash,
  restoreRuntimeStateStash,
} from './git-worktree-sync.ts';
import {
  type AnyRecord,
  type GitCommitPushOptions,
  type PreservationStashState,
  FAIL_PATTERNS,
  GIT_PULL_FAILED_DETAIL,
  classifyGitPushError,
  createStructuredGitError,
  errorMessage,
  incrementStat,
  log,
  parseOutOfScopePorcelainEntries,
  requireNumber,
  selectPresentValue,
  textValue,
} from './git-worktree-support.ts';

function gitPushPolicy(config: AnyRecord): { maxRetries: number; delayMs: number; timeoutMs: number } {
  const push = config?.git?.push;
  if (!push || typeof push !== 'object' || Array.isArray(push)) {
    throw new Error('config.git: required platform config object for git push retry policy');
  }
  const maxRetries = requireNumber(push, 'max_attempts', 'config.git.push', { positive: true, integer: true });
  const delayMs = requireNumber(push, 'retry_delay_ms', 'config.git.push');
  const timeoutMs = requireNumber(push, 'timeout_ms', 'config.git.push', { positive: true, integer: true });
  return { maxRetries, delayMs, timeoutMs };
}

export async function gitPushWithRetry(config: AnyRecord, opts: { budget?: any; signal?: any; maxRetries?: number; delayMs?: number; timeoutMs?: number } = {}) {
  const policy = gitPushPolicy(config);
  const maxRetries = opts.maxRetries !== undefined ? opts.maxRetries : policy.maxRetries;
  const delayMs = opts.delayMs !== undefined ? opts.delayMs : policy.delayMs;
  const timeoutMs = opts.timeoutMs !== undefined ? opts.timeoutMs : policy.timeoutMs;
  const { budget = null, signal = null } = opts;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      gitExec(config.repo_root, ['push', 'origin', 'HEAD'], { timeout: timeoutMs });
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

function stagePublication(config: AnyRecord, addPaths: string[], conflictPaths: string[]): string[] | null {
  const requested = addPaths.length > 0 ? addPaths : resolveDefaultGitAddPaths(config);
  const broad = requested.some((entry) => textValue(entry).startsWith('-'));
  const normalized = broad ? [] : normalizeScopedGitPaths(requested);
  const addArgs = !broad && normalized.length > 0 ? ['add', '--', ...normalized] : ['add', ...requested];
  gitExec(config.repo_root, addArgs, { stdio: 'ignore' });
  const staged = gitExec(config.repo_root, ['diff', '--cached', '--name-only']);
  return staged ? normalizeScopedGitPaths([...staged.split('\n'), ...conflictPaths]) : null;
}

async function tryDirectPush(config: AnyRecord, budget: any, signal: any): Promise<AnyRecord> {
  if (parseOutOfScopePorcelainEntries(config).length === 0) return { pushed: false, stash: null };
  log('INFO', 'Out-of-scope local changes detected — attempting direct push');
  try {
    await gitPushWithRetry(config, { maxRetries: 1, delayMs: 0, budget, signal });
    return { pushed: true, stash: null };
  } catch (error) {
    log('WARN', `Direct push failed; stashing out-of-scope changes: ${errorMessage(error).split('\n')[0]}`);
    return { pushed: false, stash: collectOutOfScopeWorktreeStash(config) };
  }
}

function assertPullSucceeded(config: AnyRecord, publicationPaths: string[]): void {
  const result = _gitPullCore(config, { allowedConflictPaths: publicationPaths });
  if (result?.ok !== false) return;
  throw createStructuredGitError(
    config,
    FAIL_PATTERNS.GIT_SYNC_FAILED,
    `[${FAIL_PATTERNS.GIT_SYNC_FAILED}] Git pull-before-push failed. Reason: ${selectPresentValue(result.reason, GIT_PULL_FAILED_DETAIL)}`,
    { reason: 'pull_before_push_failed', pull_result: result },
  );
}

async function publishCommittedChanges(
  config: AnyRecord,
  publicationPaths: string[],
  budget: any,
  signal: any,
): Promise<void> {
  const runtimeStash = collectRuntimeStateStash(config);
  let outOfScopeStash: PreservationStashState = null;
  try {
    const direct = await tryDirectPush(config, budget, signal);
    outOfScopeStash = direct.stash;
    if (!direct.pushed) {
      assertPullSucceeded(config, publicationPaths);
      await gitPushWithRetry(config, { budget, signal });
    }
  } finally {
    restoreOutOfScopeWorktreeStash(config, outOfScopeStash);
    restoreRuntimeStateStash(config, runtimeStash, { allowedConflictPaths: publicationPaths });
  }
}

async function commitAndPublish(
  config: AnyRecord,
  message: string,
  options: GitCommitPushOptions,
): Promise<{ committed: boolean; hash?: string }> {
  const publicationPaths = stagePublication(config, options.addPaths ?? [], options.conflictPaths ?? []);
  if (!publicationPaths) {
    log('INFO', 'No staged changes — nothing to push');
    return { committed: false };
  }
  gitExec(config.repo_root, ['commit', '-m', message]);
  invalidateHeadHash(config);
  await publishCommittedChanges(config, publicationPaths, options.budget ?? null, options.signal ?? null);
  const hash = options.captureHash ? gitExec(config.repo_root, ['rev-parse', 'HEAD']) : undefined;
  log('OK', `Committed and pushed: ${message.slice(0, 60)}${hash ? ` (${hash.substring(0, 8)})` : ''}`);
  return hash ? { committed: true, hash } : { committed: true };
}

export async function gitCommitAndPush(config: AnyRecord, message: string, options: GitCommitPushOptions = {}): Promise<{ committed: boolean; hash?: string; error?: string }> {
  try {
    return await commitAndPublish(config, message, options);
  } catch (error) {
    if (options.softFail) {
      log('WARN', `Git commit+push failed (soft): ${errorMessage(error).split('\n')[0]}`);
      return { committed: false, error: errorMessage(error) };
    }
    throw error;
  }
}
