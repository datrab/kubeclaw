// integrations/git-worktree.ts — Shared pipeline Git worktree policy

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { log } from '../../../nova/pipeline/core/logger.ts';
import { getRunStats } from '../../../nova/pipeline/core/runtime.ts';
import { getRepoRoot, gitExec, headHash, invalidateHeadHash, setRepoRoot } from '../git-primitives.ts';
import { FAIL_PATTERNS, classifyGitPushError } from '../../../nova/pipeline/services/failures/classification.ts';
import { sleep } from '../timing.ts';
import { buildSubprocessEnv } from '../security.ts';

type AnyRecord = Record<string, any>;
type PorcelainEntry = { raw: string; status: string; path: string };
type StashEntry = { ref: string; sha: string; subject: string };
type GitStructuredError = Error & { code?: string; gitSync?: AnyRecord; pollingGit?: AnyRecord };
type RuntimeStashState = { stashRef: string | null; stashSha?: string | null; paths: string[] } | null;
type GitCommitPushOptions = { addPaths?: string[]; conflictPaths?: string[]; captureHash?: boolean; softFail?: boolean; budget?: any; signal?: any };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { getRepoRoot, gitExec, headHash, invalidateHeadHash, setRepoRoot } from '../git-primitives.ts';
export { classifyGitPushError } from '../../../nova/pipeline/services/failures/classification.ts';

function incrementStat(config: AnyRecord, key: string) {
  const stats = getRunStats(config);
  if (stats && typeof stats[key] === 'number') stats[key]++;
}

const SWARM_RUNTIME_ROOT_SEGMENT = '.swarm';
const SWARM_RUNTIME_PATH_SEGMENT = `/${SWARM_RUNTIME_ROOT_SEGMENT}/`;

function projectScopePathspec(config: AnyRecord): string {
  const repoRoot = typeof config?.repo_root === 'string' ? config.repo_root : '';
  const swarmDir = typeof config?.paths?.swarm_dir === 'string' ? config.paths.swarm_dir : '';
  if (!repoRoot || !swarmDir) return '';
  return normalizeRepoRelativePath(path.relative(repoRoot, path.dirname(swarmDir)));
}

function isPathWithinProjectScope(config: AnyRecord, relPathName: unknown): boolean {
  const normalizedPath = normalizeRepoRelativePath(relPathName);
  if (!normalizedPath) return false;
  const scopePathspec = projectScopePathspec(config);
  if (!scopePathspec) return true;
  return normalizedPath === scopePathspec || normalizedPath.startsWith(`${scopePathspec}/`);
}

function projectScopedStatusArgs(config: AnyRecord): string[] {
  const scopePathspec = projectScopePathspec(config);
  const args = ['status', '--porcelain', '--untracked-files=all'];
  if (scopePathspec) args.push('--', scopePathspec);
  return args;
}

function filterProjectScopedPaths(config: AnyRecord, paths: string[] = []): string[] {
  return paths
    .map(normalizeRepoRelativePath)
    .filter((filePath) => filePath && isPathWithinProjectScope(config, filePath));
}

function resolveDefaultGitAddPaths(config: AnyRecord): string[] {
  const scopePathspec = projectScopePathspec(config);
  return scopePathspec ? [scopePathspec] : ['-A'];
}

function normalizeRepoPathForRuntimeCheck(relPathName: unknown): string {
  const normalized = String(relPathName || '')
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '');
  return `/${normalized}`;
}

function normalizeRepoRelativePath(relPathName: unknown): string {
  return String(relPathName || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^(?:\.\/)+/, '')
    .trim();
}

function normalizeScopedGitPaths(paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  return [...new Set(paths.map(normalizeRepoRelativePath).filter(Boolean))];
}

function pathMatchesScopedPathspec(repoRelativePath: string, pathspecs: string[] = []): boolean {
  const normalizedPath = normalizeRepoRelativePath(repoRelativePath);
  if (!normalizedPath) return false;
  return pathspecs.some((pathspec) => normalizedPath === pathspec || normalizedPath.startsWith(`${pathspec}/`));
}

