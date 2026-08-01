import path from 'path';
import { selectTruthyValue } from '../optional-absence.js';

type AnyRecord = Record<string, any>;

export function normalizeRepoRelativePath(value: unknown): string {
  return (typeof value === 'string' ? value : '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^(?:\.\/)+/, '')
    .trim();
}

function projectScopePathspec(config: AnyRecord): string {
  const repoRoot = typeof config?.repo_root === 'string' ? config.repo_root : '';
  const swarmDir = typeof config?.paths?.swarm_dir === 'string' ? config.paths.swarm_dir : '';
  if (!repoRoot || !swarmDir) return '';
  return normalizeRepoRelativePath(path.relative(repoRoot, path.dirname(swarmDir)));
}

export function isPathWithinProjectScope(config: AnyRecord, value: unknown): boolean {
  const normalizedPath = normalizeRepoRelativePath(value);
  if (!normalizedPath) return false;
  const scope = projectScopePathspec(config);
  return !scope || normalizedPath === scope || normalizedPath.startsWith(`${scope}/`);
}

export function projectScopedStatusArgs(config: AnyRecord): string[] {
  const scope = projectScopePathspec(config);
  const args = ['status', '--porcelain', '--untracked-files=all'];
  if (scope) args.push('--', scope);
  return args;
}

export function filterProjectScopedPaths(config: AnyRecord, paths: string[] = []): string[] {
  return paths.map(normalizeRepoRelativePath).filter((filePath) => filePath && isPathWithinProjectScope(config, filePath));
}

export function resolveDefaultGitAddPaths(config: AnyRecord): string[] {
  const scope = projectScopePathspec(config);
  return scope ? [scope] : ['-A'];
}

export function normalizeScopedGitPaths(paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  return [...new Set(paths.map(normalizeRepoRelativePath).filter(Boolean))];
}

export function pathMatchesScopedPathspec(repoRelativePath: string, pathspecs: string[] = []): boolean {
  const normalizedPath = normalizeRepoRelativePath(repoRelativePath);
  return Boolean(normalizedPath) && pathspecs.some((scope) => selectTruthyValue(
    () => normalizedPath === scope,
    () => normalizedPath.startsWith(`${scope}/`),
  ));
}
