// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { execFileSync } from 'child_process';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { buildSubprocessEnv } from './security.ts';
import { expandSwarmConfig } from './platform-config.ts';

declare const process: any;

type AnyRecord = Record<string, any>;

const DEFAULT_RUNTIME_REPO_ROOT = '/home/node/.openclaw/workspace/git-repo';
const DEFAULT_SWARM_CONFIG_PATH = '/home/node/.openclaw/swarm.config.json';

const repoRootCache = new Map();
const headHashCache = new Map();
let defaultRepoRoot: string | null = null;
let gitRuntimePolicy: AnyRecord | null = null;

function requireNumber(obj: AnyRecord, field: string, label: string): number {
  const value = obj?.[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${label}.${field}: required positive integer in swarm.config.json`);
  }
  return value;
}

function resolveGitRuntimePolicyFromConfig(config: AnyRecord): AnyRecord {
  const command = config?.git?.command;
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    throw new Error('config.git: required platform config object in swarm.config.json');
  }
  return Object.freeze({
    timeout_ms: requireNumber(command, 'timeout_ms', 'config.git.command'),
    max_buffer_bytes: requireNumber(command, 'max_buffer_bytes', 'config.git.command'),
  });
}

function resolveGitRuntimePolicy(): AnyRecord {
  if (gitRuntimePolicy) return gitRuntimePolicy;
  const configPath = process.env.SWARM_CONFIG || DEFAULT_SWARM_CONFIG_PATH;
  gitRuntimePolicy = resolveGitRuntimePolicyFromConfig(expandSwarmConfig(JSON.parse(fs.readFileSync(configPath, 'utf8'))));
  return gitRuntimePolicy;
}

export function setGitRuntimePolicy(policy: AnyRecord | null = null) {
  if (!policy) {
    gitRuntimePolicy = null;
    return;
  }
  gitRuntimePolicy = resolveGitRuntimePolicyFromConfig(policy);
}

function resolveRepoInput(input: any) {
  if (typeof input === 'string') return path.resolve(input);
  if (input?.repo_root) return path.resolve(input.repo_root);
  if (input?.repoRoot) return path.resolve(input.repoRoot);
  if (input?.repo) return path.resolve(input.repo);
  return defaultRepoRoot;
}

function isPathInsideOrEqual(child: string, parent: string) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isPackagedRuntimePath(value: string) {
  const resolved = path.resolve(value);
  return resolved === '/app' || isPathInsideOrEqual(resolved, '/app');
}

function resolveRuntimeRepoRoot() {
  if (process.env.REPO_ROOT) return path.resolve(process.env.REPO_ROOT);
  return fs.existsSync(DEFAULT_RUNTIME_REPO_ROOT) ? DEFAULT_RUNTIME_REPO_ROOT : null;
}

export function getRepoRoot(startDir?: any) {
  const runtimeRepoRoot = resolveRuntimeRepoRoot();
  if ((startDir === undefined || startDir === null || startDir === '') && runtimeRepoRoot) {
    return runtimeRepoRoot;
  }
  const requestedStart = startDir === undefined || startDir === null || startDir === ''
    ? process.cwd()
    : startDir;
  if (runtimeRepoRoot && isPathInsideOrEqual(path.resolve(requestedStart), runtimeRepoRoot)) {
    return runtimeRepoRoot;
  }
  if (runtimeRepoRoot && isPackagedRuntimePath(requestedStart)) {
    return runtimeRepoRoot;
  }
  const cacheKey = path.resolve(requestedStart);
  if (!repoRootCache.has(cacheKey)) {
    repoRootCache.set(
      cacheKey,
      execFileSync('git', ['-C', cacheKey, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        env: buildSubprocessEnv(),
      }).trim(),
    );
  }
  return repoRootCache.get(cacheKey);
}

export function gitExec(repoRoot: any, args: any[], opts: AnyRecord = {}) {
  const policy = repoRoot?.git
    ? resolveGitRuntimePolicyFromConfig(repoRoot)
    : resolveGitRuntimePolicy();
  const resolvedRepoRoot = resolveRepoInput(repoRoot);
  const defaults = {
    encoding: 'utf8',
    timeout: policy.timeout_ms,
    maxBuffer: policy.max_buffer_bytes,
    env: buildSubprocessEnv(),
  };
  const result = execFileSync('git', ['-C', resolvedRepoRoot, ...args], { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}

export function getCurrentBranch(repoRoot: any) {
  let currentBranch;
  try {
    currentBranch = gitExec(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch (_error) {
    currentBranch = 'HEAD';
  }

  if (!currentBranch || currentBranch === 'HEAD') {
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
  defaultRepoRoot = repoRoot ? path.resolve(repoRoot) : null;
  if (defaultRepoRoot) headHashCache.delete(defaultRepoRoot);
}

export function headHash(repoRootOrConfig: any = null) {
  const repoRoot = resolveRepoInput(repoRootOrConfig);
  if (!repoRoot) return null;
  if (headHashCache.has(repoRoot)) return headHashCache.get(repoRoot);
  try {
    const hash = gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']);
    headHashCache.set(repoRoot, hash);
    return hash;
  } catch (_error) {
    return null;
  }
}

export function invalidateHeadHash(repoRootOrConfig: any = null) {
  const repoRoot = resolveRepoInput(repoRootOrConfig);
  if (repoRoot) headHashCache.delete(repoRoot);
  else headHashCache.clear();
}
