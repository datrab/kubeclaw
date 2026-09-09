import { requireRepositoryPath } from './paths.ts';
import fs from 'fs';
import path from 'path';

import { log } from './output.ts';
import { matchesPolicyPattern, policyIncludesFile } from './policy.ts';

import { selectDefinedValue, selectTruthyValue } from '../support/optional-absence.ts';
const discoveryDiagnostics: any[] = [];
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
function recordDiscoveryDiagnostic(entry: any = {}) {
  discoveryDiagnostics.push({
    source: 'lint-report.discovery',
    ts: new Date().toISOString(),
    ...entry,
  });
}

function takeDiscoveryDiagnostics() {
  return discoveryDiagnostics.splice(0, discoveryDiagnostics.length);
}

function findNearestTsconfigDir(repoRoot: any, modulePath: any = null) {
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

function isPolicyIgnoredFile(filePath: any) {
  const normalized = filePath.split(path.sep).join('/');
  return [
    LINT_POLICY_IGNORED_PATH_SEGMENTS.some((segment: any) => normalized.includes(segment)),
    LINT_POLICY_IGNORED_FILE_PATTERNS.some((pattern: any) => pattern.test(normalized)),
  ].some(Boolean);
}

function configuredTargetPaths(ctx: any, tool: any = ctx.tool) {
  const projectRoot = requireRepositoryPath(ctx.repoRoot, path.resolve(ctx.repoRoot, ctx.policyProject?.root || '.'));
  return tool.targets.map((target: any) => requireRepositoryPath(ctx.repoRoot, path.resolve(projectRoot, target)));
}

function findPolicyTargetFiles(directory: any, projectRoot: any, globalExclusions: any) {
  const files: any[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = requireRepositoryPath(projectRoot, path.join(directory, entry.name));
    const relative = path.relative(projectRoot, absolute).split(path.sep).join('/');
    if (entry.isFile()) {
      files.push(absolute);
    } else if (entry.isDirectory()) {
      const descendant = `${relative}/__lint_discovery__`;
      if (!globalExclusions.some((pattern: any) => matchesPolicyPattern(descendant, pattern))) {
        files.push(...findPolicyTargetFiles(absolute, projectRoot, globalExclusions));
      }
    }
  }
  return files;
}

function listConfiguredTargetFiles(ctx: any, predicate: any = () => true) {
  const projectRoot = requireRepositoryPath(ctx.repoRoot, path.resolve(ctx.repoRoot, ctx.policyProject?.root || '.'));
  const candidates: any[] = [];
  for (const target of configuredTargetPaths(ctx)) {
    const stat = fs.statSync(target);
    candidates.push(...(stat.isDirectory()
      ? findPolicyTargetFiles(target, projectRoot, ctx.policy.global_exclusions)
      : [target]));
  }
  return [...new Set(candidates)]
    .filter((file: any) => {
      const relative = path.relative(projectRoot, file).split(path.sep).join('/');
      return predicate(relative) && policyIncludesFile(relative, ctx.tool, ctx.policy.global_exclusions);
    })
    .sort();
}

function configuredTargetFilesForScope(ctx: any, predicate: any = () => true) {
  if (!ctx.changedFilesRequested) return listConfiguredTargetFiles(ctx, predicate);
  const projectRoot = requireRepositoryPath(ctx.repoRoot, path.resolve(ctx.repoRoot, ctx.policyProject?.root || '.'));
  return [...new Set(ctx.changedFiles
    .map((file: any) => requireRepositoryPath(ctx.repoRoot, path.isAbsolute(file) ? file : path.join(ctx.repoRoot, file)))
    .filter((file: any) => fs.existsSync(file)))]
    .filter((file: any) => {
      const relative = path.relative(projectRoot, file).split(path.sep).join('/');
      return predicate(relative) && policyIncludesFile(relative, ctx.tool, ctx.policy.global_exclusions);
    })
    .sort();
}

function configuredMarkerDirectories(ctx: any, markerName: any) {
  return listConfiguredTargetFiles(ctx, (file: any) => path.basename(file) === markerName)
    .map((file: any) => path.dirname(file));
}

/**
 * Detect project type(s) by looking for marker files.
 * A project can be multi-type (e.g. Full-Stack: JS + Python + Docker + Helm).
 *
 * @param {string} repoRoot - Repo root path
 * @param {string|null} modulePath - Optional module subdirectory to narrow scope
 * @returns {{ types: Set<string>, markers: object }}
 */
function detectProjectTypes(repoRoot: any, project: any, globalExclusions: any = []) {
  const scanRoot = requireRepositoryPath(repoRoot, path.resolve(repoRoot, project.root));
  const types = new Set();
  const markers: any = {};

  const candidates = findFiles(scanRoot, () => true, project.discovery_max_depth)
    .map((file: any) => path.relative(scanRoot, file).split(path.sep).join('/'))
    .filter((file: any) => !globalExclusions.some((pattern: any) => matchesPolicyPattern(file, pattern)));
  for (const language of project.languages) {
    const evidence = project.language_evidence[language];
    const matched = evidence.find((pattern: any) => {
      if (!pattern.includes('*')) return fs.existsSync(path.join(scanRoot, pattern));
      return candidates.some((candidate: any) => matchesPolicyPattern(candidate, pattern));
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
function findFiles(dir: any, predicate: any, maxDepth: any = 3, _depth: any = 0) {
  if (_depth > maxDepth) return [];
  if (!fs.existsSync(dir)) return [];
  const results: any[] = [];

  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (error: any) {
    recordDiscoveryDiagnostic({
      status: 'unavailable',
      path: dir,
      reason: selectTruthyValue(() => (error?.message), () => ('missing_error_message')),
    });
    return [];
  }

  for (const entry of entries) {
    if ([entry.name.startsWith('.'), entry.name === 'node_modules'].some(Boolean)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && predicate(entry.name)) {
      results.push(fullPath);
    } else if (entry.isDirectory()) {
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
function resolveScope(ctx: any) {
  if (ctx.changedFiles && ctx.changedFiles.length > 0) {
    // Verify files exist (forge_diff_stat may reference files that were deleted)
    const existing = ctx.changedFiles.filter((f: any) => {
      const abs = path.isAbsolute(f) ? f : path.join(ctx.repoRoot, f);
      requireRepositoryPath(ctx.repoRoot, abs);
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

export {
  detectProjectTypes,
  findFiles,

  configuredTargetPaths,
  configuredMarkerDirectories,
  configuredTargetFilesForScope,
  listConfiguredTargetFiles,
  resolveScope,
  takeDiscoveryDiagnostics,
};
