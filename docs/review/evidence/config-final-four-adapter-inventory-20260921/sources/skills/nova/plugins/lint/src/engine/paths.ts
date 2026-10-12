import fs from 'node:fs';
import path from 'node:path';

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

// Deleted files are legal scope inputs. Canonicalize their closest existing
// ancestor so a missing leaf cannot conceal an escaping parent symlink.
function canonicalPath(candidate: string): string {
  try {
    fs.lstatSync(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = path.dirname(candidate);
    if (parent === candidate) throw error;
    return path.join(canonicalPath(parent), path.basename(candidate));
  }
  return fs.realpathSync(candidate);
}

export function requireRepositoryPath(root: string, candidate: string): string {
  const canonicalRoot = fs.realpathSync(root);
  const absolute = path.resolve(candidate);
  const canonical = canonicalPath(absolute);
  if ((!inside(path.resolve(root), absolute) && !inside(canonicalRoot, absolute)) || !inside(canonicalRoot, canonical)) {
    throw Object.assign(new Error(`LINT_REPOSITORY_PATH_DENIED:${absolute}`), { code: 'LINT_REPOSITORY_PATH_DENIED' });
  }
  return absolute;
}

/** Inspect native recursive targets too, including symlink entries discovery skips. */
export function requireRepositoryTree(root: string, target: string, excluded: (file: string) => boolean, visited = new Set<string>()): void {
  requireRepositoryPath(root, target);
  if (!fs.existsSync(target)) return;
  const canonical = fs.realpathSync(target);
  if (visited.has(canonical)) return;
  visited.add(canonical);
  if (!fs.statSync(target).isDirectory()) return;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name);
    if (!excluded(child)) requireRepositoryTree(root, child, excluded, visited);
  }
}
