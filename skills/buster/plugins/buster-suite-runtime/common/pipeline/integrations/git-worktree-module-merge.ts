import { selectTruthyValue } from '../optional-absence.ts';
import { buildSubprocessEnv } from '../security.ts';
import { gitExec, invalidateHeadHash } from '../git-primitives.ts';
import { normalizeScopedGitPaths, resolveDefaultGitAddPaths } from './git-worktree-scope.ts';
import { restoreRuntimeStateStash } from './git-worktree-sync.ts';
import {
  type AnyRecord,
  type GitCommitPushOptions,
  type GitStructuredError,
  type RuntimeStashState,
  FAIL_PATTERNS,
  commandErrorDetail,
  createStructuredGitError,
  discardBranchOwnedModuleRuntimeEntries,
  getConflictedPaths,
  listStashEntries,
  log,
  parseProjectScopedPorcelainEntries,
  partitionRuntimeStateEntries,
  textValue,
  uniqueTextValues,
} from './git-worktree-support.ts';

function collectRuntimeOnlyStash(config: AnyRecord, label: string): RuntimeStashState {
  let entries = parseProjectScopedPorcelainEntries(config);
  if (entries.length === 0) return null;

  discardBranchOwnedModuleRuntimeEntries(config, entries);
  entries = parseProjectScopedPorcelainEntries(config);
  if (entries.length === 0) return null;

  const { runtimeEntries, nonRuntimeEntries } = partitionRuntimeStateEntries(entries);
  if (nonRuntimeEntries.length > 0) {
    throw createStructuredGitError(config, FAIL_PATTERNS.MODULE_JOIN_DIRTY, 'Module join requires a clean non-runtime parent worktree', {
      dirty_paths: nonRuntimeEntries.map((entry) => entry.raw),
    });
  }

  const stashPaths = [...new Set(runtimeEntries.map(entry => entry.path).filter(Boolean))];
  if (stashPaths.length === 0) return null;

  const beforeShas = new Set(listStashEntries(config.repo_root).map(entry => entry.sha));
  gitExec(config.repo_root, ['stash', 'push', '--include-untracked', '-m', label, '--', ...stashPaths], { stdio: 'ignore' });
  const afterEntries = listStashEntries(config.repo_root);
  const stashEntry = selectTruthyValue(() => (afterEntries.find(entry => !beforeShas.has(entry.sha))), () => (null));

  log('DEBUG', `Stashed ${stashPaths.length} runtime-state path(s) before module join`);
  return { stashRef: stashEntry?.ref ?? null, stashSha: stashEntry?.sha ?? null, paths: stashPaths };
}

function moduleCommitMessage(staged: string, message: string, hash: string | null): string {
  const suffix = hash ? ` (${hash.substring(0, 8)})` : '';
  return staged
    ? `Committed module worktree changes: ${message.slice(0, 60)}${suffix}`
    : `No staged module worktree changes — using existing commit${suffix}`;
}

export function commitModuleWorktreeChanges(config: AnyRecord, message: string, { addPaths = [], captureHash = true }: GitCommitPushOptions = {}): AnyRecord {
  const repoRoot = textValue(config?.repo_root);
  if (!repoRoot) throw new Error('commitModuleWorktreeChanges requires config.repo_root');
  const requestedAddPaths = Array.isArray(addPaths) && addPaths.length > 0 ? addPaths : resolveDefaultGitAddPaths(config);
  const broadAddMode = requestedAddPaths.some((entry) => textValue(entry).startsWith('-'));
  const normalizedAddPaths = broadAddMode ? [] : normalizeScopedGitPaths(requestedAddPaths);

  const addArgs = !broadAddMode && normalizedAddPaths.length > 0
    ? ['add', '--', ...normalizedAddPaths]
    : ['add', ...requestedAddPaths];
  gitExec(repoRoot, addArgs, { stdio: 'ignore' });

  const staged = gitExec(repoRoot, ['diff', '--cached', '--name-only']);
  if (staged) {
    gitExec(repoRoot, ['commit', '-m', message], { stdio: 'ignore' });
    invalidateHeadHash(config);
  }

  const hash = captureHash ? gitExec(repoRoot, ['rev-parse', 'HEAD']).trim() : null;
  const branch = gitExec(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  log('OK', moduleCommitMessage(staged, message, hash));
  return { committed: Boolean(staged), hash, branch };
}

function abortFailedMerge(repoRoot: string, startHead: string): void {
  try {
    gitExec(repoRoot, ['merge', '--abort'], { stdio: 'ignore' });
  } catch (_) { /* INTENTIONAL_NONCRITICAL(best_effort_cleanup_failed): the structured merge error remains authoritative. */ }
  if (startHead) gitExec(repoRoot, ['reset', '--hard', startHead], { stdio: 'ignore' });
}

function mergeBranch(
  config: AnyRecord,
  repoRoot: string,
  branch: string,
  startHead: string,
  merged: string[],
): GitStructuredError | null {
  try {
    gitExec(repoRoot, ['merge', '--no-ff', '--no-edit', branch], {
      env: buildSubprocessEnv({ GIT_EDITOR: 'true' }),
    });
    merged.push(branch);
    return null;
  } catch (error) {
    const conflicts = getConflictedPaths(repoRoot);
    const code = conflicts.length > 0 ? FAIL_PATTERNS.MODULE_JOIN_CONFLICT : FAIL_PATTERNS.MODULE_JOIN_FAILED;
    abortFailedMerge(repoRoot, startHead);
    return createStructuredGitError(
      config,
      code,
      code === FAIL_PATTERNS.MODULE_JOIN_CONFLICT
        ? `Module branch merge conflict: ${branch}`
        : `Module branch merge failed: ${branch}`,
      { branch, merged_branches: merged, conflicted_paths: conflicts, cause: commandErrorDetail(error) },
    );
  }
}

function restoreMergeStash(config: AnyRecord, runtimeStash: RuntimeStashState, mergeError: GitStructuredError | null): void {
  try {
    restoreRuntimeStateStash(config, runtimeStash);
  } catch (error) {
    if (!mergeError) throw error;
    log('WARN', `Runtime-state restore failed after module join failure: ${commandErrorDetail(error)}`);
  }
}

export function mergeModuleBranches(config: AnyRecord, input: AnyRecord = {}): AnyRecord {
  const repoRoot = textValue(config?.repo_root);
  if (!repoRoot) throw new Error('mergeModuleBranches requires config.repo_root');
  const branches = uniqueTextValues(Array.isArray(input.branches) ? input.branches : []);
  if (branches.length === 0) return { ok: true, merged_branches: [] };
  const startHead = gitExec(repoRoot, ['rev-parse', 'HEAD']).trim();
  const runtimeStash = collectRuntimeOnlyStash(config, 'pipeline-module-join-runtime-state');
  const merged: string[] = [];
  let mergeError: GitStructuredError | null = null;
  try {
    for (const branch of branches) {
      mergeError = mergeBranch(config, repoRoot, branch, startHead, merged);
      if (mergeError) break;
    }
  } finally {
    restoreMergeStash(config, runtimeStash, mergeError);
  }
  if (mergeError) throw mergeError;
  invalidateHeadHash(config);
  return { ok: true, merged_branches: merged, head: gitExec(repoRoot, ['rev-parse', 'HEAD']).trim(), runtime_stash_paths: runtimeStash?.paths || [] };
}
