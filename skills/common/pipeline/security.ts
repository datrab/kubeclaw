// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};

const DEFAULT_ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/', '/sandbox/', '/tmp/'];
const SHELL_META_PATTERN = /[;&|<>`]/;
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
  'NODE_ENV',
  'XDG_RUNTIME_DIR',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'KUBECONFIG',
  'CONTAINER_HOST',
  'DOCKER_HOST',
  'SSH_AUTH_SOCK',
]);

const DENIED_SUBPROCESS_ENV_KEYS = Object.freeze([
  /^DISCORD_WEBHOOK/,
  /^DISCORD_TOKEN$/,
  /^GATEWAY_TOKEN$/,
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

type AllowedPathOptions = {
  allowedPrefixes?: readonly string[];
};

export function isDeniedSubprocessEnvKey(key: unknown) {
  const name = String(key || '').trim();
  return DENIED_SUBPROCESS_ENV_KEYS.some(pattern => pattern.test(name));
}

export function buildSubprocessEnv(overrides: Record<string, unknown> = {}, options: BuildEnvOptions = {}) {
  const sourceEnv = options.sourceEnv || process.env;
  const allowlist = options.allowlist || DEFAULT_SUBPROCESS_ENV_ALLOWLIST;
  const allowedKeys = new Set(allowlist.filter((key) => key && !isDeniedSubprocessEnvKey(key)));
  const env: Record<string, string> = {};

  for (const key of allowedKeys) {
    const value = sourceEnv[key];
    if (value !== undefined && value !== null) env[key] = String(value);
  }

  for (const [key, value] of Object.entries(overrides || {})) {
    if (isDeniedSubprocessEnvKey(key)) {
      throw new Error(`subprocess env key is denied: ${key}`);
    }
    if (!allowedKeys.has(key)) {
      throw new Error(`subprocess env key is not allowlisted: ${key}`);
    }
    if (value === undefined || value === null) delete env[key];
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

export function isPathInside(candidate: string, root: string) {
  const resolvedCandidate = realpathForScope(candidate);
  const resolvedRoot = realpathForScope(root);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(rootedPrefix(resolvedRoot));
}

export function resolveScopedPath(p: unknown, options: ScopedPathOptions = {}) {
  if (!p) return null;
  const baseDir = path.resolve(options.baseDir || options.scopeDir || process.cwd());
  const scopeDir = path.resolve(options.scopeDir || baseDir);
  const field = options.field || 'path';
  const raw = String(p);
  const scopeDescription = options.scopeDescription || 'allowed scope';

  if (raw.includes('\0')) {
    throw new Error(`${field} contains a null byte`);
  }

  const resolved = path.resolve(path.isAbsolute(raw) ? raw : path.join(baseDir, raw));
  if (!isPathInside(resolved, scopeDir)) {
    throw new Error(`${field} escapes ${scopeDescription}: ${raw}`);
  }
  return resolved;
}

function normalizeAllowedPrefix(prefix: string) {
  const resolved = path.resolve(prefix);
  return resolved.endsWith(path.sep) ? resolved : `${resolved}${path.sep}`;
}

export function validateAllowedPath(filePath: unknown, label: string, opts: AllowedPathOptions = {}) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error(`${label}: path is empty or not a string`);
  }
  const normalized = path.resolve(filePath);
  const allowedPrefixes = (opts.allowedPrefixes || DEFAULT_ALLOWED_PATH_PREFIXES).map(normalizeAllowedPrefix);
  const realNormalized = realpathForScope(normalized);
  const allowed = allowedPrefixes.some((prefix) => isPathInside(realNormalized, prefix.slice(0, -1)));
  if (!allowed) {
    throw new Error(
      `${label}: path '${normalized}' not in allowed prefixes [${allowedPrefixes.join(', ')}]`
    );
  }
  return normalized;
}

export function tokenizeCommandString(command: unknown, label = 'command') {
  if (!command || typeof command !== 'string') {
    throw new Error(`${label}: command is empty or not a string`);
  }

  const trimmed = command.trim();
  if (!trimmed) throw new Error(`${label}: command is empty`);
  if (/[\r\n\0]/.test(trimmed)) throw new Error(`${label}: command contains newline or null-byte characters`);
  if (SHELL_META_PATTERN.test(trimmed) || trimmed.includes('$(') || trimmed.includes('${')) {
    throw new Error(`${label}: shell metacharacters are not allowed; pass a direct executable and args only`);
  }

  const argv: string[] = [];
  let current = '';
  let quote: string | null = null;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i] as string;
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      if (ch === '\\' && quote === '"' && i + 1 < trimmed.length) {
        current += trimmed[i + 1] as string;
        i += 1;
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        argv.push(current);
        current = '';
      }
      continue;
    }
    if (ch === '\\') {
      if (i + 1 >= trimmed.length) throw new Error(`${label}: trailing escape is not allowed`);
      current += trimmed[i + 1] as string;
      i += 1;
      continue;
    }
    current += ch;
  }

  if (quote) throw new Error(`${label}: unterminated quote in command`);
  if (current) argv.push(current);
  if (argv.length === 0) throw new Error(`${label}: command produced no argv tokens`);
  return argv;
}
