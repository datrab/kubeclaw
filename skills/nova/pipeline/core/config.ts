import fs from 'node:fs';
import path from 'node:path';
import { log } from './logger.ts';
import { loadPlatformSwarmConfig, normalizeSwarmConfigInPlace } from './platform-config.ts';
import { assertSafePathSegment } from './paths.ts';
import { getRepoRoot, setGitRuntimePolicy, setRepoRoot } from './git-context.ts';
import { validateRuntimeConfig } from './config-validation-runtime.ts';
import { validateServiceConfig } from './config-validation-services.ts';
import { validateAgentObservability } from './config-validation-observability.ts';
import { validateConfigBoundary } from './config-validation-boundary.ts';
import { validateProgressAndRegistry } from './config-validation-progress.ts';
import { ConfigValidation } from './config-validation-values.ts';
import type { AnyRecord } from './config-validation-values.ts';

declare const process: any;

function resolveConfiguredRepoRoot(opts: AnyRecord): string | null {
  if (opts.repoRoot !== undefined && opts.repoRoot !== null && String(opts.repoRoot).trim()) {
    return String(opts.repoRoot);
  }
  const envRepoRoot = process.env.REPO_ROOT;
  return envRepoRoot !== undefined && envRepoRoot !== null && String(envRepoRoot).trim()
    ? String(envRepoRoot)
    : null;
}

function resolveRepoRoot(opts: AnyRecord) {
  const configured = resolveConfiguredRepoRoot(opts);
  if (configured) {
    const repoRoot = path.resolve(configured);
    if (!fs.existsSync(path.join(repoRoot, '.git'))) {
      throw new Error(`Repo root '${repoRoot}' is not a git repository (no .git directory)`);
    }
    log('INFO', `Repo root from ${opts.repoRoot ? '--repo flag' : 'REPO_ROOT env'}: ${repoRoot}`);
    return repoRoot;
  }
  try {
    return getRepoRoot();
  } catch (_error) {
    throw new Error(
      'Cannot determine repo root. Either:\n'
      + '  --repo <path>        Pass the repo path explicitly\n'
      + '  REPO_ROOT=<path>     Set as environment variable\n'
      + '  cd <repo>            Run from within the git repo',
    );
  }
}

function projectPaths(repoRoot: string, projectName: string) {
  const projectSrcDir = path.join(repoRoot, 'Projects', projectName, 'src');
  const swarmDir = path.join(projectSrcDir, '.swarm');
  return {
    project_src_dir: projectSrcDir,
    swarm_dir: swarmDir,
    modules_dir: path.join(swarmDir, 'modules'),
    progress_file: path.join(swarmDir, 'progress.json'),
  };
}

function readProgress(paths: AnyRecord, projectName: string) {
  if (!fs.existsSync(paths.progress_file)) {
    throw new Error(
      `Progress file not found: ${paths.progress_file}\n`
      + `  Expected at: <repo>/Projects/${projectName}/src/.swarm/progress.json`,
    );
  }
  return JSON.parse(fs.readFileSync(paths.progress_file, 'utf8'));
}

export function loadConfig(projectName: any, opts: AnyRecord = {}) {
  if (!projectName) throw new Error('Project name required. Use --project <n> or set CURRENT_PROJECT env.');
  const project = assertSafePathSegment(projectName, 'project name');
  const repoRoot = resolveRepoRoot(opts);
  if (!repoRoot) throw new Error('Cannot determine repo root');
  const { config: swarmConfig } = loadPlatformSwarmConfig(opts.swarmConfigPath);
  const paths = projectPaths(repoRoot, project);
  const progress = readProgress(paths, project);
  const config = { ...swarmConfig, project, repo_root: repoRoot, paths };
  const pluginRegistry = validateConfig(config, progress);
  Object.defineProperty(config, 'pluginRegistry', {
    value: pluginRegistry,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  log('INFO', `[plugins] startup registry ready: ${pluginRegistry.summary.enabledModules}/${pluginRegistry.summary.discoveredModules} modules enabled, ${pluginRegistry.summary.stageOwnerCount} stage owner(s)`);
  setRepoRoot(config.repo_root);
  setGitRuntimePolicy(config);
  return { config, progress, pluginRegistry };
}

export function validateConfig(config: AnyRecord, progress: AnyRecord) {
  normalizeSwarmConfigInPlace(config);
  const validation = new ConfigValidation();
  validateRuntimeConfig(config, validation);
  validateServiceConfig(config, validation);
  validateAgentObservability(config, validation);
  validateConfigBoundary(config, validation);
  const registry = validateProgressAndRegistry(config, progress, validation);
  if (validation.errors.length > 0) {
    config._validationErrors = validation.errors;
    throw new Error(
      `Config validation failed with ${validation.errors.length} error(s):\n`
      + validation.errors.map((error) => `  - ${error}`).join('\n'),
    );
  }
  return registry;
}
