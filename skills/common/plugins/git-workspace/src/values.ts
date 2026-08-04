import fs from 'node:fs';
import path from 'node:path';

function inside(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function identityValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 320 || value.includes('\0') || /[\r\n]/.test(value)) throw new Error(`GIT_CONFIG_INVALID:${label}`);
  return value;
}

export function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`GIT_CONFIG_INVALID:${label}`);
  return Number(value);
}

export function canonicalExistingDirectory(value: unknown, label: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) throw new Error(`GIT_CONFIG_INVALID:${label}`);
  const stats = fs.lstatSync(value);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`GIT_CONFIG_INVALID:${label}`);
  const canonical = fs.realpathSync(value);
  if (canonical !== value) throw new Error(`GIT_CONFIG_NONCANONICAL:${label}`);
  return canonical;
}

export function canonicalExecutable(value: unknown): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) throw new Error('GIT_CONFIG_INVALID:gitExecutable');
  const stats = fs.lstatSync(value);
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('GIT_CONFIG_INVALID:gitExecutable');
  const canonical = fs.realpathSync(value);
  if (canonical !== value) throw new Error('GIT_CONFIG_NONCANONICAL:gitExecutable');
  return canonical;
}

export function canonicalWorkspaceRoot(value: unknown): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) throw new Error('GIT_CONFIG_INVALID:workspaceRoot');
  fs.mkdirSync(value, { recursive: true });
  return canonicalExistingDirectory(value, 'workspaceRoot');
}

export function authorizedDirectory(value: unknown, roots: readonly string[], label: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) throw new Error(`GIT_PATH_INVALID:${label}`);
  const canonical = canonicalExistingDirectory(value, label);
  if (!roots.some((root) => inside(canonical, root))) throw new Error(`GIT_PATH_DENIED:${canonical}`);
  return canonical;
}

export function workspaceDestination(value: unknown, root: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) throw new Error('GIT_PATH_INVALID:workspacePath');
  if (!inside(value, root) || value === root) throw new Error(`GIT_PATH_DENIED:${value}`);
  if (fs.existsSync(value)) throw new Error(`GIT_WORKSPACE_EXISTS:${value}`);
  if (!inside(fs.realpathSync(path.dirname(value)), root)) throw new Error(`GIT_PATH_DENIED:${value}`);
  return value;
}

export function gitToken(value: unknown, label: string): string {
  const invalid = typeof value !== 'string' || value.length === 0 || value.length > 512 || value.startsWith('-')
    || value.includes('\0') || /[\s~^:?*[\\]/.test(value) || value.includes('..') || value.includes('@{')
    || value.endsWith('.') || value.endsWith('/') || value.endsWith('.lock') || value.includes('//');
  if (invalid) throw new Error(`GIT_VALUE_INVALID:${label}`);
  return value;
}

export function gitRef(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) throw new Error(`GIT_VALUE_INVALID:${label}`);
  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0)) throw new Error(`GIT_VALUE_INVALID:${label}`);
  return segments.map((segment) => gitToken(segment, label)).join('/');
}

export function commitMessage(value: unknown): string {
  const invalid = typeof value !== 'string' || value.length === 0 || value.length > 4096 || value.includes('\0') || /[\r\n]/.test(value) || value.startsWith('-');
  if (invalid) throw new Error('GIT_VALUE_INVALID:message');
  return value;
}

function scopedPath(value: unknown, workspace: string): string {
  const invalid = typeof value !== 'string' || value.length === 0 || value.length > 4096 || path.isAbsolute(value) || value.includes('\0') || /[\r\n]/.test(value);
  if (invalid) throw new Error('GIT_PATHS_INVALID');
  const segments = value.split(/[\\/]+/);
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) throw new Error('GIT_PATHS_INVALID');
  const normalized = segments.join('/');
  const resolved = path.resolve(workspace, normalized);
  if (!inside(resolved, workspace) || resolved === workspace) throw new Error('GIT_PATHS_INVALID');
  let cursor = workspace;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) break;
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`GIT_SYMLINK_DENIED:${normalized}`);
  }
  return normalized;
}

export function scopedPaths(value: unknown, workspace: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('GIT_PATHS_INVALID');
  return Object.freeze([...new Set(value.map((entry) => scopedPath(entry, workspace)))]);
}

export function pathInside(candidate: string, root: string): boolean { return inside(candidate, root); }
