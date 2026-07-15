#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type AnyRecord = Record<string, any>;
type Args = {
  apply: boolean;
  check: boolean;
  print: boolean;
  help: boolean;
  project: string | null;
  repo: string | null;
  swarm: string | null;
  scaffold: string | null;
};
type Context = {
  repoRoot: string;
  project: string;
  swarmDir: string;
  scaffoldFile: string;
  progressFile: string;
};
type Diagnostic = {
  level: 'error';
  kind: 'form_check' | 'strict_content_check';
  field: string;
  message: string;
};
type ScaffoldError = Error & { diagnostics?: Diagnostic[] };

const SCHEMA = 'progress-scaffold/v1';
const DEFAULT_SCAFFOLD_FILE = 'progress.scaffold.json';
const TODO_PREFIX = 'TODO:';
const PROGRESS_SCAFFOLD_DEFAULTS = Object.freeze({
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
const VALID_SUITES = new Set([
  'build',
  'health',
  'api',
  'security',
  'unit',
  'a11y',
  'perf',
  'bundle',
  'visual-reg',
  'e2e',
  'manifest',
  'k8s',
]);
const VALID_GATE_TYPES = new Set(['review', 'buster', 'approval']);
const VALID_REVIEW_ON_FAIL = new Set(['stop']);
const VALID_BUSTER_ON_FAIL = new Set(['fix_and_retest']);
const VALID_ON_TIMEOUT = new Set(['block', 'continue']);
const VALID_STAGES = new Set(['forge', 'buster']);
const VALID_PREVIEW = new Set(['off', 'tailscale-ingress']);
const VALID_CLEANUP_POLICY = new Set(['delete', 'keep']);
const VISUAL_REG_PATHS_FIELD = 'paths_file';
const REMOVED_VISUAL_REG_PATH_FIELD = 'path';

function usage() {
  return `Usage:
  node skills/nova/project_setup/tools/progress-scaffold.ts --project <name> [--repo <repo>]
  node skills/nova/project_setup/tools/progress-scaffold.ts --project <name> --apply [--repo <repo>]
  node skills/nova/project_setup/tools/progress-scaffold.ts --project <name> --check [--repo <repo>]

Options:
  --project <name>       Project under Projects/<name>/src/.swarm
  --swarm <path>         Use an explicit .swarm directory instead of --project
  --repo <path>          Repository root. Defaults to nearest parent with .git
  --scaffold <path>      Scaffold file. Defaults to .swarm/progress.scaffold.json
  --apply                Validate scaffold and write .swarm/progress.json
  --check                Validate scaffold/progress without writing
  --print                Print generated progress JSON instead of writing with --apply
  --help                 Show this help
`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    check: false,
    print: false,
    help: false,
    project: null,
    repo: null,
    swarm: null,
    scaffold: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--print') args.print = true;
    else if (isHelpArg(arg)) args.help = true;
    else if (arg === '--project') args.project = requireValue(argv, ++i, arg);
    else if (arg === '--repo') args.repo = requireValue(argv, ++i, arg);
    else if (arg === '--swarm') args.swarm = requireValue(argv, ++i, arg);
    else if (arg === '--scaffold') args.scaffold = requireValue(argv, ++i, arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.apply && args.check) throw new Error('Use either --apply or --check, not both.');
  if (!args.help && !args.project && !args.swarm) throw new Error('Provide --project <name> or --swarm <path>.');
  return args;
}

function isHelpArg(arg: string): boolean {
  if (arg === '--help') return true;
  return arg === '-h';
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function findRepoRoot(startDir = process.cwd()): string {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error('Cannot find repository root. Pass --repo <path>.');
    current = parent;
  }
}

function resolveContext(args: Args): Context {
  const repoRoot = path.resolve(args.repo !== null ? args.repo : findRepoRoot());
  if (!fs.existsSync(path.join(repoRoot, '.git'))) {
    throw new Error(`Repo root is not a git repository: ${repoRoot}`);
  }

  let project = args.project;
  let swarmDir;
  if (args.swarm) {
    swarmDir = path.resolve(args.swarm);
    if (!project) {
      const parts = swarmDir.split(path.sep);
      const projectsIndex = parts.lastIndexOf('Projects');
      if (projectsIndex >= 0 && parts[projectsIndex + 1]) project = parts[projectsIndex + 1];
    }
  } else {
    project = assertSafeSegment(project, 'project');
    swarmDir = path.join(repoRoot, 'Projects', project, 'src', '.swarm');
  }
  if (!project) throw new Error('Cannot infer project name from --swarm; pass --project too.');

  const scaffoldFile = args.scaffold
    ? path.resolve(args.scaffold)
    : path.join(swarmDir, DEFAULT_SCAFFOLD_FILE);
  return { repoRoot, project, swarmDir, scaffoldFile, progressFile: path.join(swarmDir, 'progress.json') };
}

function assertSafeSegment(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  if (!/^[A-Za-z0-9._-]+$/.test(value) || value.includes('..')) {
    throw new Error(`${label} must be a safe path segment: ${value}`);
  }
  return value;
}

function relFromRepo(repoRoot: string, filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function relFromSwarm(swarmDir: string, filePath: string): string {
  return path.relative(swarmDir, filePath).split(path.sep).join('/');
}

function readTextIfExists(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

function readJsonIfExists(filePath: string): any | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function isPlainObject(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function objectOrEmpty(value: unknown): AnyRecord {
  return isPlainObject(value) ? value : {};
}

function entriesOf(value: unknown): Array<[string, any]> {
  return Object.entries(objectOrEmpty(value));
}

function objectKeys(value: unknown): string[] {
  return Object.keys(objectOrEmpty(value));
}

function valueOrDefault<T>(value: T | null | undefined, defaultValue: T): T {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'string' && value.length === 0) return defaultValue;
  return value;
}

function nonEmptyStringOrDefault(value: unknown, defaultValue: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : defaultValue;
}

function scaffoldValueOrDefault<T>(scaffold: AnyRecord, progress: AnyRecord, key: string, defaultValue: T): T {
  const scaffoldValue = scaffold[key];
  if (scaffoldValue !== undefined && scaffoldValue !== null) return scaffoldValue;
  const progressValue = progress[key];
  if (progressValue !== undefined && progressValue !== null) return progressValue;
  return defaultValue;
}

function omitEmpty(value: unknown): any {
  if (!isPlainObject(value)) return value;
  const out: AnyRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null) continue;
    if (isPlainObject(entry) && Object.keys(entry).length === 0) continue;
    out[key] = entry;
  }
  return out;
}

function listDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry: any) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry: any) => entry.name)
    .sort(naturalSort);
}

