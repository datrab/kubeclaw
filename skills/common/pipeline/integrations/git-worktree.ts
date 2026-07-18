import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// integrations/git-worktree.ts — Shared pipeline Git worktree policy

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { getRepoRoot, gitExec, headHash, invalidateHeadHash, setGitRuntimePolicy, setRepoRoot } from '../git-primitives.ts';
import { sleep } from '../timing.ts';
import { buildSubprocessEnv } from '../security.ts';
import { isRuntimeStatePath } from '../runtime-state-paths.ts';
export { isRuntimeStatePath } from '../runtime-state-paths.ts';
export { allocateModuleWorktree, freezeParallelGitBase } from './module-worktree-allocation.ts';
export { cleanupModuleWorktree, verifyModuleWorktreeClean } from './module-worktree-maintenance.ts';
import { MODULE_WORKTREE_DIRTY } from './module-worktree-maintenance.ts';
import {
  filterProjectScopedPaths,
  isPathWithinProjectScope,
  normalizeRepoRelativePath,
  normalizeScopedGitPaths,
  pathMatchesScopedPathspec,
  projectScopedStatusArgs,
  resolveDefaultGitAddPaths,
} from './git-worktree-scope.ts';

type AnyRecord = Record<string, any>;
type PorcelainEntry = { raw: string; status: string; path: string };
type StashEntry = { ref: string; sha: string; subject: string };
type GitStructuredError = Error & { code?: string; gitSync?: AnyRecord; pollingGit?: AnyRecord };
type RuntimeStashState = { stashRef: string | null; stashSha?: string | null; paths: string[] } | null;
type PreservationStashState = { stashRef: string | null; stashSha?: string | null; paths: string[] } | null;
type GitCommitPushOptions = { addPaths?: string[]; conflictPaths?: string[]; captureHash?: boolean; softFail?: boolean; budget?: any; signal?: any };
const GIT_LOG_LEVEL_INFO = 'INFO';
const GIT_PULL_FAILED_REASON = 'git_pull_failed';
const GIT_PULL_FAILED_DETAIL = 'git pull failed';
function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function selectPresentValue<T>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}
function uniqueTextValues(values: unknown[] = []): string[] {
  return [...new Set(values.map((value) => textValue(value).trim()).filter(Boolean))];
}
function requireNumber(obj: AnyRecord, field: string, label: string, { positive = false, integer = false }: { positive?: boolean; integer?: boolean } = {}): number {
  const value = obj?.[field];
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value)))), () => ((positive && value <= 0)))), () => ((integer && !Number.isInteger(value))))) {
    throw new Error(`${label}.${field}: required${positive ? ' positive' : ''}${integer ? ' integer' : ''} number in swarm.config.json`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function commandErrorDetail(error: unknown): string {
  const err = error as { stderr?: unknown; stdout?: unknown; message?: unknown };
  const BufferCtor = (globalThis as AnyRecord).Buffer;
  const parts = [err?.stderr, err?.stdout, err?.message]
    .map((part) => BufferCtor?.isBuffer?.(part) ? part.toString('utf8') : textValue(part))
    .map((part) => part.trim())
    .filter(Boolean);
  const lines = parts.join('\n').split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => /\b(?:fatal|error|conflict|not something we can merge)\b/i.test(line)) || lines[0] || errorMessage(error).split('\n')[0];
}

export { getRepoRoot, gitExec, headHash, invalidateHeadHash, setGitRuntimePolicy, setRepoRoot } from '../git-primitives.ts';

export const FAIL_PATTERNS = {
  GIT_REBASE_CONFLICT: 'GIT_REBASE_CONFLICT',
  GIT_SYNC_FAILED: 'GIT_SYNC_FAILED',
  GIT_PUSH_REJECTED: 'GIT_PUSH_REJECTED',
  GIT_PUSH_FAILED: 'GIT_PUSH_FAILED',
  MODULE_JOIN_CONFLICT: 'module_join/conflict',
  MODULE_JOIN_FAILED: 'module_join/merge_failed',
  MODULE_JOIN_DIRTY: 'module_join/dirty_worktree',
  MODULE_WORKTREE_DIRTY,
} as const;

export function classifyGitPushError(errorMessage: unknown): string {
  const msg = textValue(errorMessage);
  if (/\[rejected\]|non-fast-forward|updates were rejected/i.test(msg)) return FAIL_PATTERNS.GIT_PUSH_REJECTED;
  if (/authentication failed|publickey|permission denied \(publickey\)|could not read.*passphrase/i.test(msg)) return FAIL_PATTERNS.GIT_PUSH_FAILED;
  if (/timeout|timed out|connection (refused|reset)|network (error|unreachable)/i.test(msg)) return FAIL_PATTERNS.GIT_PUSH_FAILED;
  if (/git sync failed|failed before buster handoff/i.test(msg)) return FAIL_PATTERNS.GIT_SYNC_FAILED;
  return FAIL_PATTERNS.GIT_PUSH_FAILED;
}

function log(level: string, message: string): void {
  const normalizedLevel = textValue(selectPresentValue(level, GIT_LOG_LEVEL_INFO)).toUpperCase();
  const writer = selectTruthyValue(() => (normalizedLevel === 'ERROR'), () => (normalizedLevel === 'WARN'))
    ? console.error
    : console.log;
  writer(`[${normalizedLevel}] ${message}`);
}

function incrementStat(config: AnyRecord, key: string) {
  const stats = selectTruthyValue(() => (config?._runStats), () => (null));
  if (stats && typeof stats[key] === 'number') stats[key]++;
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
      const trimmedUnstagedStatus = line.length > 2 && line[1] === ' ' && line[2] !== ' ' && /^[MADRCUT]$/.test(line.charAt(0));
      const status = trimmedUnstagedStatus ? ` ${line[0]}` : line.slice(0, 2);
      const payload = line.slice(trimmedUnstagedStatus ? 2 : 3).trim();
      const filePath = payload.includes(' -> ') ? textValue(payload.split(' -> ').pop()).trim() : payload;
      return { raw: line, status, path: filePath };
    });
}

