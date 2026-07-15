// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
import { gitExec } from '../git-primitives.ts';
import { isRuntimeStatePath } from '../runtime-state-paths.ts';

export const MODULE_WORKTREE_DIRTY = 'module_worktree/dirty';

function textValue(value) {
  return typeof value === 'string' ? value : '';
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

function parsePorcelainEntries(repoRoot, args = ['status', '--porcelain', '--untracked-files=all']) {
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

function partitionRuntimeStateEntries(entries = []) {
  const runtimeEntries = [];
  const nonRuntimeEntries = [];
  for (const entry of entries) {
    if (isRuntimeStatePath(entry.path)) runtimeEntries.push(entry);
    else nonRuntimeEntries.push(entry);
  }
  return { runtimeEntries, nonRuntimeEntries };
}

export function verifyModuleWorktreeClean(worktreePath) {
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

export function cleanupModuleWorktree(config, input = {}) {
  const repoRoot = textValue(config?.repo_root);
  const worktreePath = textValue(input.worktreePath || input.worktree_path);
  if (!repoRoot) throw new Error('cleanupModuleWorktree requires config.repo_root');
  if (!worktreePath) throw new Error('cleanupModuleWorktree requires worktreePath');
  if (!fs.existsSync(worktreePath)) return { ok: true, worktree_path: worktreePath, removed: false };
  gitExec(repoRoot, ['worktree', 'remove', '--force', worktreePath], { stdio: 'ignore' });
  return { ok: true, worktree_path: worktreePath, removed: true };
}
