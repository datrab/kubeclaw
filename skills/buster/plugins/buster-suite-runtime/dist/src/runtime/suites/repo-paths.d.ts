import { isPathInside } from '../security.js';
export { isPathInside };
export declare function resolveRepoDir(startDir?: unknown): string;
export declare const REPO_DIR: string;
type RepoScopedPathOptions = {
    repoDir?: string;
    baseDir?: string;
    scopeDir?: string;
    field?: string;
};
export declare function resolveRepoScopedPath(p: unknown, options?: RepoScopedPathOptions): string | null;
export declare function stripRepoDirPrefix(value: unknown, repoDir?: string): string;