function parseProjectScopedPorcelainEntries(config: AnyRecord): PorcelainEntry[] {
  return parsePorcelainEntries(config.repo_root, projectScopedStatusArgs(config));
}

function parseOutOfScopePorcelainEntries(config: AnyRecord): PorcelainEntry[] {
  return parsePorcelainEntries(config.repo_root)
    .filter((entry) => entry.path && !isPathWithinProjectScope(config, entry.path));
}

function partitionRuntimeStateEntries(entries: PorcelainEntry[] = []) {
  const runtimeEntries: PorcelainEntry[] = [];
  const nonRuntimeEntries: PorcelainEntry[] = [];

  for (const entry of entries) {
    if (isRuntimeStatePath(entry.path)) runtimeEntries.push(entry);
    else nonRuntimeEntries.push(entry);
  }

  return { runtimeEntries, nonRuntimeEntries };
}

function isBranchOwnedModuleRuntimePath(relPathName: unknown): boolean {
  const normalizedPath = normalizeRepoRelativePath(relPathName);
  const marker = '/.swarm/modules/';
  const markerIndex = normalizedPath.indexOf(marker);
  if (markerIndex === -1) return false;
  const swarmPath = normalizedPath.slice(markerIndex + '/.swarm/'.length);
  return /^modules\/[^/]+\/(?:forge|buster|review|gate)-completion(?:\.[^/]+)?\.json$/.test(swarmPath);
}

