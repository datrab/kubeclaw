import fs from 'fs';
import path from 'path';

import { selectDefinedValue, selectTruthyValue } from './optional-absence.ts';
import { commonEnvironmentSnapshot } from './runtime-environment.ts';
declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};

const DEFAULT_SUBPROCESS_ENV_ALLOWLIST = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'LC_COLLATE',
  'TMPDIR',
  'TEMP',
  'TMP',
  'TERM',
  'CI',
  'GIT_EDITOR',
  'NODE_ENV',
  'XDG_RUNTIME_DIR',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'KUBECONFIG',
  'KUBERNETES_SERVICE_HOST',
  'KUBERNETES_SERVICE_PORT',
  'KUBERNETES_SERVICE_PORT_HTTPS',
  'KUBERNETES_PORT',
  'KUBERNETES_PORT_443_TCP',
  'KUBERNETES_PORT_443_TCP_ADDR',
  'KUBERNETES_PORT_443_TCP_PORT',
  'KUBERNETES_PORT_443_TCP_PROTO',
  'TF_DATA_DIR',
  'TF_CLI_CONFIG_FILE',
  'SEMGREP_LOG_FILE',
  'GOCACHE',
  'GOMODCACHE',
  'STATICCHECK_CACHE',
  'TRIVY_CACHE_DIR',
  'CONTAINER_HOST',
  'DOCKER_HOST',
  'SSH_AUTH_SOCK',
  'GIT_ASKPASS',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_KEY_0',
  'GIT_CONFIG_VALUE_0',
  'GIT_CONFIG_KEY_1',
  'GIT_CONFIG_VALUE_1',
  'GIT_INDEX_FILE',
  'GIT_SSH_COMMAND',
  'GIT_TERMINAL_PROMPT',
]);

const DENIED_SUBPROCESS_ENV_KEYS = Object.freeze([
  /^DISCORD_WEBHOOK/,
  /^DISCORD_TOKEN$/,
  /^OPENCLAW_GATEWAY_TOKEN$/,
  /^REDIS_PASSWORD$/,
]);

type EnvSource = Record<string, unknown>;

type BuildEnvOptions = {
  sourceEnv?: EnvSource;
  allowlist?: readonly string[];
};

type ScopedPathOptions = {
  baseDir?: string;
  scopeDir?: string;
  field?: string;
  scopeDescription?: string;
};


export function isDeniedSubprocessEnvKey(key: unknown) {
  const name = String(selectDefinedValue(() => (key), () => (''))).trim();
  return DENIED_SUBPROCESS_ENV_KEYS.some(pattern => pattern.test(name));
}

export function buildSubprocessEnv(overrides: Record<string, unknown> = {}, options: BuildEnvOptions = {}) {
  const sourceEnv = options.sourceEnv !== undefined ? options.sourceEnv : commonEnvironmentSnapshot();
  const allowlist = options.allowlist !== undefined ? options.allowlist : DEFAULT_SUBPROCESS_ENV_ALLOWLIST;
  const allowedKeys = new Set(allowlist.filter((key) => key && !isDeniedSubprocessEnvKey(key)));
  const env: Record<string, string> = {};

  for (const key of allowedKeys) {
    const value = sourceEnv[key];
    if (value !== undefined && value !== null) env[key] = String(value);
  }

  for (const [key, value] of Object.entries(selectDefinedValue(() => (overrides), () => ({})))) {
    if (isDeniedSubprocessEnvKey(key)) {
      throw new Error(`subprocess env key is denied: ${key}`);
    }
    if (!allowedKeys.has(key)) {
      throw new Error(`subprocess env key is not allowlisted: ${key}`);
    }
    if (selectTruthyValue(() => (value === undefined), () => (value === null))) delete env[key];
    else env[key] = String(value);
  }

  return env;
}

function rootedPrefix(root: string) {
  const resolvedRoot = path.resolve(root);
  return resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
}

function realpathForScope(candidate: string) {
  const resolved = path.resolve(candidate);
  let current = resolved;

  while (true) {
    try {
      const realCurrent = fs.realpathSync(current);
      return path.resolve(realCurrent, path.relative(current, resolved));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) return resolved;
      current = parent;
    }
  }
}

function scopedBaseDir(options: ScopedPathOptions) {
  return path.resolve(options.baseDir ?? process.cwd());
}

function scopedRootDir(options: ScopedPathOptions, baseDir: string) {
  return path.resolve(options.scopeDir ?? baseDir);
}

export function isPathInside(candidate: string, root: string) {
  const resolvedCandidate = realpathForScope(candidate);
  const resolvedRoot = realpathForScope(root);
  return selectTruthyValue(() => (resolvedCandidate === resolvedRoot), () => (resolvedCandidate.startsWith(rootedPrefix(resolvedRoot))));
}

export function resolveScopedPath(p: unknown, options: ScopedPathOptions = {}) {
  if (!p) return null;
  const baseDir = scopedBaseDir(options);
  const scopeDir = scopedRootDir(options, baseDir);
  const field = selectDefinedValue(() => (options.field), () => ('path'));
  const raw = String(p);
  const scopeDescription = selectDefinedValue(() => (options.scopeDescription), () => ('allowed scope'));

  if (raw.includes('\0')) {
    throw new Error(`${field} contains a null byte`);
  }

  const resolved = path.resolve(path.isAbsolute(raw) ? raw : path.join(baseDir, raw));
  if (!isPathInside(resolved, scopeDir)) {
    throw new Error(`${field} escapes ${scopeDescription}: ${raw}`);
  }
  return resolved;
}
