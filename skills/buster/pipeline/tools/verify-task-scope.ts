import fs from 'fs';
import path from 'path';
import { gitExec } from '../services/git-workflows.ts';

type AnyRecord = Record<string, any>;

export interface CleanupAction {
  file: string;
  cleaned: boolean;
  method?: 'checkout' | 'delete';
  error?: string;
}

function stringValue(value: unknown): string {
  return value == null ? '' : String(value);
}

export function requireNonEmptyString(value: unknown, field: string): string {
  const text = stringValue(value).trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}

export function validateProjectSlug(currentProject: unknown): string {
  const project = stringValue(currentProject).trim();
  if (!/^[A-Za-z0-9._-]+$/.test(project) || project === '.' || project === '..') {
    throw new Error('Invalid project id. Expected a safe project slug without path separators.');
  }
  return project;
}

export function normalizeGitPath(value: unknown): string {
  return stringValue(value).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/$/, '');
}

export function isGitPathInside(file: string, root: string): boolean {
  const normalizedFile = normalizeGitPath(file);
  const normalizedRoot = normalizeGitPath(root);
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}/`);
}

export function buildSwarmScope(currentProject: unknown): { project: string; projectRoot: string; swarmRoot: string } {
  const project = validateProjectSlug(currentProject);
  const projectRoot = `Projects/${project}`;
  return { project, projectRoot, swarmRoot: `${projectRoot}/src/.swarm` };
}

function uniqueFiles(files: string[]): string[] {
  return [...new Set(files.map(normalizeGitPath).filter(Boolean))];
}

export function normalizeExplicitAddPaths(addPaths: unknown, projectRoot: string, swarmRoot: string): string[] {
  if (addPaths == null) return [swarmRoot];
  if (!Array.isArray(addPaths) || addPaths.length === 0) throw new Error('verifyAndPush addPaths must be a non-empty array when provided');
  const normalized = uniqueFiles(addPaths.map((entry) => stringValue(entry).trim()));
  if (normalized.length !== addPaths.length) throw new Error('verifyAndPush addPaths must not contain empty or duplicate paths');
  for (const file of normalized) {
    if (!isGitPathInside(file, projectRoot)) throw new Error(`verifyAndPush addPath is outside project scope: ${file}`);
    if (!isGitPathInside(file, swarmRoot)) throw new Error(`verifyAndPush addPath is outside swarm scope: ${file}`);
  }
  return normalized;
}

export function parsePorcelainStatusPaths(statusOut: string): string[] {
  const entries = statusOut.split('\0').filter((entry) => entry.length > 0);
  const files: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const separator = entry.indexOf(' ');
    const fileStart = entry.length >= 3 && entry[2] === ' ' ? 3 : (separator >= 0 ? separator + 1 : 3);
    const file = entry.substring(fileStart);
    if (!file) continue;
    files.push(file);
    const renamed = ['R', 'C'].includes(entry[0] ?? '') || ['R', 'C'].includes(entry[1] ?? '');
    const source = entries[index + 1];
    if (renamed && source) {
      files.push(source);
      index += 1;
    }
  }
  return uniqueFiles(files);
}

export function listChangedFiles(repoRoot: string): string[] {
  const status = gitExec(repoRoot, ['status', '--porcelain=v1', '-z']);
  return status ? parsePorcelainStatusPaths(status) : [];
}

export function findScopeViolations(files: string[], projectRoot: string, swarmRoot: string): { violations: string[]; badFiles: string[] } {
  const badFiles = files.filter((file) => isGitPathInside(file, projectRoot) && !isGitPathInside(file, swarmRoot));
  return {
    badFiles,
    violations: badFiles.map((file) => `${file} -> [SWARM-SCOPE] This verifier only permits writes inside ${swarmRoot}/.`),
  };
}

export function cleanupForbiddenFile(repoRoot: string, file: string): CleanupAction {
  const absPath = path.join(repoRoot, file);
  try {
    gitExec(repoRoot, ['checkout', 'HEAD', '--', file], { stdio: 'ignore' } as AnyRecord);
    return { file, cleaned: true, method: 'checkout' };
  } catch (_error) {
    gitExec(repoRoot, ['rm', '--cached', '--ignore-unmatch', '-r', '--', file], { stdio: 'ignore' } as AnyRecord);
    if (fs.existsSync(absPath)) fs.rmSync(absPath, { force: true, recursive: true });
    return { file, cleaned: true, method: 'delete' };
  }
}