function discardBranchOwnedModuleRuntimeEntries(config: AnyRecord, entries: PorcelainEntry[] = []) {
  const discardEntries = entries.filter((entry) => isBranchOwnedModuleRuntimePath(entry.path));
  if (discardEntries.length === 0) return [];

  const trackedPaths = discardEntries
    .filter((entry) => entry.status !== '??')
    .map((entry) => normalizeRepoRelativePath(entry.path))
    .filter(Boolean);
  const untrackedPaths = discardEntries
    .filter((entry) => entry.status === '??')
    .map((entry) => normalizeRepoRelativePath(entry.path))
    .filter(Boolean);

  if (trackedPaths.length > 0) {
    gitExec(config.repo_root, ['reset', '--quiet', '--', ...trackedPaths], { stdio: 'ignore' });
    gitExec(config.repo_root, ['checkout', '--', ...trackedPaths], { stdio: 'ignore' });
  }
  for (const filePath of untrackedPaths) {
    fs.rmSync(path.join(config.repo_root, filePath), { recursive: true, force: true });
  }

  const discardedPaths = [...trackedPaths, ...untrackedPaths];
  log('DEBUG', `Discarded ${discardedPaths.length} stale parent module runtime artifact(s) before module join`);
  return discardedPaths;
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
  if (!stashState?.stashSha) return selectTruthyValue(() => (stashState?.stashRef), () => (null));
  const entry = listStashEntries(repoRoot).find(stashEntry => stashEntry.sha === stashState.stashSha);
  return selectTruthyValue(() => (entry?.ref), () => (null));
}

function dropRuntimeStash(repoRoot: string, stashState: RuntimeStashState) {
  const currentStashRef = resolveStashRefBySha(repoRoot, stashState);
  if (!currentStashRef) return;
  try {
    gitExec(repoRoot, ['stash', 'drop', currentStashRef], { stdio: 'ignore' });
  } catch (dropErr) {
    log('WARN', `Runtime-state stash drop failed after restore handling: ${errorMessage(dropErr).split('\n')[0]}`);
  }
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
  const mergeStatePath = gitPath(repoRoot, 'rebase-merge');
  const applyStatePath = gitPath(repoRoot, 'rebase-apply');
  return selectTruthyValue(() => (fs.existsSync(mergeStatePath)), () => (fs.existsSync(applyStatePath)));
}

function createStructuredGitError(config: AnyRecord | null, code: string, message: string, details: AnyRecord = {}): GitStructuredError {
  const error: GitStructuredError = new Error(message);
  error.code = code;
  error.gitSync = {
    code,
    repo_root: selectTruthyValue(() => (config?.repo_root), () => (null)),
    project: selectTruthyValue(() => (config?.project), () => (null)),
    ...details,
  };
  return error;
}

export function commitModuleWorktreeChanges(config: AnyRecord, message: string, { addPaths = [], captureHash = true }: GitCommitPushOptions = {}): AnyRecord {
  const repoRoot = textValue(config?.repo_root);
  if (!repoRoot) throw new Error('commitModuleWorktreeChanges requires config.repo_root');
  const requestedAddPaths = Array.isArray(addPaths) && addPaths.length > 0 ? addPaths : resolveDefaultGitAddPaths(config);
  const broadAddMode = requestedAddPaths.some((entry) => textValue(entry).startsWith('-'));
  const normalizedAddPaths = broadAddMode ? [] : normalizeScopedGitPaths(requestedAddPaths);

  if (!broadAddMode && normalizedAddPaths.length > 0) {
    gitExec(repoRoot, ['add', '--', ...normalizedAddPaths], { stdio: 'ignore' });
  } else {
    gitExec(repoRoot, ['add', ...requestedAddPaths], { stdio: 'ignore' });
  }

  const staged = gitExec(repoRoot, ['diff', '--cached', '--name-only']);
  if (staged) {
    gitExec(repoRoot, ['commit', '-m', message], { stdio: 'ignore' });
    invalidateHeadHash(config);
  }

  const hash = captureHash ? gitExec(repoRoot, ['rev-parse', 'HEAD']).trim() : null;
  const branch = gitExec(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  log('OK', staged
    ? `Committed module worktree changes: ${message.slice(0, 60)}${hash ? ` (${hash.substring(0, 8)})` : ''}`
    : `No staged module worktree changes — using existing commit${hash ? ` (${hash.substring(0, 8)})` : ''}`);
  return { committed: Boolean(staged), hash, branch };
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
      try {
        gitExec(repoRoot, ['merge', '--no-ff', '--no-edit', branch], {
          env: buildSubprocessEnv({ GIT_EDITOR: 'true' }),
        });
        merged.push(branch);
      } catch (error) {
        const conflicts = getConflictedPaths(repoRoot);
        const cause = commandErrorDetail(error);
        const code = conflicts.length > 0 ? FAIL_PATTERNS.MODULE_JOIN_CONFLICT : FAIL_PATTERNS.MODULE_JOIN_FAILED;
        try {
          gitExec(repoRoot, ['merge', '--abort'], { stdio: 'ignore' });
        } catch (_) {
          // Best-effort cleanup after a failed merge; the typed error below is authoritative.
        }
        if (startHead) gitExec(repoRoot, ['reset', '--hard', startHead], { stdio: 'ignore' });
        mergeError = createStructuredGitError(config, code, code === FAIL_PATTERNS.MODULE_JOIN_CONFLICT ? `Module branch merge conflict: ${branch}` : `Module branch merge failed: ${branch}`, {
          branch,
          merged_branches: merged,
          conflicted_paths: conflicts,
          cause,
        });
        break;
      }
    }
  } finally {
    try {
      restoreRuntimeStateStash(config, runtimeStash);
    } catch (restoreError) {
      if (!mergeError) throw restoreError;
      log('WARN', `Runtime-state restore failed after module join failure: ${commandErrorDetail(restoreError)}`);
    }
  }
  if (mergeError) throw mergeError;
  invalidateHeadHash(config);
  return { ok: true, merged_branches: merged, head: gitExec(repoRoot, ['rev-parse', 'HEAD']).trim(), runtime_stash_paths: runtimeStash?.paths || [] };
}

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
  return { stashRef: selectTruthyValue(() => (stashEntry?.ref), () => (null)), stashSha: selectTruthyValue(() => (stashEntry?.sha), () => (null)), paths: stashPaths };
}

