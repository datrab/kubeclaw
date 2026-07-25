import fs, { type Dirent } from 'node:fs';
import path from 'node:path';

export type AnyRecord = Record<string, any>;
export type Args = {
  apply: boolean;
  check: boolean;
  print: boolean;
  help: boolean;
  project: string | null;
  repo: string | null;
  swarm: string | null;
  scaffold: string | null;
};
export type Context = {
  repoRoot: string;
  project: string;
  swarmDir: string;
  scaffoldFile: string;
  progressFile: string;
};
export type Diagnostic = {
  level: 'error';
  kind: 'form_check' | 'strict_content_check';
  field: string;
  message: string;
};

export const SCHEMA = 'progress-scaffold/v1';
export const TODO_PREFIX = 'TODO:';
export const DEFAULTS = Object.freeze({
  module_timeout_minutes: 300,
  module_max_fails: 3,
  thinking_level: 'adaptive',
  review_on_fail: 'stop',
  review_output_dir: 'logs/echo-review',
  review_timeout_minutes: 45,
  review_max_fix_cycles: 0,
  review_lint_tier: 'full',
  buster_on_fail: 'fix_and_retest',
  buster_timeout_minutes: 90,
  buster_max_fix_cycles: 3,
  version: 1,
  policy: Object.freeze({
    arch_validation: Object.freeze({ enabled: true }),
    pipeline_review: Object.freeze({ enabled: false }),
    case_study: Object.freeze({ enabled: false }),
    telemetry: Object.freeze({ enabled: true }),
    payload: Object.freeze({}),
  }),
});
export const VALID_SUITES = new Set(['build', 'health', 'api', 'security', 'unit', 'a11y', 'perf', 'bundle', 'visual-reg', 'e2e', 'manifest', 'k8s']);

export function isPlainObject(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function objectOrEmpty(value: unknown): AnyRecord {
  return isPlainObject(value) ? value : {};
}

export function entriesOf(value: unknown): Array<[string, any]> {
  return Object.entries(objectOrEmpty(value));
}

export function objectKeys(value: unknown): string[] {
  return Object.keys(objectOrEmpty(value));
}

export function valueOrDefault<T>(value: T | null | undefined, defaultValue: T): T {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'string' && value.length === 0) return defaultValue;
  return value;
}

export function nonEmptyStringOrDefault(value: unknown, defaultValue: string): string {
  return typeof value === 'string' && value.trim() ? value : defaultValue;
}

export function omitEmpty(value: unknown): any {
  if (!isPlainObject(value)) return value;
  const out: AnyRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null) continue;
    if (isPlainObject(entry) && Object.keys(entry).length === 0) continue;
    out[key] = entry;
  }
  return out;
}

export function naturalSort(a: unknown, b: unknown): number {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function listDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry: Dirent) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry: Dirent) => entry.name)
    .sort(naturalSort);
}

export function listFiles(dir: string, predicate: (name: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry: Dirent) => entry.isFile() && predicate(entry.name))
    .map((entry: Dirent) => path.join(dir, entry.name))
    .sort(naturalSort);
}

export function readTextIfExists(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

export function readJsonIfExists(filePath: string): any | null {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
}

export function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function relFromRepo(repoRoot: string, filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

export function relFromSwarm(swarmDir: string, filePath: string): string {
  return path.relative(swarmDir, filePath).split(path.sep).join('/');
}

export function titleFromId(id: string): string {
  return String(id)
    .replace(/\.[^.]+$/, '')
    .replace(/-INSTRUCTIONS$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

export function firstHeading(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+?)\s*$/m);
  if (!match) return titleFromId(fallback);
  return valueOrDefault(match[1], '').replace(/^Module\s+[A-Za-z0-9._-]+\s+[—-]\s+/i, '').trim();
}

export function slugFromName(name: string): string {
  return String(name)
    .replace(/\.[^.]+$/, '')
    .replace(/-INSTRUCTIONS$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function upperNameFromId(id: string): string {
  return String(id).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function diagnostic(kind: Diagnostic['kind'], message: string, field: string): Diagnostic {
  return { level: 'error', kind, field, message };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
