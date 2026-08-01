import fs from 'fs';
import { gitExec } from '../git-primitives.js';
import { isRuntimeStatePath } from '../runtime-state-paths.js';
import { parsePorcelainEntries } from './git-porcelain.js';
import type { PorcelainEntry } from './git-porcelain.js';

type AnyRecord = Record<string, any>;
type StructuredGitError = Error & { code: string; gitSync: AnyRecord };

export const MODULE_WORKTREE_DIRTY = 'module_worktree/dirty';

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function createStructuredGitError(config: AnyRecord, code: string, message: string, details: AnyRecord = {}): StructuredGitError {
  const error = new Error(message) as StructuredGitError;
  error.code = code;
  error.gitSync = {
    code,
    repo_root: config?.repo_root || null,
    project: config?.project || null,
    ...details,
  };
  return error;
}

function partitionRuntimeStateEntries(entries: PorcelainEntry[] = []): { runtimeEntries: PorcelainEntry[]; nonRuntimeEntries: PorcelainEntry[] } {
  const runtimeEntries: PorcelainEntry[] = [];
  const nonRuntimeEntries: PorcelainEntry[] = [];
  for (const entry of entries) {
    if (isRuntimeStatePath(entry.path)) runtimeEntries.push(entry);
    else nonRuntimeEntries.push(entry);
  }
  return { runtimeEntries, nonRuntimeEntries };
}

export function verifyModuleWorktreeClean(worktreePath: unknown): AnyRecord {
  const root = textValue(worktreePath);
  if (!root) throw new Error('verifyModuleWorktreeClean requires worktreePath');
  const entries = parsePorcelainEntries(root);
  const { runtimeEntries, nonRuntimeEntries } = partitionRuntimeStateEntries(entries);
  const dirty_paths = nonRuntimeEntries.map((entry) => entry.raw);
  if (dirty_paths.length > 0) {
    throw createStructuredGitError({ repo_root: root }, MODULE_WORKTREE_DIRTY, `Module worktree is dirty: ${root}`, {
      worktree_path: root,
      dirty_paths,
    });
  }
  return { ok: true, worktree_path: root, ignored_runtime_paths: runtimeEntries.map((entry) => entry.raw) };
}

export function cleanupModuleWorktree(config: AnyRecord, input: AnyRecord = {}): AnyRecord {
  const repoRoot = textValue(config?.repo_root);
  const worktreePath = textValue(input.worktreePath || input.worktree_path);
  if (!repoRoot) throw new Error('cleanupModuleWorktree requires config.repo_root');
  if (!worktreePath) throw new Error('cleanupModuleWorktree requires worktreePath');
  if (!fs.existsSync(worktreePath)) return { ok: true, worktree_path: worktreePath, removed: false };
  gitExec(repoRoot, ['worktree', 'remove', '--force', worktreePath], { stdio: 'ignore' });
  return { ok: true, worktree_path: worktreePath, removed: true };
}