function collectRuntimeStateStash(config: AnyRecord): RuntimeStashState {
  const entries = parseProjectScopedPorcelainEntries(config);
  if (entries.length === 0) return null;

  const stashPaths = [...new Set(entries.map(entry => entry.path).filter(Boolean))];
  if (stashPaths.length === 0) return null;

  const beforeShas = new Set(listStashEntries(config.repo_root).map(entry => entry.sha));
  gitExec(config.repo_root, ['stash', 'push', '--include-untracked', '-m', 'pipeline-pre-push-project-worktree', '--', ...stashPaths], { stdio: 'ignore' });
  const afterEntries = listStashEntries(config.repo_root);
  const stashEntry = selectTruthyValue(() => (afterEntries.find(entry => !beforeShas.has(entry.sha))), () => (null));

  log('DEBUG', `Stashed ${stashPaths.length} project worktree path(s) before pull-rebase`);
  return { stashRef: selectTruthyValue(() => (stashEntry?.ref), () => (null)), stashSha: selectTruthyValue(() => (stashEntry?.sha), () => (null)), paths: stashPaths };
}

function collectOutOfScopeWorktreeStash(config: AnyRecord): PreservationStashState {
  const entries = parseOutOfScopePorcelainEntries(config);
  const stashPaths = [...new Set(entries.map(entry => entry.path).filter(Boolean))];
  if (stashPaths.length === 0) return null;

  const beforeShas = new Set(listStashEntries(config.repo_root).map(entry => entry.sha));
  gitExec(config.repo_root, ['stash', 'push', '--include-untracked', '-m', 'pipeline-preserve-out-of-scope-worktree', '--', ...stashPaths], { stdio: 'ignore' });
  const afterEntries = listStashEntries(config.repo_root);
  const stashEntry = selectTruthyValue(() => (afterEntries.find(entry => !beforeShas.has(entry.sha))), () => (null));

  log('DEBUG', `Stashed ${stashPaths.length} out-of-scope worktree path(s) before pull-rebase fallback`);
  return { stashRef: selectTruthyValue(() => (stashEntry?.ref), () => (null)), stashSha: selectTruthyValue(() => (stashEntry?.sha), () => (null)), paths: stashPaths };
}

