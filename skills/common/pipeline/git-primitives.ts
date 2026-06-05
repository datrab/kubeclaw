// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { execFileSync } from 'child_process';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { buildSubprocessEnv } from './security.ts';

declare const process: any;

type AnyRecord = Record<string, any>;

const DEFAULT_GIT_TIMEOUT_MS = 30000;
const DEFAULT_GIT_MAX_BUFFER = 50 * 1024 * 1024;

const repoRootCache = new Map();
const headHashCache = new Map();
let defaultRepoRoot: string | null = null;

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

export function getRepoRoot(startDir?: any) {
  const envRepoRoot = process.env.REPO_ROOT ? path.resolve(process.env.REPO_ROOT) : null;
  if ((startDir === undefined || startDir === null || startDir === '') && envRepoRoot) {
    return envRepoRoot;
  }
  const requestedStart = startDir === undefined || startDir === null || startDir === ''
    ? process.cwd()
    : startDir;
  if (envRepoRoot && isPathInsideOrEqual(path.resolve(requestedStart), envRepoRoot)) {
    return envRepoRoot;
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
  const defaults = {
    encoding: 'utf8',
    timeout: DEFAULT_GIT_TIMEOUT_MS,
    maxBuffer: DEFAULT_GIT_MAX_BUFFER,
    env: buildSubprocessEnv(),
  };
  const result = execFileSync('git', ['-C', repoRoot, ...args], { ...defaults, ...opts });
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
