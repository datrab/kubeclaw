import fs from 'fs';
import path from 'path';
import { log } from './output.js';
import { matchesPolicyPattern, policyIncludesFile } from './policy.js';
import { selectDefinedValue, selectTruthyValue } from '../support/optional-absence.js';
const discoveryDiagnostics = [];
const LINT_POLICY_IGNORED_PATH_SEGMENTS = [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/plugins/',
    '/plugin/',
    '/registry/',
    '/registries/',
    '/loader/',
    '/loaders/',
    '/migrations/',
    '/test/',
    '/tests/',
    '/__tests__/',
];
const LINT_POLICY_IGNORED_FILE_PATTERNS = [
    /\.(test|spec)\.[jt]sx?$/,
    /\.min\.(js|mjs|cjs)$/,
];
function recordDiscoveryDiagnostic(entry = {}) {
    discoveryDiagnostics.push({
        source: 'lint-report.discovery',
        ts: new Date().toISOString(),
        ...entry,
    });
}
function takeDiscoveryDiagnostics() {
    return discoveryDiagnostics.splice(0, discoveryDiagnostics.length);
}
function findNearestTsconfigDir(repoRoot, modulePath = null) {
    const cwd = modulePath ? path.join(repoRoot, modulePath) : repoRoot;
    let tsconfigDir = cwd;
    while (tsconfigDir !== repoRoot && !fs.existsSync(path.join(tsconfigDir, 'tsconfig.json'))) {
        tsconfigDir = path.dirname(tsconfigDir);
    }
    if (fs.existsSync(path.join(tsconfigDir, 'tsconfig.json'))) {
        return tsconfigDir;
    }
    return null;
}
function isPolicyIgnoredFile(filePath) {
    const normalized = filePath.split(path.sep).join('/');
    return [
        LINT_POLICY_IGNORED_PATH_SEGMENTS.some((segment) => normalized.includes(segment)),
        LINT_POLICY_IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(normalized)),
    ].some(Boolean);
}
function listPolicySourceFiles(scanRoot) {
    return findFiles(scanRoot, (f) => /\.(js|jsx|ts|tsx|mjs|cjs)$/.test(f), 12)
        .filter((file) => !isPolicyIgnoredFile(file));
}
function configuredTargetPaths(ctx, tool = ctx.tool) {
    const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject?.root || '.');
    return tool.targets.map((target) => path.resolve(projectRoot, target));
}
function listConfiguredTargetFiles(ctx, predicate = () => true) {
    const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject?.root || '.');
    const candidates = [];
    for (const target of configuredTargetPaths(ctx)) {
        const stat = fs.statSync(target);
        candidates.push(...(stat.isDirectory() ? findFiles(target, () => true, Number.MAX_SAFE_INTEGER) : [target]));
    }
    return [...new Set(candidates)]
        .filter((file) => {
        const relative = path.relative(projectRoot, file).split(path.sep).join('/');
        return predicate(relative) && policyIncludesFile(relative, ctx.tool, ctx.policy.global_exclusions);
    })
        .sort();
}
/**
 * Detect project type(s) by looking for marker files.
 * A project can be multi-type (e.g. Full-Stack: JS + Python + Docker + Helm).
 *
 * @param {string} repoRoot - Repo root path
 * @param {string|null} modulePath - Optional module subdirectory to narrow scope
 * @returns {{ types: Set<string>, markers: object }}
 */
function detectProjectTypes(repoRoot, project, globalExclusions = []) {
    const scanRoot = path.resolve(repoRoot, project.root);
    const types = new Set();
    const markers = {};
    const candidates = findFiles(scanRoot, () => true, project.discovery_max_depth)
        .map((file) => path.relative(scanRoot, file).split(path.sep).join('/'))
        .filter((file) => !globalExclusions.some((pattern) => matchesPolicyPattern(file, pattern)));
    for (const language of project.languages) {
        const evidence = project.language_evidence[language];
        const matched = evidence.find((pattern) => {
            if (!pattern.includes('*'))
                return fs.existsSync(path.join(scanRoot, pattern));
            return candidates.some((candidate) => matchesPolicyPattern(candidate, pattern));
        });
        if (matched) {
            types.add(language);
            markers[language] = matched;
        }
    }
    log('INFO', `Detected project types: ${[...types].join(', ')}`, { markers });
    return { types, markers };
}
/**
 * Find files matching a predicate, with max depth.
 * Lightweight alternative to glob — no dependencies.
 */
function findFiles(dir, predicate, maxDepth = 3, _depth = 0) {
    if (_depth > maxDepth)
        return [];
    if (!fs.existsSync(dir))
        return [];
    const results = [];
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch (error) {
        recordDiscoveryDiagnostic({
            status: 'unavailable',
            path: dir,
            reason: selectTruthyValue(() => (error?.message), () => ('missing_error_message')),
        });
        return [];
    }
    for (const entry of entries) {
        if ([entry.name.startsWith('.'), entry.name === 'node_modules'].some(Boolean))
            continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && predicate(entry.name)) {
            results.push(fullPath);
        }
        else if (entry.isDirectory()) {
            results.push(...findFiles(fullPath, predicate, maxDepth, _depth + 1));
        }
    }
    return results;
}
/**
 * Resolve the effective file scope for linting.
 * Priority: --changed-files > --module-path > full repo.
 *
 * @param {object} ctx - Run context
 * @returns {string[]} List of files to scope lint to, or empty for full scope
 */
function resolveScope(ctx) {
    if (ctx.changedFiles && ctx.changedFiles.length > 0) {
        // Verify files exist (forge_diff_stat may reference files that were deleted)
        const existing = ctx.changedFiles.filter((f) => {
            const abs = path.isAbsolute(f) ? f : path.join(ctx.repoRoot, f);
            return fs.existsSync(abs);
        });
        log('INFO', `Scope: ${existing.length} changed files (${ctx.changedFiles.length} requested)`);
        return existing;
    }
    if (ctx.modulePath) {
        log('INFO', `Scope: module path ${ctx.modulePath}`);
        return []; // Tools will use modulePath as cwd/target
    }
    log('INFO', 'Scope: full repo');
    return [];
}
export { detectProjectTypes, findFiles, configuredTargetPaths, listConfiguredTargetFiles, listPolicySourceFiles, resolveScope, takeDiscoveryDiagnostics, };
