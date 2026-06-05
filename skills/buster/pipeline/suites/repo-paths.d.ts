export function isPathInside(candidatePath: string, parentDir: string): boolean;
export const REPO_DIR: string;
export function resolveRepoDir(): string;
export interface RepoScopedPathOptions {
  repoDir?: string;
  baseDir?: string;
  scopeDir?: string;
  field?: string;
}
export function resolveRepoScopedPath(p: unknown, options?: RepoScopedPathOptions): string | null;
export function stripRepoDirPrefix(value: unknown, repoDir?: string): string;
