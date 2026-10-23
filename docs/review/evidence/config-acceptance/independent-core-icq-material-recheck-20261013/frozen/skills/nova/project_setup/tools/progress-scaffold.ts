#!/usr/bin/env node

import fs from 'node:fs';
import {publishJsonPair} from '@kubeclaw/plugin-foundation/config/published-pair';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScaffold } from './progress-scaffold-discovery.ts';
import { scaffoldToProgress, validateScaffold } from './progress-scaffold-validation.ts';
import {
  errorMessage,
  readJsonIfExists,
  relFromRepo,
  writeJson,
} from './progress-scaffold-values.ts';
import type { Args, Context, Diagnostic } from './progress-scaffold-values.ts';

const DEFAULT_SCAFFOLD_FILE = 'progress.scaffold.json';

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
  --apply                Validate scaffold and write progress.json plus pipeline.json
  --check                Validate scaffold/progress without writing
  --print                Print generated progress JSON
  --help                 Show this help
`;
}

function requireValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
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
  const valueFlags: Record<string, keyof Pick<Args, 'project' | 'repo' | 'swarm' | 'scaffold'>> = {
    '--project': 'project',
    '--repo': 'repo',
    '--swarm': 'swarm',
    '--scaffold': 'scaffold',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') args.apply = true;
    else if (argument === '--check') args.check = true;
    else if (argument === '--print') args.print = true;
    else if (argument === '--help' || argument === '-h') args.help = true;
    else if (argument && valueFlags[argument]) args[valueFlags[argument]] = requireValue(argv, ++index, argument);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (args.apply && args.check) throw new Error('Use either --apply or --check, not both.');
  if (!args.help && !args.project && !args.swarm) throw new Error('Provide --project <name> or --swarm <path>.');
  return args;
}

function findRepoRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error('Cannot find repository root. Pass --repo <path>.');
    current = parent;
  }
}

function safeProject(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('project must be a non-empty string.');
  if (!/^[A-Za-z0-9._-]+$/.test(value) || value.includes('..')) throw new Error(`project must be a safe path segment: ${value}`);
  return value;
}

function inferProject(swarmDir: string) {
  const parts = swarmDir.split(path.sep);
  const projectsIndex = parts.lastIndexOf('Projects');
  return projectsIndex >= 0 ? parts[projectsIndex + 1] : null;
}

function resolveContext(args: Args): Context {
  const repoRoot = path.resolve(args.repo ?? findRepoRoot());
  if (!fs.existsSync(path.join(repoRoot, '.git'))) throw new Error(`Repo root is not a git repository: ${repoRoot}`);
  const swarmDir = args.swarm
    ? path.resolve(args.swarm)
    : path.join(repoRoot, 'Projects', safeProject(args.project), 'src', '.swarm');
  const project = args.project ?? inferProject(swarmDir);
  if (!project) throw new Error('Cannot infer project name from --swarm; pass --project too.');
  return {
    repoRoot,
    project,
    swarmDir,
    scaffoldFile: args.scaffold ? path.resolve(args.scaffold) : path.join(swarmDir, DEFAULT_SCAFFOLD_FILE),
    progressFile: path.join(swarmDir, 'progress.json'),
    pipelineFile: path.join(swarmDir, 'pipeline.json'),
  };
}

function printDiagnostics(diagnostics: Diagnostic[]) {
  if (!diagnostics.length) {
    console.log('progress scaffold validation passed');
    return;
  }
  console.log(`progress scaffold diagnostics (${diagnostics.length}):`);
  diagnostics.forEach((item) => console.log(`- [${item.kind}] ${item.field}: ${item.message}`));
}

function diffSummary(existing: unknown, next: unknown) {
  if (!existing) return 'progress.json will be created';
  const before = JSON.stringify(existing, null, 2);
  const after = JSON.stringify(next, null, 2);
  if (before === after) return 'progress.json is already current';
  return `progress.json will change (${before.split('\n').length} -> ${after.split('\n').length} JSON lines)`;
}

async function applyScaffold(args: Args, context: Context) {
  const scaffold = readJsonIfExists(context.scaffoldFile);
  if (!scaffold) throw new Error(`Scaffold file not found. Run without --apply first: ${context.scaffoldFile}`);
  const { progress, pipeline, diagnostics } = scaffoldToProgress(scaffold, context);
  printDiagnostics(diagnostics);
  if (args.check) return 0;
  if (args.print) {
    console.log(JSON.stringify({ progress, pipeline }, null, 2));
    return 0;
  }
  console.log(diffSummary(readJsonIfExists(context.progressFile), progress));
  await publishJsonPair(context.swarmDir,['progress.json','pipeline.json'],[progress,pipeline]);
  console.log(`wrote ${relFromRepo(context.repoRoot, context.progressFile)}`);
  console.log(`wrote ${relFromRepo(context.repoRoot, context.pipelineFile)}`);
  return 0;
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const context = resolveContext(args);
  if (!fs.existsSync(context.swarmDir)) throw new Error(`.swarm directory not found: ${context.swarmDir}`);
  if (args.apply || args.check || args.print) return applyScaffold(args, context);
  const scaffold = buildScaffold(context);
  writeJson(context.scaffoldFile, scaffold);
  console.log(`wrote ${relFromRepo(context.repoRoot, context.scaffoldFile)}`);
  printDiagnostics(validateScaffold(scaffold, context));
  console.log('Next: fill the progress and provider-plan gaps, then rerun with --apply.');
  return 0;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  try {
    process.exitCode = await run();
  } catch (error) {
    const scaffoldError = error as Error & { diagnostics?: Diagnostic[] };
    console.error(errorMessage(error));
    if (scaffoldError.diagnostics) printDiagnostics(scaffoldError.diagnostics);
    process.exitCode = 1;
  }
}

export { buildScaffold, scaffoldToProgress, validateScaffold };
