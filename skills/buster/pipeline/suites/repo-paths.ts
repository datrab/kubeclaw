
import path from 'path';
import { isPathInside, resolveScopedPath } from '../security.ts';
import { getRepoRoot } from '../git-primitives.ts';

export { isPathInside };

export function resolveRepoDir(startDir: unknown = null): string {
  return startDir ? getRepoRoot(startDir) : getRepoRoot();
}

export const REPO_DIR = resolveRepoDir();

type RepoScopedPathOptions = {
  repoDir?: string;
  baseDir?: string;
  scopeDir?: string;
  field?: string;
};

export function resolveRepoScopedPath(p: unknown, options: RepoScopedPathOptions = {}): string | null {
  if (!p) return null;
  const repoDir = path.resolve(options.repoDir || resolveRepoDir());
  const baseDir = path.resolve(options.baseDir || repoDir);
  const scopeDir = path.resolve(options.scopeDir || repoDir);
  return resolveScopedPath(String(p), {
    baseDir,
    scopeDir,
    field: options.field || 'path',
    scopeDescription: 'allowed repository scope',
  });
}

export function stripRepoDirPrefix(value: unknown, repoDir = REPO_DIR): string {
  return String(value || '').replace(`${repoDir}/`, '').replace(repoDir, '');
}
