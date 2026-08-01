import path from 'path';
import { isPathInside, resolveScopedPath } from '../security.js';
import { getRepoRoot } from '../git-primitives.js';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
export { isPathInside };
export function resolveRepoDir(startDir = null) {
    return startDir ? getRepoRoot(startDir) : getRepoRoot();
}
export const REPO_DIR = resolveRepoDir();
export function resolveRepoScopedPath(p, options = {}) {
    if (!p)
        return null;
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
function repoDirAuthority(repoDir) {
    if (typeof repoDir === 'string' && repoDir.trim())
        return path.resolve(repoDir);
    return path.resolve(resolveRepoDir());
}
function baseDirAuthority(baseDir, repoDir) {
    if (typeof baseDir === 'string' && baseDir.trim())
        return path.resolve(baseDir);
    return path.resolve(repoDir);
}
function scopeDirAuthority(scopeDir, repoDir) {
    if (typeof scopeDir === 'string' && scopeDir.trim())
        return path.resolve(scopeDir);
    return path.resolve(repoDir);
}
export function stripRepoDirPrefix(value, repoDir = REPO_DIR) {
    return String(selectDefinedValue(() => (value), () => (''))).replace(`${repoDir}/`, '').replace(repoDir, '');
}
