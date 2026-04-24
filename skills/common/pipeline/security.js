import path from 'path';

const DEFAULT_ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/', '/sandbox/', '/tmp/'];
const SHELL_META_PATTERN = /[;&|<>`]/;

function normalizeAllowedPrefix(prefix) {
  const resolved = path.resolve(prefix);
  return resolved.endsWith(path.sep) ? resolved : `${resolved}${path.sep}`;
}

export function validateAllowedPath(filePath, label, opts = {}) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error(`${label}: path is empty or not a string`);
  }
  const normalized = path.resolve(filePath);
  const allowedPrefixes = (opts.allowedPrefixes || DEFAULT_ALLOWED_PATH_PREFIXES).map(normalizeAllowedPrefix);
  const allowed = allowedPrefixes.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
  if (!allowed) {
    throw new Error(
      `${label}: path '${normalized}' not in allowed prefixes [${allowedPrefixes.join(', ')}]`
    );
  }
  return normalized;
}

export function tokenizeCommandString(command, label = 'command') {
  if (!command || typeof command !== 'string') {
    throw new Error(`${label}: command is empty or not a string`);
  }

  const trimmed = command.trim();
  if (!trimmed) throw new Error(`${label}: command is empty`);
  if (/[\r\n\0]/.test(trimmed)) throw new Error(`${label}: command contains newline or null-byte characters`);
  if (SHELL_META_PATTERN.test(trimmed) || trimmed.includes('$(') || trimmed.includes('${')) {
    throw new Error(`${label}: shell metacharacters are not allowed; pass a direct executable and args only`);
  }

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

    if (ch === '"' || ch === '\'') {
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
      current += trimmed[i + 1];
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