function restoreOutOfScopeWorktreeStash(config: AnyRecord, stashState: PreservationStashState) {
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

  const normalizedAllowedConflictPaths = normalizeScopedGitPaths(opts.allowedConflictPaths);
  try {
    gitExec(config.repo_root, ['stash', 'pop', stashRef], { stdio: 'ignore' });
    log('DEBUG', 'Restored stashed project worktree after push');
    return;
  } catch (popErr) {
    const conflicts = filterProjectScopedPaths(config, getConflictedPaths(config.repo_root));
    if (conflicts.length === 0) {
      const entries = parseProjectScopedPorcelainEntries(config);
      const stashedPaths = normalizeScopedGitPaths(stashState.paths);
      const stashedPathsRestored = stashedPaths.every((file) => {
        if (entries.some((entry) => normalizeRepoRelativePath(entry.path) === file)) return true;
        return fs.existsSync(path.join(config.repo_root, file));
      });

      if (stashedPathsRestored) {
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

    const stashedPaths = normalizeScopedGitPaths(stashState.paths);
    const restorableConflicts = conflicts.filter(file => pathMatchesScopedPathspec(file, stashedPaths));
    if (restorableConflicts.length !== conflicts.length) {
      const unexpectedConflicts = conflicts.filter(file => !pathMatchesScopedPathspec(file, stashedPaths));
      throw createStructuredGitError(
        config,
        FAIL_PATTERNS.GIT_REBASE_CONFLICT,
        `[${FAIL_PATTERNS.GIT_REBASE_CONFLICT}] Restoring stashed local project changes after pull-rebase produced unexpected conflicts.\n` +
          `  Conflicted paths: ${unexpectedConflicts.slice(0, 10).join(', ')}\n` +
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
          stash_sha: selectTruthyValue(() => (stashState.stashSha), () => (null)),
        },
      );
    }

    log('WARN', `Stash pop conflicted on stashed project files — restoring stashed versions for ${restorableConflicts.join(', ')}`);
    for (const file of restorableConflicts) {
      gitExec(config.repo_root, ['checkout', '--theirs', '--', file], { stdio: 'ignore' });
      gitExec(config.repo_root, ['add', '--', file], { stdio: 'ignore' });
    }

    dropRuntimeStash(config.repo_root, stashState);

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

function gitPushPolicy(config: AnyRecord): { maxRetries: number; delayMs: number; timeoutMs: number } {
  const push = config?.git?.push;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!push), () => (typeof push !== 'object'))), () => (Array.isArray(push)))) {
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

export async function gitCommitAndPush(config: AnyRecord, message: string, { addPaths = [], conflictPaths = [], captureHash = false, softFail = false, budget = null, signal = null }: GitCommitPushOptions = {}): Promise<{ committed: boolean; hash?: string; error?: string }> {
  try {
    const requestedAddPaths = Array.isArray(addPaths) && addPaths.length > 0 ? addPaths : resolveDefaultGitAddPaths(config);
    const broadAddMode = requestedAddPaths.some((entry) => textValue(entry).startsWith('-'));
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
    const stagedPaths = normalizeScopedGitPaths(staged.split('\n'));
    const publicationConflictPaths = normalizeScopedGitPaths([
      ...stagedPaths,
      ...conflictPaths,
    ]);

    gitExec(config.repo_root, ['commit', '-m', message]);
    invalidateHeadHash(config);

    const stashState = collectRuntimeStateStash(config);
    const hasOutOfScopeDirty = parseOutOfScopePorcelainEntries(config).length > 0;
    let outOfScopeStash: PreservationStashState = null;
    let pushed = false;

    try {
      if (hasOutOfScopeDirty) {
        log('INFO', 'Out-of-scope local changes detected — skipping proactive pull and attempting direct push');
        try {
          await gitPushWithRetry(config, { maxRetries: 1, delayMs: 0, budget, signal });
          pushed = true;
        } catch (pushErr) {
          log('WARN', `Direct push failed with out-of-scope local changes present — stashing unrelated worktree changes and falling back to pull-rebase: ${errorMessage(pushErr).split('\n')[0]}`);
          outOfScopeStash = collectOutOfScopeWorktreeStash(config);
        }
      }

      if (!pushed) {
        const pullResult = _gitPullCore(config, {
          allowedConflictPaths: publicationConflictPaths,
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
        await gitPushWithRetry(config, { budget, signal });
      }
    } finally {
      restoreOutOfScopeWorktreeStash(config, outOfScopeStash);
      restoreRuntimeStateStash(config, stashState, {
        allowedConflictPaths: publicationConflictPaths,
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
