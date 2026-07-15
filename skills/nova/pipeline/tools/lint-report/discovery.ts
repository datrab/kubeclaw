import fs from 'fs';
import path from 'path';

import { discoverPlatformSwarmConfigCandidates } from '../../core/platform-config.ts';
import { log } from './output.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
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
const YAML_FILE_EXTENSIONS = ['.yaml', '.yml'];

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

function discoverPlatformSemgrepConfigCandidates() {
  const candidates = [
    ...discoverPlatformSwarmConfigCandidates().map(swarmConfigPath => path.join(path.dirname(swarmConfigPath), '.semgrep.yml')),
    '/home/node/.openclaw/.semgrep.yml',
  ];

  return [...new Set(candidates.filter(Boolean))];
}

function discoverPlatformEslintConfigCandidates() {
  const candidates = [
    ...discoverPlatformSwarmConfigCandidates().map(swarmConfigPath => path.join(path.dirname(swarmConfigPath), 'eslint.config.mjs')),
    '/home/node/.openclaw/eslint.config.mjs',
  ];

  return [...new Set(candidates.filter(Boolean))];
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
    LINT_POLICY_IGNORED_PATH_SEGMENTS.some(segment => normalized.includes(segment)),
    LINT_POLICY_IGNORED_FILE_PATTERNS.some(pattern => pattern.test(normalized)),
  ].some(Boolean);
}

function listPolicySourceFiles(scanRoot) {
  return findFiles(scanRoot, f => /\.(js|jsx|ts|tsx|mjs|cjs)$/.test(f), 12)
    .filter(file => !isPolicyIgnoredFile(file));
}

/**
 * Detect project type(s) by looking for marker files.
 * A project can be multi-type (e.g. Full-Stack: JS + Python + Docker + Helm).
 *
 * @param {string} repoRoot - Repo root path
 * @param {string|null} modulePath - Optional module subdirectory to narrow scope
 * @returns {{ types: Set<string>, markers: object }}
 */
function detectProjectTypes(repoRoot, modulePath) {
  const scanRoot = modulePath ? path.join(repoRoot, modulePath) : repoRoot;
  const types = new Set();
  const markers = {};

  const checks = [
    { file: 'tsconfig.json',       type: 'typescript', search: [scanRoot, repoRoot] },
    { file: 'package.json',        type: 'javascript', search: [scanRoot, repoRoot] },
    { file: 'pyproject.toml',      type: 'python',     search: [scanRoot, repoRoot] },
    { file: 'requirements.txt',    type: 'python',     search: [scanRoot, repoRoot] },
    { file: 'setup.py',            type: 'python',     search: [scanRoot, repoRoot] },
  ];

  for (const check of checks) {
    for (const dir of check.search) {
      const fullPath = path.join(dir, check.file);
      if (fs.existsSync(fullPath)) {
        types.add(check.type);
        markers[check.type] = fullPath;
        break;
      }
    }
  }

  // Helm chart detection — match helm-lint's recursive chart discovery.
  const chartFiles = findFiles(scanRoot, f => f === 'Chart.yaml', 3);
  if (chartFiles.length > 0) {
    types.add('helm');
    markers.helm = chartFiles[0];
  }

  // Dockerfile detection — can be anywhere in the tree
  const dockerfiles = findFiles(scanRoot, f => /^Dockerfile|\.dockerfile$/i.test(f), 3);
  if (dockerfiles.length > 0) {
    types.add('docker');
    markers.docker = dockerfiles[0];
  }

  // Shell script detection — look for .sh files
  const shellFiles = findFiles(scanRoot, f => f.endsWith('.sh'), 3);
  if (shellFiles.length > 0) {
    types.add('shell');
    markers.shell = shellFiles[0];
  }

  // YAML detection — always true if any .yaml/.yml exists (for yamllint)
  const yamlFiles = findFiles(scanRoot, f => YAML_FILE_EXTENSIONS.some(extension => f.endsWith(extension)), 2);
  if (yamlFiles.length > 0) {
    types.add('yaml');
  }

  log('INFO', `Detected project types: ${[...types].join(', ')}`, { markers });
  return { types, markers };
}

/**
 * Find files matching a predicate, with max depth.
 * Lightweight alternative to glob — no dependencies.
 */
function findFiles(dir, predicate, maxDepth = 3, _depth = 0) {
  if (_depth > maxDepth) return [];
  if (!fs.existsSync(dir)) return [];
  const results = [];

  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (error) {
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
function resolveScope(ctx) {
  if (ctx.changedFiles && ctx.changedFiles.length > 0) {
    // Verify files exist (forge_diff_stat may reference files that were deleted)
    const existing = ctx.changedFiles.filter(f => {
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

export {
  detectProjectTypes,
  discoverPlatformEslintConfigCandidates,
  discoverPlatformSemgrepConfigCandidates,
  discoverPlatformSwarmConfigCandidates,
  findFiles,
  findNearestTsconfigDir,
  listPolicySourceFiles,
  resolveScope,
  takeDiscoveryDiagnostics,
};
