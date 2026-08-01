import fs from 'fs';
import path from 'path';
import { selectDefinedValue, selectTruthyValue } from './optional-absence.js';
import { commonEnvironmentSnapshot } from './runtime-environment.js';
const DEFAULT_ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/', '/tmp/'];
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
export function isDeniedSubprocessEnvKey(key) {
    const name = String(selectDefinedValue(() => (key), () => (''))).trim();
    return DENIED_SUBPROCESS_ENV_KEYS.some(pattern => pattern.test(name));
}
export function buildSubprocessEnv(overrides = {}, options = {}) {
    const sourceEnv = options.sourceEnv !== undefined ? options.sourceEnv : commonEnvironmentSnapshot();
    const allowlist = options.allowlist !== undefined ? options.allowlist : DEFAULT_SUBPROCESS_ENV_ALLOWLIST;
    const allowedKeys = new Set(allowlist.filter((key) => key && !isDeniedSubprocessEnvKey(key)));
    const env = {};
    for (const key of allowedKeys) {
        const value = sourceEnv[key];
        if (value !== undefined && value !== null)
            env[key] = String(value);
    }
    for (const [key, value] of Object.entries(selectDefinedValue(() => (overrides), () => ({})))) {
        if (isDeniedSubprocessEnvKey(key)) {
            throw new Error(`subprocess env key is denied: ${key}`);
        }
        if (!allowedKeys.has(key)) {
            throw new Error(`subprocess env key is not allowlisted: ${key}`);
        }
        if (selectTruthyValue(() => (value === undefined), () => (value === null)))
            delete env[key];
        else
            env[key] = String(value);
    }
    return env;
}
function rootedPrefix(root) {
    const resolvedRoot = path.resolve(root);
    return resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
}
function realpathForScope(candidate) {
    const resolved = path.resolve(candidate);
    let current = resolved;
    while (true) {
        try {
            const realCurrent = fs.realpathSync(current);
            return path.resolve(realCurrent, path.relative(current, resolved));
        }
        catch (error) {
            const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
            if (code !== 'ENOENT')
                throw error;
            const parent = path.dirname(current);
            if (parent === current)
                return resolved;
            current = parent;
        }
    }
}
function scopedBaseDir(options) {
    return path.resolve(options.baseDir ?? process.cwd());
}
function scopedRootDir(options, baseDir) {
    return path.resolve(options.scopeDir ?? baseDir);
}
function allowedPathPrefixes(opts = {}) {
    const prefixes = opts.allowedPrefixes ?? DEFAULT_ALLOWED_PATH_PREFIXES;
    return prefixes.map(normalizeAllowedPrefix);
}
export function isPathInside(candidate, root) {
    const resolvedCandidate = realpathForScope(candidate);
    const resolvedRoot = realpathForScope(root);
    return selectTruthyValue(() => (resolvedCandidate === resolvedRoot), () => (resolvedCandidate.startsWith(rootedPrefix(resolvedRoot))));
}
export function resolveScopedPath(p, options = {}) {
    if (!p)
        return null;
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
function normalizeAllowedPrefix(prefix) {
    const resolved = path.resolve(prefix);
    return resolved.endsWith(path.sep) ? resolved : `${resolved}${path.sep}`;
}
export function validateAllowedPath(filePath, label, opts = {}) {
    if (typeof filePath !== 'string' || !filePath) {
        throw new Error(`${label}: path is empty or not a string`);
    }
    const normalized = path.resolve(filePath);
    const allowedPrefixes = allowedPathPrefixes(opts);
    const realNormalized = realpathForScope(normalized);
    const allowed = allowedPrefixes.some((prefix) => isPathInside(realNormalized, prefix.slice(0, -1)));
    if (!allowed) {
        throw new Error(`${label}: path '${normalized}' not in allowed prefixes [${allowedPrefixes.join(', ')}]`);
    }
    return normalized;
}
export function tokenizeCommandString(command, label = 'command') {
    if (Array.isArray(command)) {
        if (command.length === 0)
            throw new Error(`${label}: argv array is empty`);
        const argv = command.map((part, index) => {
            if (selectTruthyValue(() => (typeof part !== 'string'), () => (part.trim() === ''))) {
                throw new Error(`${label}[${index}]: argv entry must be a non-empty string`);
            }
            if (/[\r\n\0]/.test(part)) {
                throw new Error(`${label}[${index}]: argv entry contains newline or null-byte characters`);
            }
            return part;
        });
        return argv;
    }
    if (typeof command !== 'string' || !command) {
        throw new Error(`${label}: command is empty or not a string`);
    }
    const trimmed = command.trim();
    if (!trimmed)
        throw new Error(`${label}: command is empty`);
    if (/[\r\n\0]/.test(trimmed))
        throw new Error(`${label}: command contains newline or null-byte characters`);
    if (selectTruthyValue(() => (selectTruthyValue(() => (SHELL_META_PATTERN.test(trimmed)), () => (trimmed.includes('$(')))), () => (trimmed.includes('${')))) {
        throw new Error(`${label}: shell metacharacters are not allowed; pass a direct executable and args only`);
    }
    return parseCommandTokens(trimmed, label);
}
function parseCommandTokens(trimmed, label) {
    const argv = [];
    let current = '';
    let quote = null;
    for (let i = 0; i < trimmed.length; i += 1) {
        const ch = trimmed[i];
        if (quote) {
            if (ch === quote) {
                quote = null;
                continue;
            }
            if (ch === '\\' && quote === '"' && i + 1 < trimmed.length) {
                current += trimmed[i + 1];
                i += 1;
                continue;
            }
            current += ch;
            continue;
        }
        if (selectTruthyValue(() => (ch === '"'), () => (ch === "'"))) {
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
            if (i + 1 >= trimmed.length)
                throw new Error(`${label}: trailing escape is not allowed`);
            current += trimmed[i + 1];
            i += 1;
            continue;
        }
        current += ch;
    }
    if (quote)
        throw new Error(`${label}: unterminated quote in command`);
    if (current)
        argv.push(current);
    if (argv.length === 0)
        throw new Error(`${label}: command produced no argv tokens`);
    return argv;
}
