import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { buildSubprocessEnv } from './security.js';
import { expandSwarmConfig } from './platform-config.js';
import { readCommonEnvironment } from './runtime-environment.js';

import { selectDefinedValue, selectTruthyValue } from './optional-absence.js';
declare const process: any;

type AnyRecord = Record<string, any>;

const DEFAULT_RUNTIME_REPO_ROOT = '/home/node/.openclaw/workspace/git-repo';
const DEFAULT_SWARM_CONFIG_PATH = '/home/node/.openclaw/swarm.config.json';

const gitPrimitiveState: {
  repoRootCache: Map<any, any>;
  headHashCache: Map<any, any>;
  defaultRepoRoot: string | null;
  runtimePolicy: AnyRecord | null;
} = {
  repoRootCache: new Map(),
  headHashCache: new Map(),
  defaultRepoRoot: null,
  runtimePolicy: null,
};

function requireNumber(obj: AnyRecord, field: string, label: string): number {
  const value = obj?.[field];
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value)))), () => (value <= 0))), () => (!Number.isInteger(value)))) {
    throw new Error(`${label}.${field}: required positive integer in swarm.config.json`);
  }
  return value;
}

function resolveGitRuntimePolicyFromConfig(config: AnyRecord): AnyRecord {
  const command = config?.git?.command;
  if (selectTruthyValue(() => (selectTruthyValue(() => (!command), () => (typeof command !== 'object'))), () => (Array.isArray(command)))) {
    throw new Error('config.git: required platform config object in swarm.config.json');
  }
  return Object.freeze({
    timeout_ms: requireNumber(command, 'timeout_ms', 'config.git.command'),
    max_buffer_bytes: requireNumber(command, 'max_buffer_bytes', 'config.git.command'),
  });
}

function resolveGitRuntimePolicy(): AnyRecord {
  if (gitPrimitiveState.runtimePolicy) return gitPrimitiveState.runtimePolicy;
  const configuredPath = readCommonEnvironment('SWARM_CONFIG');
  const configPath = configuredPath !== undefined && configuredPath !== null && String(configuredPath).trim()
    ? String(configuredPath)
    : DEFAULT_SWARM_CONFIG_PATH;
  gitPrimitiveState.runtimePolicy = resolveGitRuntimePolicyFromConfig(expandSwarmConfig(JSON.parse(fs.readFileSync(configPath, 'utf8'))));
  return gitPrimitiveState.runtimePolicy;
}

export function setGitRuntimePolicy(policy: AnyRecord | null = null) {
  if (!policy) {
    gitPrimitiveState.runtimePolicy = null;
    return;
  }
  gitPrimitiveState.runtimePolicy = resolveGitRuntimePolicyFromConfig(policy);
}

function resolveRepoInput(input: any) {
  if (typeof input === 'string') return path.resolve(input);
  if (input?.repo_root) return path.resolve(input.repo_root);
  if (input?.repoRoot) return path.resolve(input.repoRoot);
  if (input?.repo) return path.resolve(input.repo);
  return gitPrimitiveState.defaultRepoRoot;
}

function isPathInsideOrEqual(child: string, parent: string) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return selectTruthyValue(() => (rel === ''), () => ((!rel.startsWith('..') && !path.isAbsolute(rel))));
}

function isPackagedRuntimePath(value: string) {
  const resolved = path.resolve(value);
  return selectTruthyValue(() => (resolved === '/app'), () => (isPathInsideOrEqual(resolved, '/app')));
}

function resolveRuntimeRepoRoot() {
  const configuredRoot = readCommonEnvironment('REPO_ROOT');
  if (configuredRoot) return path.resolve(configuredRoot);
  return fs.existsSync(DEFAULT_RUNTIME_REPO_ROOT) ? DEFAULT_RUNTIME_REPO_ROOT : null;
}

export function getRepoRoot(startDir?: any) {
  const runtimeRepoRoot = resolveRuntimeRepoRoot();
  if ((selectTruthyValue(() => (selectTruthyValue(() => (startDir === undefined), () => (startDir === null))), () => (startDir === ''))) && runtimeRepoRoot) {
    return runtimeRepoRoot;
  }
  const requestedStart = selectTruthyValue(() => (selectTruthyValue(() => (startDir === undefined), () => (startDir === null))), () => (startDir === ''))
    ? process.cwd()
    : startDir;
  if (runtimeRepoRoot && isPathInsideOrEqual(path.resolve(requestedStart), runtimeRepoRoot)) {
    return runtimeRepoRoot;
  }
  if (runtimeRepoRoot && isPackagedRuntimePath(requestedStart)) {
    return runtimeRepoRoot;
  }
  const cacheKey = path.resolve(requestedStart);
  if (!gitPrimitiveState.repoRootCache.has(cacheKey)) {
    gitPrimitiveState.repoRootCache.set(
      cacheKey,
      execFileSync('git', ['-C', cacheKey, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        env: buildSubprocessEnv(),
      }).trim(),
    );
  }
  return gitPrimitiveState.repoRootCache.get(cacheKey);
}

export function gitExec(repoRoot: any, args: any[], opts: AnyRecord = {}) {
  const policy = repoRoot?.git
    ? resolveGitRuntimePolicyFromConfig(repoRoot)
    : resolveGitRuntimePolicy();
  const resolvedRepoRoot = resolveRepoInput(repoRoot);
  if (!resolvedRepoRoot) throw new Error('gitExec requires an explicit repository root');
  const defaults = {
    encoding: 'utf8' as const,
    timeout: policy.timeout_ms,
    maxBuffer: policy.max_buffer_bytes,
    env: buildSubprocessEnv(),
  };
  const result = execFileSync('git', ['-C', resolvedRepoRoot, ...args], { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}

export function getCurrentBranch(repoRoot: any) {
  let currentBranch: string;
  try {
    currentBranch = gitExec(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch (_error) {
    currentBranch = 'HEAD';
  }

  if (selectTruthyValue(() => (!currentBranch), () => (currentBranch === 'HEAD'))) {
    try {
      const refs = gitExec(repoRoot, [
        'for-each-ref', '--format=%(refname:short)',
        '--sort=-committerdate', '--points-at=HEAD', 'refs/remotes/origin/',
      ]);
      const realRef = refs.split('\n').find((ref: any) => ref && ref !== 'origin/HEAD');
      currentBranch = realRef ? realRef.replace('origin/', '') : 'main';
    } catch (_error) {
      currentBranch = 'main';
    }
  }

  return currentBranch;
}

export function setRepoRoot(repoRoot: any) {
  gitPrimitiveState.defaultRepoRoot = repoRoot ? path.resolve(repoRoot) : null;
  if (gitPrimitiveState.defaultRepoRoot) gitPrimitiveState.headHashCache.delete(gitPrimitiveState.defaultRepoRoot);
}

export function headHash(repoRootOrConfig: any = null) {
  const repoRoot = resolveRepoInput(repoRootOrConfig);
  if (!repoRoot) return null;
  if (gitPrimitiveState.headHashCache.has(repoRoot)) return gitPrimitiveState.headHashCache.get(repoRoot);
  try {
    const hash = gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']);
    gitPrimitiveState.headHashCache.set(repoRoot, hash);
    return hash;
  } catch (_error) { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): this optional probe converts unreadable or absent input to explicit absence. */
    return null;
  }
}

export function invalidateHeadHash(repoRootOrConfig: any = null) {
  const repoRoot = resolveRepoInput(repoRootOrConfig);
  if (repoRoot) gitPrimitiveState.headHashCache.delete(repoRoot);
  else gitPrimitiveState.headHashCache.clear();
}
