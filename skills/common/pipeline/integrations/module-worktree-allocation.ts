// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { gitExec } from '../git-primitives.ts';

function textValue(value) {
  return typeof value === 'string' ? value : '';
}

function selectPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
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

function sanitizeGitPathSegment(value) {
  const normalized = textValue(value)
    .trim()
    .replace(/\\/g, '/')
    .replace(/[^A-Za-z0-9._/-]+/g, '-')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');
  return selectPresentValue(normalized, 'unknown');
}

function moduleAttemptBranch(input = {}) {
  const runId = sanitizeGitPathSegment(selectPresentValue(input.runId, input.run_id));
  const moduleId = sanitizeGitPathSegment(selectPresentValue(input.moduleId, input.module_id, input.itemId));
  const attempt = Number(input.attempt);
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error('module worktree branch requires positive integer attempt');
  return `run/${runId}/module/${moduleId}/attempt-${attempt}`;
}

function defaultParallelWorktreeRoot(config) {
  const configured = textValue(config?.git?.parallel_worktree_root || config?.git?.worktree_root);
  if (configured) return path.isAbsolute(configured) ? configured : path.join(config.repo_root, configured);
  return path.join(path.dirname(config.repo_root), 'worktrees');
}

function isPathInsideOrEqual(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertParallelWorktreeRootOutsideRepo(config, root) {
  if (!isPathInsideOrEqual(root, config.repo_root)) return;
  throw createStructuredGitError(config, 'module_worktree/root_inside_repo', `Module worktree root must be outside the run worktree: ${root}`, {
    worktree_root: root,
  });
}

export function freezeParallelGitBase(config) {
  const repoRoot = textValue(config?.repo_root);
  if (!repoRoot) throw new Error('freezeParallelGitBase requires config.repo_root');
  const baseCommit = gitExec(repoRoot, ['rev-parse', 'HEAD']).trim();
  if (!baseCommit) throw new Error('freezeParallelGitBase could not resolve HEAD');
  return { base_commit: baseCommit, repo_root: repoRoot };
}

export function allocateModuleWorktree(config, input = {}) {
  const repoRoot = textValue(config?.repo_root);
  if (!repoRoot) throw new Error('allocateModuleWorktree requires config.repo_root');
  const branch = moduleAttemptBranch(input);
  const root = textValue(selectPresentValue(input.worktreeRoot, defaultParallelWorktreeRoot(config)));
  assertParallelWorktreeRootOutsideRepo(config, root);
  const moduleId = sanitizeGitPathSegment(selectPresentValue(input.moduleId, input.module_id, input.itemId));
  const attempt = Number(input.attempt);
  const runId = sanitizeGitPathSegment(selectPresentValue(input.runId, input.run_id));
  const worktreePath = path.join(root, runId, moduleId, `attempt-${attempt}`);
  const baseCommit = textValue(selectPresentValue(input.baseCommit, input.base_commit, gitExec(repoRoot, ['rev-parse', 'HEAD']).trim()));
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  if (fs.existsSync(worktreePath)) {
    throw createStructuredGitError(config, 'module_worktree/already_exists', `Module worktree already exists: ${worktreePath}`, {
      branch,
      worktree_path: worktreePath,
    });
  }
  gitExec(repoRoot, ['worktree', 'add', '-B', branch, worktreePath, baseCommit], { stdio: 'ignore' });
  return {
    kind: 'module_worktree',
    repo_root: repoRoot,
    base_commit: baseCommit,
    branch,
    worktree_path: worktreePath,
    module_id: moduleId,
    attempt,
  };
}