function continueRebaseFavoringLocal(config: AnyRecord, allowedConflicts: string[], label: string): boolean {
  while (true) {
    const conflicts = getConflictedPaths(config.repo_root).map(normalizeRepoRelativePath).filter(Boolean);
    if (conflicts.length === 0) break;

    if (conflicts.some((file) => !pathMatchesScopedPathspec(file, allowedConflicts))) {
      log('WARN', `${label} encountered conflicts outside the scoped allowlist`);
      return false;
    }

    for (const file of conflicts) {
      gitExec(config.repo_root, ['checkout', '--theirs', '--', file], { stdio: 'ignore' });
      gitExec(config.repo_root, ['add', '--', file], { stdio: 'ignore' });
    }

    try {
      gitExec(config.repo_root, ['rebase', '--continue'], {
        stdio: 'ignore',
        env: buildSubprocessEnv({ GIT_EDITOR: 'true' }),
      });
    } catch (error) {
      if (!isRebaseInProgress(config.repo_root)) break;
      const stillConflicted = getConflictedPaths(config.repo_root).map(normalizeRepoRelativePath).filter(Boolean);
      if (stillConflicted.length === 0) throw error;
      if (stillConflicted.some((file) => !pathMatchesScopedPathspec(file, allowedConflicts))) {
        log('WARN', `${label} advanced into conflicts outside the scoped allowlist`);
        return false;
      }
    }

    if (!isRebaseInProgress(config.repo_root)) break;
  }

  invalidateHeadHash(config);
  return true;
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

function parseProjectScopedPorcelainEntries(config: AnyRecord): PorcelainEntry[] {
  return parsePorcelainEntries(config.repo_root, projectScopedStatusArgs(config));
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
  const entries = parseProjectScopedPorcelainEntries(config);
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
  gitExec(config.repo_root, ['stash', 'push', '--include-untracked', '-m', 'pipeline-pre-push-runtime-state', '--', ...stashPaths], { stdio: 'ignore' });
  const afterEntries = listStashEntries(config.repo_root);
  const stashEntry = afterEntries.find(entry => !beforeShas.has(entry.sha)) || null;

  log('DEBUG', `Stashed ${stashPaths.length} runtime-state path(s) before pull-rebase`);
  return { stashRef: stashEntry?.ref || null, stashSha: stashEntry?.sha || null, paths: stashPaths };
}

function restoreRuntimeStateStash(
  config: AnyRecord,
  stashState: RuntimeStashState,
  opts: { allowedConflictPaths?: string[]; allowDeferredScopedResolve?: boolean } = {},
) {
  if (!stashState?.stashRef && !stashState?.paths?.length) return;

  const stashRef = resolveStashRefBySha(config.repo_root, stashState);
  if (!stashRef) {
    log('WARN', 'Runtime-state stash entry was not found during restore');
    return;
  }

  const normalizedAllowedConflictPaths = normalizeScopedGitPaths(opts.allowedConflictPaths || []);
  try {
    gitExec(config.repo_root, ['stash', 'pop', stashRef], { stdio: 'ignore' });
    log('DEBUG', 'Restored stashed runtime-state worktree after push');
    return;
  } catch (popErr) {
    const conflicts = filterProjectScopedPaths(config, getConflictedPaths(config.repo_root));
    if (conflicts.length === 0) throw popErr;

    if (
      opts.allowDeferredScopedResolve !== false
      && normalizedAllowedConflictPaths.length > 0
      && conflicts.every((file) => pathMatchesScopedPathspec(file, normalizedAllowedConflictPaths))
      && continueRebaseFavoringLocal(config, normalizedAllowedConflictPaths, 'Deferred scoped rebase auto-resolve')
    ) {
      log('WARN', 'Scoped rebase conflict surfaced during runtime-state restore — retrying stash restore after local conflict resolution');
      return restoreRuntimeStateStash(config, stashState, {
        allowedConflictPaths: normalizedAllowedConflictPaths,
        allowDeferredScopedResolve: false,
      });
    }

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

export function isRuntimeStatePath(relPathName: unknown): boolean {
  const p = normalizeRepoPathForRuntimeCheck(relPathName);
  const swarmIndex = p.indexOf(SWARM_RUNTIME_PATH_SEGMENT);
  if (swarmIndex === -1) return false;

  const swarmPath = p.slice(swarmIndex + SWARM_RUNTIME_PATH_SEGMENT.length);
  return (
    swarmPath.startsWith('logs/') ||
    swarmPath === 'progress.json' ||
    /^modules\/[^/]+\/(?:forge|buster|review|gate)-completion\.json$/.test(swarmPath) ||
    /^modules\/[^/]+\/(?:forge|buster|review|gate)-prompt(?:-metadata)?\.json$/.test(swarmPath) ||
    /^modules\/[^/]+\/(?:forge|buster|review)-transcript-attempt-\d+\.jsonl$/.test(swarmPath) ||
    /^modules\/[^/]+\/(?:forge|buster|review)-output(?:\.[^/]+)?$/.test(swarmPath) ||
    /^modules\/[^/]+\/(?:runtime|state|status|summary).*\.(json|jsonl|md)$/.test(swarmPath) ||
    /^[^/]+-gate-status\.json$/.test(swarmPath) ||
    /^.*summary.*\.(json|md)$/.test(swarmPath) ||
    /^.*project-summary.*$/.test(swarmPath)
  );
}

function tryAutoResolveRebaseForRuntimeState(config: AnyRecord): boolean {
  const conflicts = filterProjectScopedPaths(
    config,
    gitExec(config.repo_root, ['diff', '--name-only', '--diff-filter=U']).split('\n').map(s => s.trim()).filter(Boolean),
  );
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

function tryAutoResolveRebaseForScopedPaths(config: AnyRecord, allowedPaths: string[] = []): boolean {
  const normalizedAllowedPaths = normalizeScopedGitPaths(allowedPaths);
  if (normalizedAllowedPaths.length === 0) return false;

  const conflicts = filterProjectScopedPaths(config, getConflictedPaths(config.repo_root));
  if (conflicts.length === 0) return false;
  if (conflicts.some((file) => !pathMatchesScopedPathspec(file, normalizedAllowedPaths))) {
    const nonScoped = conflicts.filter((file) => !pathMatchesScopedPathspec(file, normalizedAllowedPaths));
    log('WARN', `Scoped rebase has out-of-scope conflicts — refusing auto-resolve: ${nonScoped.join(', ')}`);
    return false;
  }

  log('WARN', `Auto-resolving ${conflicts.length} scoped rebase conflict(s) in favor of the local handoff snapshot`);
  const resolved = continueRebaseFavoringLocal(config, normalizedAllowedPaths, 'Scoped rebase auto-resolve');
  if (!resolved) return false;
  log('OK', 'Scoped rebase auto-resolved using local handoff content');
  return true;
}

function _gitPullCore(config: AnyRecord, opts: { allowedConflictPaths?: string[] } = {}) {
  try {
    gitExec(config.repo_root, ['pull', '--rebase', '--quiet'], { stdio: 'ignore' });
    invalidateHeadHash(config);
    log('DEBUG', 'Git pull succeeded');
    return { attempted: true, ok: true };
  } catch (e) {
    const msg = errorMessage(e);
    incrementStat(config, 'git_pull_failures');
    const activeConflicts = getConflictedPaths(config.repo_root);
    const isRebasing = isRebaseInProgress(config.repo_root)
      || activeConflicts.length > 0
      || /\bCONFLICT\b|could not apply|rebase/i.test(msg);

    if (isRebasing) {
      log('WARN', 'Git pull left repo in REBASING state');
      try {
        if (tryAutoResolveRebaseForScopedPaths(config, opts.allowedConflictPaths || [])) {
          return { attempted: true, ok: true, recovered: 'scoped_local_auto_resolve' };
        }
        if (tryAutoResolveRebaseForRuntimeState(config)) {
          return { attempted: true, ok: true, recovered: 'runtime_auto_resolve' };
        }

        log('WARN', 'Aborting rebase recovery path');
        gitExec(config.repo_root, ['rebase', '--abort'], { stdio: 'ignore' });
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

export function gitPullBeforePush(config: AnyRecord) {
  return _gitPullCore(config);
}

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

export async function gitCommitAndPush(config: AnyRecord, message: string, { addPaths = [], conflictPaths = [], captureHash = false, softFail = false, budget = null, signal = null }: GitCommitPushOptions = {}): Promise<{ committed: boolean; hash?: string; error?: string }> {
  try {
    const requestedAddPaths = Array.isArray(addPaths) && addPaths.length > 0 ? addPaths : resolveDefaultGitAddPaths(config);
    const broadAddMode = requestedAddPaths.some((entry) => String(entry || '').startsWith('-'));
    const normalizedAddPaths = broadAddMode ? [] : normalizeScopedGitPaths(requestedAddPaths);
    if (!broadAddMode && normalizedAddPaths.length > 0) {
      gitExec(config.repo_root, ['add', '--', ...normalizedAddPaths], { stdio: 'ignore' });
    } else {
      gitExec(config.repo_root, ['add', ...requestedAddPaths], { stdio: 'ignore' });
    }

    const staged = gitExec(config.repo_root, ['diff', '--cached', '--name-only']);
    if (!staged) {
      log('INFO', 'No staged changes — nothing to push');
      return { committed: false };
    }

    gitExec(config.repo_root, ['commit', '-m', message], { stdio: 'ignore' });
    invalidateHeadHash(config);

    const stashState = collectRuntimeStateStash(config);

    try {
      const pullResult = _gitPullCore(config, { allowedConflictPaths: normalizeScopedGitPaths(conflictPaths) });
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
      restoreRuntimeStateStash(config, stashState, {
        allowedConflictPaths: normalizeScopedGitPaths(conflictPaths),
      });
    }

    const hash = captureHash ? gitExec(config.repo_root, ['rev-parse', 'HEAD']) : undefined;
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
