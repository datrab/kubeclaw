import fs from 'fs';
import path from 'path';
import { selectTruthyValue } from '../optional-absence.ts';
import { buildSubprocessEnv } from '../security.ts';
import { gitExec, invalidateHeadHash } from '../git-primitives.ts';
import { isRuntimeStatePath } from '../runtime-state-paths.ts';
import {
  filterProjectScopedPaths,
  normalizeRepoRelativePath,
  normalizeScopedGitPaths,
  pathMatchesScopedPathspec,
  resolveDefaultGitAddPaths,
} from './git-worktree-scope.ts';
import {
  type AnyRecord,
  type PreservationStashState,
  type RuntimeStashState,
  FAIL_PATTERNS,
  GIT_PULL_FAILED_DETAIL,
  GIT_PULL_FAILED_REASON,
  commandErrorDetail,
  continueRebaseFavoringLocal,
  createStructuredGitError,
  dropRuntimeStash,
  errorMessage,
  getConflictedPaths,
  incrementStat,
  isRebaseInProgress,
  listStashEntries,
  log,
  parseOutOfScopePorcelainEntries,
  parseProjectScopedPorcelainEntries,
  resolveStashRefBySha,
  selectPresentValue,
} from './git-worktree-support.ts';

export function collectRuntimeStateStash(config: AnyRecord): RuntimeStashState {
  const entries = parseProjectScopedPorcelainEntries(config);
  if (entries.length === 0) return null;

  const stashPaths = [...new Set(entries.map(entry => entry.path).filter(Boolean))];
  if (stashPaths.length === 0) return null;

  const beforeShas = new Set(listStashEntries(config.repo_root).map(entry => entry.sha));
  gitExec(config.repo_root, ['stash', 'push', '--include-untracked', '-m', 'pipeline-pre-push-project-worktree', '--', ...stashPaths], { stdio: 'ignore' });
  const afterEntries = listStashEntries(config.repo_root);
  const stashEntry = selectTruthyValue(() => (afterEntries.find(entry => !beforeShas.has(entry.sha))), () => (null));

  log('DEBUG', `Stashed ${stashPaths.length} project worktree path(s) before pull-rebase`);
  return { stashRef: stashEntry?.ref ?? null, stashSha: stashEntry?.sha ?? null, paths: stashPaths };
}

export function collectOutOfScopeWorktreeStash(config: AnyRecord): PreservationStashState {
  const entries = parseOutOfScopePorcelainEntries(config);
  const stashPaths = [...new Set(entries.map(entry => entry.path).filter(Boolean))];
  if (stashPaths.length === 0) return null;

  const beforeShas = new Set(listStashEntries(config.repo_root).map(entry => entry.sha));
  gitExec(config.repo_root, ['stash', 'push', '--include-untracked', '-m', 'pipeline-preserve-out-of-scope-worktree', '--', ...stashPaths], { stdio: 'ignore' });
  const afterEntries = listStashEntries(config.repo_root);
  const stashEntry = selectTruthyValue(() => (afterEntries.find(entry => !beforeShas.has(entry.sha))), () => (null));

  log('DEBUG', `Stashed ${stashPaths.length} out-of-scope worktree path(s) before pull-rebase fallback`);
  return { stashRef: stashEntry?.ref ?? null, stashSha: stashEntry?.sha ?? null, paths: stashPaths };
}

export function restoreOutOfScopeWorktreeStash(config: AnyRecord, stashState: PreservationStashState) {
  if (!stashState?.stashRef && !stashState?.paths?.length) return;

  const stashRef = resolveStashRefBySha(config.repo_root, stashState);
  if (!stashRef) {
    log('WARN', 'Out-of-scope worktree stash entry was not found during restore');
    return;
  }

  try {
    gitExec(config.repo_root, ['stash', 'pop', stashRef], { stdio: 'ignore' });
    log('DEBUG', 'Restored stashed out-of-scope worktree after push');
  } catch (popErr) {
    log('WARN', `Out-of-scope worktree stash restore failed; preserving stash for manual recovery: ${errorMessage(popErr).split('\n')[0]}`);
    try {
      gitExec(config.repo_root, ['reset', '--merge'], { stdio: 'ignore' });
    } catch (resetErr) {
      log('WARN', `Out-of-scope stash cleanup reset failed: ${errorMessage(resetErr).split('\n')[0]}`);
    }
  }
}

function stashedPathsAlreadyRestored(config: AnyRecord, stashState: RuntimeStashState): boolean {
  const entries = parseProjectScopedPorcelainEntries(config);
  return normalizeScopedGitPaths(stashState?.paths).every((file) => (
    entries.some((entry) => normalizeRepoRelativePath(entry.path) === file)
      || fs.existsSync(path.join(config.repo_root, file))
  ));
}

function unexpectedStashConflictError(
  config: AnyRecord,
  stashState: RuntimeStashState,
  stashRef: string,
  conflicts: string[],
) {
  const stashedPaths = normalizeScopedGitPaths(stashState?.paths);
  const unexpected = conflicts.filter((file) => !pathMatchesScopedPathspec(file, stashedPaths));
  if (unexpected.length === 0) return null;
  return createStructuredGitError(
    config,
    FAIL_PATTERNS.GIT_REBASE_CONFLICT,
    `[${FAIL_PATTERNS.GIT_REBASE_CONFLICT}] Restoring stashed local project changes produced unexpected conflicts: ${unexpected.slice(0, 10).join(', ')}`,
    { reason: 'stash_pop_non_runtime_conflict', conflicted_paths: conflicts, stash_ref: stashRef, stash_sha: stashState?.stashSha ?? null },
  );
}

