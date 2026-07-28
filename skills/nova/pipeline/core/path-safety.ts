import path from 'path';
import { selectTruthyValue } from '../optional-absence.ts';

const ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/'];
const UNSAFE_PATH_SEGMENT_NAMES = new Set(['.', '..']);

export function validateSafePath(filePath: any, label: any) {
  if (selectTruthyValue(() => !filePath, () => typeof filePath !== 'string')) {
    throw new Error(`${label}: path is empty or not a string`);
  }
  const normalized = path.resolve(filePath);
  const allowed = ALLOWED_PATH_PREFIXES.some((prefix: string) => {
    const resolvedPrefix = path.resolve(prefix);
    const prefixWithSeparator = resolvedPrefix.endsWith(path.sep)
      ? resolvedPrefix
      : `${resolvedPrefix}${path.sep}`;
    return normalized === resolvedPrefix || normalized.startsWith(prefixWithSeparator);
  });
  if (!allowed) {
    throw new Error(
      `${label}: path '${normalized}' not in allowed prefixes [${ALLOWED_PATH_PREFIXES.join(', ')}]. ` +
      'Update ALLOWED_PATH_PREFIXES in core/paths.ts if this is intentional.',
    );
  }
  return normalized;
}

function requiredRepoRoot(config: any, label: any = 'repository root') {
  if (selectTruthyValue(() => typeof config?.repo_root !== 'string', () => !config.repo_root.trim())) {
    throw new Error(`${label}: required non-empty string`);
  }
  return config.repo_root;
}

export function portableArtifactRefPath(config: any, absPath: any) {
  return path.relative(requiredRepoRoot(config), absPath).split(path.sep).join('/');
}

function rootedPrefix(root: any) {
  const resolvedRoot = path.resolve(root);
  return resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
}

export function isPathInside(candidate: any, root: any) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(rootedPrefix(resolvedRoot));
}

export function assertPathInside(
  candidate: any,
  root: any,
  label: any,
  scopeDescription: any = 'swarm root',
) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  if (isPathInside(resolvedCandidate, resolvedRoot)) return resolvedCandidate;
  throw new Error(`${label}: path escapes ${scopeDescription}: ${candidate}`);
}

export function assertRelativePathInput(inputPath: any, label: any, scopeDescription: any) {
  if (selectTruthyValue(() => typeof inputPath !== 'string', () => !inputPath.trim())) {
    throw new Error(`${label}: path is empty or not a string`);
  }
  if (inputPath.includes('\0')) throw new Error(`${label}: path contains a null byte`);
  if (path.isAbsolute(inputPath)) throw new Error(`${label}: path must be relative to ${scopeDescription}`);
  const segments = inputPath.split(/[\\/]+/).filter(Boolean);
  if (segments.includes('..')) throw new Error(`${label}: path must not contain parent traversal`);
  return inputPath;
}

export function assertSafePathSegment(segment: any, label: any, opts: any = {}) {
  if (segment === '' && opts.allowEmpty === true) return segment;
  if (selectTruthyValue(() => typeof segment !== 'string', () => !segment.trim())) {
    throw new Error(`${label}: identifier is empty or not a string`);
  }
  const unsafe = /[\0/\\]/u.test(segment)
    || path.isAbsolute(segment)
    || UNSAFE_PATH_SEGMENT_NAMES.has(segment);
  if (unsafe) throw new Error(`${label}: identifier must be a single safe path segment`);
  return segment;
}
