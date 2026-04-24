import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SOURCE_REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function existingDir(candidate) {
  if (!candidate) return null;
  const resolved = path.resolve(candidate);
  try {
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

function buildCandidates() {
  const cwd = process.cwd();
  return [
    process.env.REPO_DIR,
    process.env.OPENCLAW_REPO_DIR,
    process.env.KUBECLAW_REPO_DIR,
    process.env.OPENCLAW_WORKSPACE ? path.join(process.env.OPENCLAW_WORKSPACE, 'git-repo') : null,
    path.join(cwd, 'git-repo'),
    cwd,
    path.join(cwd, '..', 'git-repo'),
    path.join(cwd, '..', '..', 'git-repo'),
    SOURCE_REPO_DIR,
  ];
}

export function resolveRepoDir() {
  for (const candidate of buildCandidates()) {
    const found = existingDir(candidate);
    if (found) return found;
  }
  return path.resolve(process.env.REPO_DIR || SOURCE_REPO_DIR);
}

export const REPO_DIR = resolveRepoDir();

export function resolveRepoPath(p, repoDir = REPO_DIR) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(repoDir, p);
}

export function stripRepoDirPrefix(value, repoDir = REPO_DIR) {
  return String(value || '').replace(`${repoDir}/`, '').replace(repoDir, '');
}
