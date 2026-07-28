declare function takeDiscoveryDiagnostics(): any[];
declare function listPolicySourceFiles(scanRoot: any): any[];
declare function configuredTargetPaths(ctx: any, tool?: any): any;
declare function listConfiguredTargetFiles(ctx: any, predicate?: any): any[];
/**
 * Detect project type(s) by looking for marker files.
 * A project can be multi-type (e.g. Full-Stack: JS + Python + Docker + Helm).
 *
 * @param {string} repoRoot - Repo root path
 * @param {string|null} modulePath - Optional module subdirectory to narrow scope
 * @returns {{ types: Set<string>, markers: object }}
 */
declare function detectProjectTypes(repoRoot: any, project: any, globalExclusions?: any): {
    types: Set<unknown>;
    markers: any;
};
/**
 * Find files matching a predicate, with max depth.
 * Lightweight alternative to glob — no dependencies.
 */
declare function findFiles(dir: any, predicate: any, maxDepth?: any, _depth?: any): any[];
/**
 * Resolve the effective file scope for linting.
 * Priority: --changed-files > --module-path > full repo.
 *
 * @param {object} ctx - Run context
 * @returns {string[]} List of files to scope lint to, or empty for full scope
 */
declare function resolveScope(ctx: any): any;
export { detectProjectTypes, findFiles, configuredTargetPaths, listConfiguredTargetFiles, listPolicySourceFiles, resolveScope, takeDiscoveryDiagnostics, };