function listFiles(dir: string, predicate: (name: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry: any) => entry.isFile() && predicate(entry.name))
    .map((entry: any) => path.join(dir, entry.name))
    .sort(naturalSort);
}

function naturalSort(a: unknown, b: unknown): number {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function firstHeading(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+?)\s*$/m);
  if (!match) return titleFromId(fallback);
  return valueOrDefault(match[1], '')
    .replace(/^Module\s+[A-Za-z0-9._-]+\s+[—-]\s+/i, '')
    .trim();
}

function titleFromId(id: string): string {
  return String(id)
    .replace(/\.[^.]+$/, '')
    .replace(/-INSTRUCTIONS$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

function slugFromName(name: string): string {
  return String(name)
    .replace(/\.[^.]+$/, '')
    .replace(/-INSTRUCTIONS$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function upperNameFromId(id: string): string {
  return String(id).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function existingModuleIdForDir(existingProgress: AnyRecord, dir: string): string {
  for (const [id, mod] of entriesOf(existingProgress.modules)) {
    if (isPlainObject(mod) && mod.dir === dir) return id;
  }
  return dir;
}

function inferSubsteps(moduleDir: string): string[] {
  return listDirs(moduleDir).filter((dir) => fs.existsSync(path.join(moduleDir, dir, 'FORGE.md')));
}

function inferSuites(moduleDir: string, forgeText: string, hasBuster: boolean, existingSuites: unknown = null): string[] {
  if (Array.isArray(existingSuites)) return existingSuites;
  if (!hasBuster) return [];
  const suites: string[] = ['build', 'health'];
  if (/^##\s+Unit Tests\b/mi.test(forgeText)) suites.push('unit');
  if (fs.existsSync(path.join(moduleDir, 'test-spec.json'))) suites.push('api');
  if (fs.existsSync(path.join(moduleDir, 'baselines', 'paths.json'))) suites.push('visual-reg');
  return suites;
}

function inferRequiredSuites(markdown: string): string[] {
  const suites: string[] = [];
  const suiteSet = new Set(VALID_SUITES);
  const lines = markdown.split(/\r?\n/);
  let inRequired = false;
  for (const line of lines) {
    if (/^##\s+Required Suites\b/i.test(line)) {
      inRequired = true;
      continue;
    }
    if (inRequired && /^##\s+/.test(line)) break;
    if (!inRequired) continue;
    const match = line.match(/^\s*[-*]\s+`?([A-Za-z0-9-]+)`?\s*$/);
    const suite = match?.[1];
    if (suite && suiteSet.has(suite)) suites.push(suite);
  }
  return [...new Set(suites)];
}

function inferPackageScripts(projectSrcDir: string): { start: string | null; test: string | null } {
  const packageJson = readJsonIfExists(path.join(projectSrcDir, 'package.json'));
  const scripts = isPlainObject(packageJson?.scripts) ? packageJson.scripts : {};
  return {
    start: typeof scripts.start === 'string' ? 'npm start' : null,
    test: typeof scripts.test === 'string' ? 'npm test' : null,
  };
}

function inferTestConfig({
  repoRoot,
  project,
  projectSrcDir,
  moduleId,
  moduleDir,
  suites,
  existingConfig = null,
}: {
  repoRoot: string;
  project: string;
  projectSrcDir: string;
  moduleId: string;
  moduleDir: string;
  suites: string[];
  existingConfig?: unknown;
}): AnyRecord | undefined {
  if (isPlainObject(existingConfig)) return existingConfig;
  if (!Array.isArray(suites) || suites.length === 0) return undefined;

  const scripts = inferPackageScripts(projectSrcDir);
  const projectDir = `Projects/${project}/src`;
  const config: AnyRecord = {};
  if (suites.some((suite) => ['build', 'health', 'security', 'bundle', 'a11y', 'perf', 'e2e', 'visual-reg'].includes(suite))) {
    config.serve = {
      type: 'server',
      project_dir: projectDir,
      start_cmd: nonEmptyStringOrDefault(scripts.start, 'npm start'),
      image: `localhost/${project}:${moduleId}`,
      port: 3000,
      health_path: '/health',
    };
    const dockerfile = path.join(projectSrcDir, 'Dockerfile');
    if (fs.existsSync(dockerfile)) {
      config.serve.dockerfile = relFromRepo(repoRoot, dockerfile);
      config.serve.build_context = projectDir;
    }
  }
  if (suites.includes('unit')) {
    config.unit = { test_cmd: nonEmptyStringOrDefault(scripts.test, 'npm test') };
  }
  if (suites.includes('api')) {
    config.api = { spec_file: relFromSwarm(path.join(projectSrcDir, '.swarm'), path.join(moduleDir, 'test-spec.json')) };
  }
  if (suites.includes('manifest')) {
    config.manifest = {
      deployment_yaml: `${TODO_PREFIX} repository-relative Kubernetes manifest path`,
      required_env: [],
      thresholds: { max_missing_env: 0 },
    };
  }
  if (suites.includes('k8s')) {
    config.k8s = {
      dockerfile: `${TODO_PREFIX} repository-relative Dockerfile path`,
      build_context: projectDir,
      image_name: project,
      service_name: project,
      manifests: [`${TODO_PREFIX} repository-relative Kubernetes manifest path`],
      port: 3000,
      health_path: '/health',
      purpose: 'pretest',
      cleanup_policy: 'delete',
      preview: { provider: 'off', path: '/' },
    };
  }
  return config;
}

function discoverModules(ctx: Context, existingProgress: AnyRecord): AnyRecord {
  const modulesDir = path.join(ctx.swarmDir, 'modules');
  const projectSrcDir = path.dirname(ctx.swarmDir);
  const modules: AnyRecord = {};
  for (const dir of listDirs(modulesDir)) {
    const moduleDir = path.join(modulesDir, dir);
    const id = existingModuleIdForDir(existingProgress, dir);
    const existing = objectOrEmpty(objectOrEmpty(existingProgress.modules)[id]);
    const forgeText = readTextIfExists(path.join(moduleDir, 'FORGE.md'));
    const hasBuster = fs.existsSync(path.join(moduleDir, 'BUSTER.md'));
    const substeps = inferSubsteps(moduleDir);
    const stages = Array.isArray(existing.stages)
      ? existing.stages
      : hasBuster
        ? ['forge', 'buster']
        : ['forge'];
    const testSuites = inferSuites(moduleDir, forgeText, stages.includes('buster'), existing.test_suites);
    modules[id] = omitEmpty({
      title: nonEmptyStringOrDefault(existing.title, firstHeading(forgeText, id)),
      dir,
      substeps: Array.isArray(existing.substeps) && existing.substeps.length > 0
        ? existing.substeps
        : substeps.length > 0
          ? substeps
          : undefined,
      depends_on: Array.isArray(existing.depends_on) ? existing.depends_on : [],
      stages,
      timeout_minutes: valueOrDefault(existing.timeout_minutes, PROGRESS_SCAFFOLD_DEFAULTS.module_timeout_minutes),
      max_fails: valueOrDefault(existing.max_fails, PROGRESS_SCAFFOLD_DEFAULTS.module_max_fails),
      thinking_level: nonEmptyStringOrDefault(existing.thinking_level, PROGRESS_SCAFFOLD_DEFAULTS.thinking_level),
      forge_model: existing.forge_model,
      forge_subagent: existing.forge_subagent,
      session: existing.session,
      capabilities: existing.capabilities,
      test_suites: testSuites,
      test_config: inferTestConfig({
        repoRoot: ctx.repoRoot,
        project: ctx.project,
        projectSrcDir,
        moduleId: id,
        moduleDir,
        suites: testSuites,
        existingConfig: existing.test_config,
      }),
    });
  }
  return modules;
}

function discoverReviewGates(ctx: Context, existingProgress: AnyRecord): AnyRecord {
  const gates: AnyRecord = {};
  const reviewDir = path.join(ctx.swarmDir, 'echo-review');
  for (const file of listFiles(reviewDir, (name: string) => /\.md$/i.test(name))) {
    const relPath = relFromSwarm(ctx.swarmDir, file);
    const existingEntry = findExistingGateByFile(existingProgress, 'instructions_file', relPath);
    const id = existingEntry?.id !== undefined && existingEntry.id !== null ? existingEntry.id : slugFromName(path.basename(file));
    const existing = objectOrEmpty(existingEntry?.gate);
    const reviewName = nonEmptyStringOrDefault(existing.review_name, upperNameFromId(id));
    gates[id] = normalizeGateFields(omitEmpty({
      type: 'review',
      title: nonEmptyStringOrDefault(existing.title, titleFromId(id)),
      review_name: reviewName,
      on_fail: nonEmptyStringOrDefault(existing.on_fail, PROGRESS_SCAFFOLD_DEFAULTS.review_on_fail),
      instructions_file: nonEmptyStringOrDefault(existing.instructions_file, relPath),
      output_file: nonEmptyStringOrDefault(existing.output_file, `logs/echo-review/${reviewName}.json`),
      review_output_dir: nonEmptyStringOrDefault(existing.review_output_dir, PROGRESS_SCAFFOLD_DEFAULTS.review_output_dir),
      reviewers: existing.reviewers,
      primary_reviewer: existing.primary_reviewer,
      forge_model: existing.forge_model,
      forge_thinking_level: nonEmptyStringOrDefault(existing.forge_thinking_level, PROGRESS_SCAFFOLD_DEFAULTS.thinking_level),
      timeout_minutes: valueOrDefault(existing.timeout_minutes, PROGRESS_SCAFFOLD_DEFAULTS.review_timeout_minutes),
      max_fix_cycles: valueOrDefault(existing.max_fix_cycles, PROGRESS_SCAFFOLD_DEFAULTS.review_max_fix_cycles),
      lint_tier: nonEmptyStringOrDefault(existing.lint_tier, PROGRESS_SCAFFOLD_DEFAULTS.review_lint_tier),
    }));
  }
  return gates;
}

function discoverBusterGates(ctx: Context, existingProgress: AnyRecord): AnyRecord {
  const gates: AnyRecord = {};
  const busterDir = path.join(ctx.swarmDir, 'buster-test');
  const projectSrcDir = path.dirname(ctx.swarmDir);
  for (const file of listFiles(busterDir, (name: string) => /\.md$/i.test(name))) {
    const relPath = relFromSwarm(ctx.swarmDir, file);
    const existingEntry = findExistingGateByFile(existingProgress, 'instructions_file', relPath);
    const id = existingEntry?.id !== undefined && existingEntry.id !== null ? existingEntry.id : slugFromName(path.basename(file));
    const existing = objectOrEmpty(existingEntry?.gate);
    const requiredSuites = inferRequiredSuites(readTextIfExists(file));
    const suites = Array.isArray(existing.test_suites) ? existing.test_suites : (requiredSuites.length ? requiredSuites : ['build', 'health', 'unit']);
    gates[id] = normalizeGateFields(omitEmpty({
      type: 'buster',
      title: nonEmptyStringOrDefault(existing.title, titleFromId(id)),
      on_fail: nonEmptyStringOrDefault(existing.on_fail, PROGRESS_SCAFFOLD_DEFAULTS.buster_on_fail),
      instructions_file: nonEmptyStringOrDefault(existing.instructions_file, relPath),
      output_file: nonEmptyStringOrDefault(existing.output_file, `buster-test/${upperNameFromId(id)}-RESULT.json`),
      model: existing.model,
      forge_model: existing.forge_model,
      timeout_minutes: valueOrDefault(existing.timeout_minutes, PROGRESS_SCAFFOLD_DEFAULTS.buster_timeout_minutes),
      max_fix_cycles: valueOrDefault(existing.max_fix_cycles, PROGRESS_SCAFFOLD_DEFAULTS.buster_max_fix_cycles),
      test_suites: suites,
      capabilities: existing.capabilities,
      test_config: inferTestConfig({
        repoRoot: ctx.repoRoot,
        project: ctx.project,
        projectSrcDir,
        moduleId: id,
        moduleDir: busterDir,
        suites,
        existingConfig: existing.test_config,
      }),
    }));
  }
  return gates;
}

function findExistingGateByFile(existingProgress: AnyRecord, field: string, value: string): { id: string; gate: AnyRecord } | null {
  for (const [id, gate] of entriesOf(existingProgress.gates)) {
    if (isPlainObject(gate) && gate[field] === value) return { id, gate };
  }
  return null;
}

function normalizeGateFields(gate: AnyRecord): AnyRecord {
  return gate;
}

function deriveExecutionOrder(existingProgress: AnyRecord, modules: AnyRecord, gates: AnyRecord): string[] {
  if (Array.isArray(existingProgress?.execution_order)) return existingProgress.execution_order;
  const moduleIds = objectKeys(modules).sort(naturalSort);
  const gateIds = objectKeys(gates).sort(naturalSort);
  if (gateIds.length === 0) return moduleIds;
  return [
    ...moduleIds,
    ...gateIds.map((gateId) => `${TODO_PREFIX} place gate:${gateId} among [${moduleIds.join(', ')}]`),
  ];
}

function buildScaffold(ctx: Context): AnyRecord {
  const existingProgress = objectOrEmpty(readJsonIfExists(ctx.progressFile));
  const existingScaffold = objectOrEmpty(readJsonIfExists(ctx.scaffoldFile));
  const modules = discoverModules(ctx, existingProgress);
  const discoveredGates = {
    ...discoverReviewGates(ctx, existingProgress),
    ...discoverBusterGates(ctx, existingProgress),
  };
  const gates: AnyRecord = {};
  for (const [id, gate] of Object.entries({ ...objectOrEmpty(existingProgress.gates), ...discoveredGates })) {
    gates[id] = normalizeGateFields({ ...(isPlainObject(gate) ? gate : {}) });
  }

  const moduleIds = Object.keys(modules).sort(naturalSort);
  return {
    _schema: SCHEMA,
    _instructions: [
      'Edit TODO values, gate placements, and any inferred test_config values.',
      'Run this script again with --apply to validate and write progress.json.',
      'Run with --check in CI or before committing.',
    ],
    project: ctx.project,
    version: scaffoldValueOrDefault(existingScaffold, existingProgress, 'version', PROGRESS_SCAFFOLD_DEFAULTS.version),
    description: scaffoldValueOrDefault(existingScaffold, existingProgress, 'description', `${TODO_PREFIX} one-sentence project purpose`),
    notes: scaffoldValueOrDefault(existingScaffold, existingProgress, 'notes', [`${TODO_PREFIX} operator-visible scope note`]),
    defaults: scaffoldValueOrDefault(existingScaffold, existingProgress, 'defaults', {}),
    policy: isPlainObject(existingScaffold.policy) ? existingScaffold.policy : {
      arch_validation: valueOrDefault(existingProgress.arch_validation, PROGRESS_SCAFFOLD_DEFAULTS.policy.arch_validation),
      pipeline_review: valueOrDefault(existingProgress.pipeline_review, PROGRESS_SCAFFOLD_DEFAULTS.policy.pipeline_review),
      case_study: valueOrDefault(existingProgress.case_study, PROGRESS_SCAFFOLD_DEFAULTS.policy.case_study),
      telemetry: valueOrDefault(existingProgress.telemetry, PROGRESS_SCAFFOLD_DEFAULTS.policy.telemetry),
      payload: valueOrDefault(existingProgress.payload, PROGRESS_SCAFFOLD_DEFAULTS.policy.payload),
    },
    execution_order: valueOrDefault(existingScaffold.execution_order, deriveExecutionOrder(existingProgress, modules, gates)),
    modules: cleanModules(mergeExistingObjects(modules, existingScaffold.modules)),
    gates: mergeExistingObjects(gates, existingScaffold.gates),
  };
}

function cleanModules(modules: AnyRecord): AnyRecord {
  const out: AnyRecord = {};
  for (const [id, mod] of entriesOf(modules)) {
    if (!isPlainObject(mod)) {
      out[id] = mod;
      continue;
    }
    const next = { ...(isPlainObject(mod) ? mod : {}) };
    if (Array.isArray(next.substeps) && next.substeps.length === 0) delete next.substeps;
    out[id] = next;
  }
  return out;
}

function mergeExistingObjects(discovered: AnyRecord, existing: unknown): AnyRecord {
  if (!isPlainObject(existing)) return discovered;
  const merged = { ...discovered };
  for (const [id, value] of Object.entries(existing)) {
    merged[id] = isPlainObject(merged[id]) && isPlainObject(value)
      ? { ...merged[id], ...value }
      : value;
  }
  return merged;
}

function buildExecutionOrder(scaffold: AnyRecord, diagnostics: Diagnostic[]): string[] {
  if (!Array.isArray(scaffold.execution_order)) {
    diagnostics.push(error('form_check', 'execution_order must be an array', 'execution_order'));
    return [];
  }
  validateExecutionOrder(scaffold, diagnostics);
  return [...scaffold.execution_order];
}

function validateExecutionOrder(scaffold: AnyRecord, diagnostics: Diagnostic[]): void {
  const moduleIds = new Set(objectKeys(scaffold.modules));
  const gateIds = new Set(objectKeys(scaffold.gates));
  const seen = new Set();
  for (const [index, entry] of scaffold.execution_order.entries()) {
    const field = `execution_order.${index}`;
    if (typeof entry !== 'string' || !entry.trim()) {
      diagnostics.push(error('form_check', 'execution_order entries must be non-empty strings', field));
      continue;
    }
    if (entry.startsWith(TODO_PREFIX)) {
      diagnostics.push(error('form_check', `execution_order[${index}] still needs a concrete module id or gate:<id>`, field));
      continue;
    }
    const key = entry.startsWith('gate:') ? entry.slice('gate:'.length) : entry;
    const known = entry.startsWith('gate:') ? gateIds.has(key) : moduleIds.has(key);
    if (!known) {
      diagnostics.push(error('strict_content_check', `execution_order references unrecognized ${entry.startsWith('gate:') ? 'gate' : 'module'} '${key}'`, field));
      continue;
    }
    if (seen.has(entry)) diagnostics.push(error('form_check', `execution_order repeats '${entry}'`, field));
    seen.add(entry);
  }
}

function scaffoldToProgress(scaffold: AnyRecord, ctx: Context): { progress: AnyRecord; diagnostics: Diagnostic[] } {
  const diagnostics = validateScaffold(scaffold, ctx);
  const executionOrder = buildExecutionOrder(scaffold, diagnostics);
  if (diagnostics.some((item) => item.level === 'error')) {
    const err: ScaffoldError = new Error('progress scaffold validation failed');
    err.diagnostics = diagnostics;
    throw err;
  }

  const progress = omitEmpty({
    project: scaffold.project,
    version: valueOrDefault(scaffold.version, PROGRESS_SCAFFOLD_DEFAULTS.version),
    description: scaffold.description,
    notes: scaffold.notes,
    defaults: scaffold.defaults,
    arch_validation: scaffold.policy?.arch_validation,
    pipeline_review: scaffold.policy?.pipeline_review,
    case_study: scaffold.policy?.case_study,
    telemetry: scaffold.policy?.telemetry,
    payload: scaffold.policy?.payload,
    execution_order: executionOrder,
    modules: scaffold.modules,
    gates: Object.fromEntries(entriesOf(scaffold.gates).map(([id, gate]) => [id, normalizeGateFields({ ...objectOrEmpty(gate) })])),
  });
  return { progress, diagnostics };
}

function validateScaffold(scaffold: unknown, ctx: Context): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isPlainObject(scaffold)) {
    diagnostics.push(error('form_check', 'scaffold must be a JSON object', '$'));
    return diagnostics;
  }
  if (scaffold._schema && scaffold._schema !== SCHEMA) {
    diagnostics.push(error('form_check', `unsupported scaffold schema '${scaffold._schema}'`, '_schema'));
  }
  collectTodoDiagnostics(scaffold, diagnostics);
  if (scaffold.project !== ctx.project) {
    diagnostics.push(error('strict_content_check', `project must be '${ctx.project}'`, 'project'));
  }
  if (!isPlainObject(scaffold.modules) || Object.keys(scaffold.modules).length === 0) {
    diagnostics.push(error('strict_content_check', 'modules must contain at least one module', 'modules'));
  }
  validateModules(scaffold, ctx, diagnostics);
  validateGates(scaffold, ctx, diagnostics);
  validatePolicy(scaffold, diagnostics);
  return diagnostics;
}

function collectTodoDiagnostics(value: unknown, diagnostics: Diagnostic[], pathLabel = '$'): void {
  if (typeof value === 'string') {
    if (value.startsWith(TODO_PREFIX)) diagnostics.push(error('form_check', `unresolved TODO at ${pathLabel}`, pathLabel));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectTodoDiagnostics(entry, diagnostics, `${pathLabel}.${index}`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      collectTodoDiagnostics(entry, diagnostics, `${pathLabel}.${key}`);
    }
  }
}

function validateModules(scaffold: AnyRecord, ctx: Context, diagnostics: Diagnostic[]): void {
  const modulesDir = path.join(ctx.swarmDir, 'modules');
  const moduleIds = new Set(objectKeys(scaffold.modules));
  const gateIds = new Set(objectKeys(scaffold.gates));
  for (const [id, mod] of entriesOf(scaffold.modules)) {
    try { assertSafeSegment(id, `module id '${id}'`); }
    catch (err) { diagnostics.push(error('form_check', errorMessage(err), `modules.${id}`)); }
    if (!isPlainObject(mod)) {
      diagnostics.push(error('form_check', `module '${id}' must be an object`, `modules.${id}`));
      continue;
    }
    if (!mod.title) diagnostics.push(error('form_check', `module '${id}' needs title`, `modules.${id}.title`));
    if (!mod.dir) diagnostics.push(error('form_check', `module '${id}' needs dir`, `modules.${id}.dir`));
    else {
      try { assertSafeSegment(mod.dir, `module '${id}' dir`); }
      catch (err) { diagnostics.push(error('form_check', errorMessage(err), `modules.${id}.dir`)); }
      const moduleDir = path.join(modulesDir, mod.dir);
      if (!fs.existsSync(moduleDir)) diagnostics.push(error('strict_content_check', `module '${id}' dir does not exist: ${relFromRepo(ctx.repoRoot, moduleDir)}`, `modules.${id}.dir`));
      validateForgeFiles(id, mod, moduleDir, diagnostics);
    }
    if (!Array.isArray(mod.depends_on)) diagnostics.push(error('form_check', `module '${id}' depends_on must be an array`, `modules.${id}.depends_on`));
    else {
      for (const dep of mod.depends_on) {
        if (typeof dep !== 'string') diagnostics.push(error('form_check', `module '${id}' dependency must be a string`, `modules.${id}.depends_on`));
        else if (dep.startsWith('gate:') && !gateIds.has(dep.slice('gate:'.length))) diagnostics.push(error('strict_content_check', `module '${id}' dependency references unrecognized gate '${dep}'`, `modules.${id}.depends_on`));
        else if (!dep.startsWith('gate:') && !moduleIds.has(dep)) diagnostics.push(error('strict_content_check', `module '${id}' dependency references unrecognized module '${dep}'`, `modules.${id}.depends_on`));
      }
    }
    if (mod.stages !== undefined) validateStringArray(mod.stages, VALID_STAGES, diagnostics, `modules.${id}.stages`);
    if (mod.test_suites !== undefined) validateStringArray(mod.test_suites, VALID_SUITES, diagnostics, `modules.${id}.test_suites`);
    validateTestConfig(mod.test_config, Array.isArray(mod.test_suites) ? mod.test_suites : [], ctx, diagnostics, `modules.${id}.test_config`);
  }
}

function validateForgeFiles(id: string, mod: AnyRecord, moduleDir: string, diagnostics: Diagnostic[]): void {
  if (Array.isArray(mod.substeps) && mod.substeps.length > 0) {
    for (const substep of mod.substeps) {
      if (typeof substep !== 'string') {
        diagnostics.push(error('form_check', `module '${id}' substep must be a string`, `modules.${id}.substeps`));
        continue;
      }
      const forgePath = path.join(moduleDir, substep, 'FORGE.md');
      if (!fs.existsSync(forgePath)) diagnostics.push(error('strict_content_check', `module '${id}' substep FORGE.md missing: ${substep}/FORGE.md`, `modules.${id}.substeps`));
    }
    return;
  }
  if (!fs.existsSync(path.join(moduleDir, 'FORGE.md'))) {
    diagnostics.push(error('strict_content_check', `module '${id}' FORGE.md missing`, `modules.${id}.dir`));
  }
}

function validateGates(scaffold: AnyRecord, ctx: Context, diagnostics: Diagnostic[]): void {
  for (const [id, gate] of entriesOf(scaffold.gates)) {
    try { assertSafeSegment(id, `gate id '${id}'`); }
    catch (err) { diagnostics.push(error('form_check', errorMessage(err), `gates.${id}`)); }
    if (!isPlainObject(gate)) {
      diagnostics.push(error('form_check', `gate '${id}' must be an object`, `gates.${id}`));
      continue;
    }
    if (!VALID_GATE_TYPES.has(gate.type)) diagnostics.push(error('form_check', `gate '${id}' type must be one of ${[...VALID_GATE_TYPES].join(', ')}`, `gates.${id}.type`));
    if (!gate.title) diagnostics.push(error('form_check', `gate '${id}' needs title`, `gates.${id}.title`));
    if (gate.type === 'review') validateReviewGate(id, gate, ctx, diagnostics);
    if (gate.type === 'buster') validateBusterGate(id, gate, ctx, diagnostics);
    if (gate.type === 'approval') validateApprovalGate(id, gate, diagnostics);
  }
}

function validateReviewGate(id: string, gate: AnyRecord, ctx: Context, diagnostics: Diagnostic[]): void {
  if (!gate.review_name) diagnostics.push(error('form_check', `review gate '${id}' needs review_name`, `gates.${id}.review_name`));
  if (gate.on_fail !== undefined && !VALID_REVIEW_ON_FAIL.has(gate.on_fail)) {
    diagnostics.push(error('form_check', `review gate '${id}' on_fail must be stop`, `gates.${id}.on_fail`));
  }
  requireExistingSwarmFile(ctx, gate.instructions_file, diagnostics, `gates.${id}.instructions_file`);
  if (!gate.output_file) diagnostics.push(error('form_check', `review gate '${id}' needs output_file`, `gates.${id}.output_file`));
}

function validateBusterGate(id: string, gate: AnyRecord, ctx: Context, diagnostics: Diagnostic[]): void {
  if (gate.on_fail !== undefined && !VALID_BUSTER_ON_FAIL.has(gate.on_fail)) {
    diagnostics.push(error('form_check', `buster gate '${id}' on_fail must be fix_and_retest`, `gates.${id}.on_fail`));
  }
  requireExistingSwarmFile(ctx, gate.instructions_file, diagnostics, `gates.${id}.instructions_file`);
  if (!gate.output_file) diagnostics.push(error('form_check', `buster gate '${id}' needs output_file`, `gates.${id}.output_file`));
  validateStringArray(gate.test_suites, VALID_SUITES, diagnostics, `gates.${id}.test_suites`);
  validateTestConfig(gate.test_config, Array.isArray(gate.test_suites) ? gate.test_suites : [], ctx, diagnostics, `gates.${id}.test_config`);
}

function validateApprovalGate(id: string, gate: AnyRecord, diagnostics: Diagnostic[]): void {
  if (!VALID_ON_TIMEOUT.has(gate.on_timeout)) {
    diagnostics.push(error('form_check', `approval gate '${id}' on_timeout must be block or continue`, `gates.${id}.on_timeout`));
  }
}

function validatePolicy(scaffold: AnyRecord, diagnostics: Diagnostic[]): void {
  const policy = objectOrEmpty(scaffold.policy);
  for (const field of ['arch_validation', 'pipeline_review', 'case_study', 'telemetry']) {
    if (policy[field] !== undefined && !isPlainObject(policy[field])) {
      diagnostics.push(error('form_check', `policy.${field} must be an object`, `policy.${field}`));
    }
    if (policy[field]?.enabled !== undefined && typeof policy[field].enabled !== 'boolean') {
      diagnostics.push(error('form_check', `policy.${field}.enabled must be boolean`, `policy.${field}.enabled`));
    }
  }
}

function validateStringArray(value: unknown, allowed: Set<string>, diagnostics: Diagnostic[], pathLabel: string): void {
  if (!Array.isArray(value)) {
    diagnostics.push(error('form_check', `${pathLabel} must be an array`, pathLabel));
    return;
  }
  for (const entry of value) {
    if (typeof entry !== 'string') diagnostics.push(error('form_check', `${pathLabel} entries must be strings`, pathLabel));
    else if (!allowed.has(entry)) diagnostics.push(error('form_check', `${pathLabel} contains invalid value '${entry}'`, pathLabel));
  }
}

function validateTestConfig(testConfig: unknown, suites: unknown, ctx: Context, diagnostics: Diagnostic[], pathLabel: string): void {
  if (!Array.isArray(suites) || suites.length === 0) return;
  if (!isPlainObject(testConfig)) {
    diagnostics.push(error('form_check', `${pathLabel} must be an object when test_suites are configured`, pathLabel));
    return;
  }
  if (suites.includes('api')) requireExistingSwarmFile(ctx, testConfig.api?.spec_file, diagnostics, `${pathLabel}.api.spec_file`);
  if (suites.includes('visual-reg')) {
    const visualRegConfig = testConfig['visual-reg'];
    if (isPlainObject(visualRegConfig) && visualRegConfig[REMOVED_VISUAL_REG_PATH_FIELD] !== undefined) {
      diagnostics.push(error('form_check', `${pathLabel}.visual-reg.${REMOVED_VISUAL_REG_PATH_FIELD} is removed; use ${VISUAL_REG_PATHS_FIELD}`, `${pathLabel}.visual-reg.${REMOVED_VISUAL_REG_PATH_FIELD}`));
    }
    requireExistingSwarmFile(ctx, visualRegConfig?.[VISUAL_REG_PATHS_FIELD], diagnostics, `${pathLabel}.visual-reg.${VISUAL_REG_PATHS_FIELD}`);
  }
  if (suites.includes('unit') && typeof testConfig.unit?.test_cmd !== 'string') {
    diagnostics.push(error('form_check', `${pathLabel}.unit.test_cmd must be a string`, `${pathLabel}.unit.test_cmd`));
  }
  if (testConfig.serve) {
    if (typeof testConfig.serve.project_dir !== 'string') diagnostics.push(error('form_check', `${pathLabel}.serve.project_dir must be a string`, `${pathLabel}.serve.project_dir`));
    if (typeof testConfig.serve.start_cmd !== 'string' && typeof testConfig.serve.build_cmd !== 'string') diagnostics.push(error('form_check', `${pathLabel}.serve needs start_cmd or build_cmd`, `${pathLabel}.serve`));
    if (testConfig.serve.port !== undefined && (!Number.isInteger(testConfig.serve.port) || testConfig.serve.port <= 0)) diagnostics.push(error('form_check', `${pathLabel}.serve.port must be a positive integer`, `${pathLabel}.serve.port`));
    if (testConfig.serve.dockerfile) validateRepoPath(ctx, testConfig.serve.dockerfile, diagnostics, `${pathLabel}.serve.dockerfile`);
  }
  if (suites.includes('manifest')) {
    validateRepoPath(ctx, testConfig.manifest?.deployment_yaml, diagnostics, `${pathLabel}.manifest.deployment_yaml`);
  }
  if (suites.includes('k8s')) {
    const k8s = objectOrEmpty(testConfig.k8s);
    validateRepoPath(ctx, k8s.dockerfile, diagnostics, `${pathLabel}.k8s.dockerfile`);
    if (!Array.isArray(k8s.manifests) || k8s.manifests.length === 0) diagnostics.push(error('form_check', `${pathLabel}.k8s.manifests must be a non-empty array`, `${pathLabel}.k8s.manifests`));
    else for (const manifest of k8s.manifests) validateRepoPath(ctx, manifest, diagnostics, `${pathLabel}.k8s.manifests`);
    if (!k8s.image_name) diagnostics.push(error('form_check', `${pathLabel}.k8s.image_name is required`, `${pathLabel}.k8s.image_name`));
    if (!k8s.service_name) diagnostics.push(error('form_check', `${pathLabel}.k8s.service_name is required`, `${pathLabel}.k8s.service_name`));
    if (k8s.cleanup_policy && !VALID_CLEANUP_POLICY.has(k8s.cleanup_policy)) diagnostics.push(error('form_check', `${pathLabel}.k8s.cleanup_policy must be delete or keep`, `${pathLabel}.k8s.cleanup_policy`));
    if (k8s.preview?.provider && !VALID_PREVIEW.has(k8s.preview.provider)) diagnostics.push(error('form_check', `${pathLabel}.k8s.preview.provider must be off or tailscale-ingress`, `${pathLabel}.k8s.preview.provider`));
  }
}

function requireExistingSwarmFile(ctx: Context, relPath: unknown, diagnostics: Diagnostic[], pathLabel: string): void {
  if (typeof relPath !== 'string' || !relPath.trim()) {
    diagnostics.push(error('form_check', `${pathLabel} must be a non-empty string`, pathLabel));
    return;
  }
  requireSafeRelativePath(relPath, diagnostics, pathLabel);
  const resolved = path.resolve(ctx.swarmDir, relPath);
  if (!resolved.startsWith(`${ctx.swarmDir}${path.sep}`) && resolved !== ctx.swarmDir) {
    diagnostics.push(error('form_check', `${pathLabel} must stay inside .swarm`, pathLabel));
    return;
  }
  if (!fs.existsSync(resolved)) diagnostics.push(error('strict_content_check', `${pathLabel} does not exist: ${relPath}`, pathLabel));
}

function requireExistingRepoFile(ctx: Context, relPath: unknown, diagnostics: Diagnostic[], pathLabel: string): void {
  if (!validateRepoPath(ctx, relPath, diagnostics, pathLabel)) return;
  const resolved = path.resolve(ctx.repoRoot, relPath);
  if (!fs.existsSync(resolved)) diagnostics.push(error('strict_content_check', `${pathLabel} does not exist: ${relPath}`, pathLabel));
}

function validateRepoPath(ctx: Context, relPath: unknown, diagnostics: Diagnostic[], pathLabel: string): boolean {
  if (typeof relPath !== 'string' || !relPath.trim()) {
    diagnostics.push(error('form_check', `${pathLabel} must be a non-empty string`, pathLabel));
    return false;
  }
  requireSafeRelativePath(relPath, diagnostics, pathLabel);
  const resolved = path.resolve(ctx.repoRoot, relPath);
  if (!resolved.startsWith(`${ctx.repoRoot}${path.sep}`) && resolved !== ctx.repoRoot) {
    diagnostics.push(error('form_check', `${pathLabel} must stay inside repository root`, pathLabel));
    return false;
  }
  return true;
}

function requireSafeRelativePath(relPath: string, diagnostics: Diagnostic[], pathLabel: string): void {
  if (relPath.includes('\0') || /[\r\n]/.test(relPath) || path.isAbsolute(relPath) || relPath.split(/[\\/]+/).includes('..')) {
    diagnostics.push(error('form_check', `${pathLabel} must be a safe relative path`, pathLabel));
  }
}

function error(kind: Diagnostic['kind'], message: string, field: string): Diagnostic {
  return { level: 'error', kind, field, message };
}

function printDiagnostics(diagnostics: Diagnostic[]): void {
  if (!diagnostics.length) {
    console.log('progress scaffold validation passed');
    return;
  }
  console.log(`progress scaffold diagnostics (${diagnostics.length}):`);
  for (const diagnostic of diagnostics) {
    console.log(`- [${diagnostic.kind}] ${diagnostic.field}: ${diagnostic.message}`);
  }
}

function diffSummary(existing: unknown, next: unknown): string {
  if (!existing) return 'progress.json will be created';
  const before = JSON.stringify(existing, null, 2);
  const after = JSON.stringify(next, null, 2);
  if (before === after) return 'progress.json is already current';
  const beforeLines = before.split('\n').length;
  const afterLines = after.split('\n').length;
  return `progress.json will change (${beforeLines} -> ${afterLines} JSON lines)`;
}

function run(argv: string[] = process.argv.slice(2)): number {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const ctx = resolveContext(args);
  if (!fs.existsSync(ctx.swarmDir)) throw new Error(`.swarm directory not found: ${ctx.swarmDir}`);

  if (args.apply || args.check || args.print) {
    const scaffold = readJsonIfExists(ctx.scaffoldFile);
    if (!scaffold) throw new Error(`Scaffold file not found. Run without --apply first: ${ctx.scaffoldFile}`);
    const { progress, diagnostics } = scaffoldToProgress(scaffold, ctx);
    printDiagnostics(diagnostics);
    if (args.check) return 0;
    if (args.print) {
      console.log(JSON.stringify(progress, null, 2));
      return 0;
    }
    const existing = readJsonIfExists(ctx.progressFile);
    console.log(diffSummary(existing, progress));
    writeJson(ctx.progressFile, progress);
    console.log(`wrote ${relFromRepo(ctx.repoRoot, ctx.progressFile)}`);
    return 0;
  }

  const scaffold = buildScaffold(ctx);
  writeJson(ctx.scaffoldFile, scaffold);
  const diagnostics = validateScaffold(scaffold, ctx);
  console.log(`wrote ${relFromRepo(ctx.repoRoot, ctx.scaffoldFile)}`);
  printDiagnostics(diagnostics);
  console.log('Next: fill the scaffold gaps, then rerun with --apply.');
  return 0;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  try {
    process.exitCode = run();
  } catch (err) {
    const scaffoldError = err as ScaffoldError;
    console.error(errorMessage(err));
    if (scaffoldError.diagnostics) printDiagnostics(scaffoldError.diagnostics);
    process.exitCode = 1;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export {
  buildScaffold,
  scaffoldToProgress,
  validateScaffold,
  run,
};
