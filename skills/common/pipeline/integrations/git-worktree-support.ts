import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { writeRuntimeLog } from '../runtime-log.ts';
// integrations/git-worktree.ts — Shared pipeline Git worktree policy

import fs from 'fs';
import path from 'path';
import { getRepoRoot, gitExec, headHash, invalidateHeadHash, setGitRuntimePolicy, setRepoRoot } from '../git-primitives.ts';
import { sleep } from '../timing.ts';
import { buildSubprocessEnv } from '../security.ts';
import { isRuntimeStatePath } from '../runtime-state-paths.ts';
import { MODULE_WORKTREE_DIRTY } from './module-worktree-maintenance.ts';
import { parsePorcelainEntries, type PorcelainEntry } from './git-porcelain.ts';
import {
  filterProjectScopedPaths,
  isPathWithinProjectScope,
  normalizeRepoRelativePath,
  normalizeScopedGitPaths,
  pathMatchesScopedPathspec,
  projectScopedStatusArgs,
  resolveDefaultGitAddPaths,
} from './git-worktree-scope.ts';

export type AnyRecord = Record<string, any>;
export type StashEntry = { ref: string; sha: string; subject: string };
export type GitStructuredError = Error & { code?: string; gitSync?: AnyRecord; pollingGit?: AnyRecord };
export type RuntimeStashState = { stashRef: string | null; stashSha?: string | null; paths: string[] } | null;
export type PreservationStashState = { stashRef: string | null; stashSha?: string | null; paths: string[] } | null;
export type GitCommitPushOptions = { addPaths?: string[]; conflictPaths?: string[]; captureHash?: boolean; softFail?: boolean; budget?: any; signal?: any };
const GIT_LOG_LEVEL_INFO = 'INFO';
export const GIT_PULL_FAILED_REASON = 'git_pull_failed';
export const GIT_PULL_FAILED_DETAIL = 'git pull failed';
export function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
export function selectPresentValue<T>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}
export function uniqueTextValues(values: unknown[] = []): string[] {
  return [...new Set(values.map((value) => textValue(value).trim()).filter(Boolean))];
}
export function requireNumber(obj: AnyRecord, field: string, label: string, { positive = false, integer = false }: { positive?: boolean; integer?: boolean } = {}): number {
  const value = obj?.[field];
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value)))), () => ((positive && value <= 0)))), () => ((integer && !Number.isInteger(value))))) {
    throw new Error(`${label}.${field}: required${positive ? ' positive' : ''}${integer ? ' integer' : ''} number in swarm.config.json`);
  }
  return value;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function commandErrorDetail(error: unknown): string {
  const err = error as { stderr?: unknown; stdout?: unknown; message?: unknown };
  const BufferCtor = (globalThis as AnyRecord).Buffer;
  const parts = [err?.stderr, err?.stdout, err?.message]
    .map((part) => BufferCtor?.isBuffer?.(part) ? String(part) : textValue(part))
    .map((part) => part.trim())
    .filter(Boolean);
  const lines = parts.join('\n').split('\n').map((line) => line.trim()).filter(Boolean);
  const diagnostic = lines.find((line) => /\b(?:fatal|error|conflict|not something we can merge)\b/i.test(line));
  if (diagnostic) return diagnostic;
  if (lines[0]) return lines[0];
  return errorMessage(error).split('\n')[0] ?? '';
}


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

export function log(level: string, message: string): void {
  const normalizedLevel = textValue(selectPresentValue(level, GIT_LOG_LEVEL_INFO)).toUpperCase();
  const runtimeLevel = normalizedLevel === 'ERROR'
    ? 'error'
    : normalizedLevel === 'WARN' ? 'warn' : 'info';
  writeRuntimeLog(runtimeLevel, 'common/git-worktree', message);
}

export function incrementStat(config: AnyRecord, key: string) {
  const stats = selectTruthyValue(() => (config?._runStats), () => (null));
  if (stats && typeof stats[key] === 'number') stats[key]++;
}

export function continueRebaseFavoringLocal(config: AnyRecord, allowedConflicts: string[], label: string): boolean {
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

export function parseProjectScopedPorcelainEntries(config: AnyRecord): PorcelainEntry[] {
  return parsePorcelainEntries(config.repo_root, projectScopedStatusArgs(config));
}

export function parseOutOfScopePorcelainEntries(config: AnyRecord): PorcelainEntry[] {
  return parsePorcelainEntries(config.repo_root)
    .filter((entry) => entry.path && !isPathWithinProjectScope(config, entry.path));
}

export function partitionRuntimeStateEntries(entries: PorcelainEntry[] = []) {
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

export function discardBranchOwnedModuleRuntimeEntries(config: AnyRecord, entries: PorcelainEntry[] = []) {
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

export function listStashEntries(repoRoot: string): StashEntry[] {
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

export function resolveStashRefBySha(repoRoot: string, stashState: RuntimeStashState): string | null {
  if (!stashState?.stashSha) return stashState?.stashRef ?? null;
  const entry = listStashEntries(repoRoot).find(stashEntry => stashEntry.sha === stashState.stashSha);
  return entry?.ref ?? null;
}

export function dropRuntimeStash(repoRoot: string, stashState: RuntimeStashState) {
  const currentStashRef = resolveStashRefBySha(repoRoot, stashState);
  if (!currentStashRef) return;
  try {
    gitExec(repoRoot, ['stash', 'drop', currentStashRef], { stdio: 'ignore' });
  } catch (dropErr) {
    log('WARN', `Runtime-state stash drop failed after restore handling: ${errorMessage(dropErr).split('\n')[0]}`);
  }
}

export function getConflictedPaths(repoRoot: string): string[] {
  return gitExec(repoRoot, ['diff', '--name-only', '--diff-filter=U'])
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean);
}

function gitPath(repoRoot: string, gitPathName: string): string {
  const resolved = gitExec(repoRoot, ['rev-parse', '--git-path', gitPathName]).trim();
  return path.isAbsolute(resolved) ? resolved : path.join(repoRoot, resolved);
}

export function isRebaseInProgress(repoRoot: string): boolean {
  const mergeStatePath = gitPath(repoRoot, 'rebase-merge');
  const applyStatePath = gitPath(repoRoot, 'rebase-apply');
  return selectTruthyValue(() => (fs.existsSync(mergeStatePath)), () => (fs.existsSync(applyStatePath)));
}

export function createStructuredGitError(config: AnyRecord | null, code: string, message: string, details: AnyRecord = {}): GitStructuredError {
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
