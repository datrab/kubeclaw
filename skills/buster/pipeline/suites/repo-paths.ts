
import path from 'path';
import { isPathInside, resolveScopedPath } from '../security.ts';
import { getRepoRoot } from '../git-primitives.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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
  const repoDir = repoDirAuthority(options.repoDir);
  const baseDir = baseDirAuthority(options.baseDir, repoDir);
  const scopeDir = scopeDirAuthority(options.scopeDir, repoDir);
  return resolveScopedPath(String(p), {
    baseDir,
    scopeDir,
    field: options.field === undefined ? 'path' : options.field,
    scopeDescription: 'allowed repository scope',
  });
}

function repoDirAuthority(repoDir: string | undefined): string {
  if (typeof repoDir === 'string' && repoDir.trim()) return path.resolve(repoDir);
  return path.resolve(resolveRepoDir());
}

function baseDirAuthority(baseDir: string | undefined, repoDir: string): string {
  if (typeof baseDir === 'string' && baseDir.trim()) return path.resolve(baseDir);
  return path.resolve(repoDir);
}

function scopeDirAuthority(scopeDir: string | undefined, repoDir: string): string {
  if (typeof scopeDir === 'string' && scopeDir.trim()) return path.resolve(scopeDir);
  return path.resolve(repoDir);
}

export function stripRepoDirPrefix(value: unknown, repoDir = REPO_DIR): string {
  return String(selectDefinedValue(() => (value), () => (''))).replace(`${repoDir}/`, '').replace(repoDir, '');
}