function restoreStashedConflictFiles(config: AnyRecord, stashState: RuntimeStashState, conflicts: string[]): void {
  const stashedPaths = normalizeScopedGitPaths(stashState?.paths);
  const error = unexpectedStashConflictError(config, stashState, String(stashState?.stashRef), conflicts);
  if (error) throw error;
  const restorable = conflicts.filter((file) => pathMatchesScopedPathspec(file, stashedPaths));
  log('WARN', `Restoring stashed versions for ${restorable.join(', ')}`);
  for (const file of restorable) {
    gitExec(config.repo_root, ['checkout', '--theirs', '--', file], { stdio: 'ignore' });
    gitExec(config.repo_root, ['add', '--', file], { stdio: 'ignore' });
  }
  dropRuntimeStash(config.repo_root, stashState);
}

export function restoreRuntimeStateStash(
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

  const normalizedAllowedConflictPaths = normalizeScopedGitPaths(opts.allowedConflictPaths);
  try {
    gitExec(config.repo_root, ['stash', 'pop', stashRef], { stdio: 'ignore' });
    log('DEBUG', 'Restored stashed project worktree after push');
    return;
  } catch (popErr) {
    const conflicts = filterProjectScopedPaths(config, getConflictedPaths(config.repo_root));
    if (conflicts.length === 0) {
      if (stashedPathsAlreadyRestored(config, stashState)) {
        log('WARN', 'Project worktree stash restore reported a non-conflict failure, but the stashed paths are already present locally — treating restore as satisfied');
        dropRuntimeStash(config.repo_root, stashState);
        return;
      }
      throw popErr;
    }

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

    restoreStashedConflictFiles(config, { ...stashState, stashRef }, conflicts);
    log('DEBUG', 'Resolved project worktree stash conflicts in favor of the stashed local state');
  }
}

export const __gitWorktreeTest = {
  collectRuntimeStateStash,
  isRebaseInProgress,
  restoreRuntimeStateStash,
};

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

  const conflicts = getConflictedPaths(config.repo_root).map(normalizeRepoRelativePath).filter(Boolean);
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

export function _gitPullCore(config: AnyRecord, opts: { allowedConflictPaths?: string[] } = {}) {
  try {
    gitExec(config.repo_root, ['pull', '--rebase', '--quiet'], { stdio: 'ignore' });
    invalidateHeadHash(config);
    log('DEBUG', 'Git pull succeeded');
    return { attempted: true, ok: true };
  } catch (e) {
    const msg = errorMessage(e);
    incrementStat(config, 'git_pull_failures');
    const activeConflicts = getConflictedPaths(config.repo_root);
    const isRebasing = selectTruthyValue(() => (selectTruthyValue(() => (isRebaseInProgress(config.repo_root)), () => (activeConflicts.length > 0))), () => (/\bCONFLICT\b|could not apply/i.test(msg)));

    if (isRebasing) {
      log('WARN', 'Git pull left repo in REBASING state');
      if (tryAutoResolveRebaseForScopedPaths(config, opts.allowedConflictPaths)) {
        return { attempted: true, ok: true, recovered: 'scoped_local_auto_resolve' };
      }
      if (tryAutoResolveRebaseForRuntimeState(config)) {
        return { attempted: true, ok: true, recovered: 'runtime_auto_resolve' };
      }

      log('WARN', 'Aborting rebase recovery path');
      try {
        gitExec(config.repo_root, ['rebase', '--abort'], { stdio: 'ignore' });
      } catch (abortErr) {
        log('ERROR', `Rebase abort cleanup failed after conflict classification: ${errorMessage(abortErr).split('\n')[0]}`);
      }
      throw new Error(
        `[${FAIL_PATTERNS.GIT_REBASE_CONFLICT}] Git rebase conflict detected before push — auto-resolution refused.\n` +
        `  Reason: Conflicted files are outside the publication or runtime-state allowlist (unowned source conflicts cannot be auto-resolved safely).\n` +
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
    } else {
      log('DEBUG', `Git pull failed (non-rebase): ${msg.split('\n')[0]}`);
    }

    return { attempted: true, ok: false, reason: selectPresentValue(msg.split('\n')[0], GIT_PULL_FAILED_REASON) };
  }
}

export function gitPullBeforePush(config: AnyRecord) {
  const projectStash = collectRuntimeStateStash(config);
  const outOfScopeStash = collectOutOfScopeWorktreeStash(config);
  try {
    const pullResult = _gitPullCore(config, {
      allowedConflictPaths: normalizeScopedGitPaths(filterProjectScopedPaths(config, resolveDefaultGitAddPaths(config))),
    });
    if (pullResult?.ok === false) {
      throw createStructuredGitError(
        config,
        FAIL_PATTERNS.GIT_SYNC_FAILED,
        `[${FAIL_PATTERNS.GIT_SYNC_FAILED}] Git pull-before-push failed.\n` +
          `  Reason: ${selectPresentValue(pullResult.reason, GIT_PULL_FAILED_DETAIL)}\n` +
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
    return pullResult;
  } finally {
    restoreOutOfScopeWorktreeStash(config, outOfScopeStash);
    restoreRuntimeStateStash(config, projectStash, {
      allowedConflictPaths: normalizeScopedGitPaths(filterProjectScopedPaths(config, resolveDefaultGitAddPaths(config))),
    });
  }
}
