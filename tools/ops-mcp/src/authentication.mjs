import { createHash, timingSafeEqual } from 'node:crypto';
import { closeSync, openSync, readSync } from 'node:fs';

function validate(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9._~-]{32,512}$/.test(token)) {
    throw new Error('Ops MCP requires a bearer token of 32–512 URL-safe characters');
  }
  return token;
}

function fileToken(file) {
  const descriptor = openSync(file, 'r');
  try {
    // Kubernetes Secret volumes rotate symlinks. Reopen the path on every
    // request instead of caching an inode or a credential from startup.
    const bytes = Buffer.alloc(514);
    const length = readSync(descriptor, bytes, 0, bytes.length, 0);
    if (length === bytes.length) throw new Error('Ops MCP bearer token file exceeds its limit');
    return validate(bytes.subarray(0, length).toString('utf8').trim());
  } finally { closeSync(descriptor); }
}

export function createBearerAuthorization({ file, token } = {}) {
  if (file && token) throw new Error('Configure exactly one Ops MCP bearer token source');
  const read = file ? () => fileToken(file) : () => validate(token);
  read(); // Refuse to listen without authentication, including behind a tunnel.
  const digest = value => createHash('sha256').update(value).digest();
  return {
    ready() {
      try { read(); return true; } catch { return false; }
    },
    authorized(header) {
      if (typeof header !== 'string' || header.length > 519) return false;
      try { return timingSafeEqual(digest(header), digest(`Bearer ${read()}`)); }
      catch { return false; } // Missing or invalid rotated files never disable auth.
    },
  };
}
