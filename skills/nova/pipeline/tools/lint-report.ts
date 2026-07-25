#!/usr/bin/env node

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// =============================================================================
// LINT-REPORT.JS — Deterministic Static Analysis Aggregator
// =============================================================================
//
// Runs applicable static analysis tools against a project or module scope,
// aggregates findings into a structured JSON report. Two tiers:
//
//   Tier 1 (pre-check): tsc + ruff + shellcheck — fast (<10s), after every Forge
//   Tier 2 (full):       All applicable tools — before Review Gates
//
// Usage:
//   node lint-report.ts --repo /workspace/forgestack --policy /config/lint-policy.json --policy-project workspace --tier full --output /tmp/lint-report.json
//   node lint-report.ts --repo /workspace/forgestack --tier pre-check --module-path Projects/kubecommand/src/modules/06
//   node lint-report.ts --repo /workspace/forgestack --tier full --changed-files "src/handler.ts,src/auth.ts"
//   node lint-report.ts --help
//
// Output: JSON file with per-tool status, findings, and summary.
// Every tool is wrapped with timeout and error handling — a single tool failure
// never crashes the entire report.
//
// Design principle: same as pipeline.ts — deterministic, no LLM involvement,
// scripts don't forget instructions.
//
// =============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { DEFAULT_TIER, TIERS } from './lint-report/constants.ts';
import { detectProjectTypes, resolveScope, takeDiscoveryDiagnostics } from './lint-report/discovery.ts';
import { log, printHelp, setLintLogPath, writeReport } from './lint-report/output.ts';
import { runAllTools as runToolsForRegistry } from './lint-report/report.ts';
import { validateLintReport } from './lint-report/report-contract.ts';
import { loadLintPolicy, policyDigest, selectPolicyProject, validatePolicyTargetPaths } from './lint-report/policy.ts';
import { buildToolRegistry, TOOL_ADAPTERS } from './lint-report/tool-registry.ts';
import { parseCliFlagValues } from '../cli-args.ts';

async function runAllTools(ctx: any) {
  return runToolsForRegistry(ctx, buildToolRegistry(ctx.policy, ctx.projectTypes));
}

function lintReportExitCode(report: any = {}) {
  const totalBlocking = Number(selectDefinedValue(() => (report?.summary?.total_blocking), () => (0)));
  const toolsFailed = Number(selectDefinedValue(() => (report?.summary?.tools_failed), () => (0)));
  return selectTruthyValue(() => (totalBlocking > 0), () => (toolsFailed > 0)) ? 1 : 0;
}

function parseArgs(args: any = process.argv.slice(2)) {
  return parseCliFlagValues(args, {
    flags: {
      repo: { type: 'string' },
      tier: { type: 'string' },
      'module-path': { type: 'string' },
      project: { type: 'string' },
      output: { type: 'string' },
      policy: { type: 'string' },
      'policy-project': { type: 'string' },
      'changed-files': { type: 'string' },
      'log-path': { type: 'string' },
      'include-debt': { type: 'boolean', default: false }, 'include-experimental': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
}

function normalizeModulePath(repoRoot: any, rawModulePath: any) {
  if (!rawModulePath) return null;
  if (path.isAbsolute(rawModulePath)) {
    throw new Error('ERROR: --module-path must be relative to --repo.');
  }

  const modulePath = path.normalize(rawModulePath);
  const moduleRoot = path.resolve(repoRoot, modulePath);
  const relativeToRepo = path.relative(repoRoot, moduleRoot);
  if (selectTruthyValue(() => (relativeToRepo.startsWith('..')), () => (path.isAbsolute(relativeToRepo)))) {
    throw new Error(`ERROR: --module-path escapes --repo: ${rawModulePath}`);
  }

  return modulePath;
}

function buildContext(flags: any) {
  if (!flags.repo) {
    throw new Error('ERROR: --repo is required. Use --help for usage.');
  }
  if (!flags.policy) throw new Error('ERROR: --policy is required.');
  if (!flags['policy-project']) throw new Error('ERROR: --policy-project is required.');

  const repoRoot = path.resolve(flags.repo);
  if (!fs.existsSync(repoRoot)) {
    throw new Error(`ERROR: repo path does not exist: ${repoRoot}`);
  }

  const tier = lintReportTierAuthority(flags);
  if (!Object.hasOwn(TIERS, tier)) {
    throw new Error(`ERROR: unknown tier '${tier}'. Valid: ${Object.keys(TIERS).join(', ')}`);
  }

  const changedFiles = flags['changed-files']
    ? flags['changed-files'].split(',').map((f: any) => f.trim()).filter(Boolean)
    : [];

  const modulePath = normalizeModulePath(repoRoot, flags['module-path']);
  const policyPath = flags.policy;
  const policy = loadLintPolicy(policyPath);
  const policyProject = selectPolicyProject(policy, flags['policy-project']);
  validatePolicyTargetPaths(repoRoot, policy, policyProject);
  const { types: projectTypes } = detectProjectTypes(repoRoot, policyProject, policy.global_exclusions);
  const discoveryDiagnostics = takeDiscoveryDiagnostics();

  return {
    repoRoot,
    modulePath,
    project: lintReportProjectAuthority(flags, repoRoot),
    tier,
    changedFiles,
    changedFilesRequested: changedFiles.length > 0,
    projectTypes,
    policy,
    policyPath,
    policyDigest: policyDigest(policy),
    policyProject,
    includeDebt: flags['include-debt'] === true, includeExperimental: flags['include-experimental'] === true,
    diagnostics: discoveryDiagnostics,
  };
}

function lintReportTierAuthority(flags: any) {
  if (flags.tier) return flags.tier;
  return DEFAULT_TIER;
}

function lintReportProjectAuthority(flags: any, repoRoot: any) {
  if (flags.project) return flags.project;
  return path.basename(repoRoot);
}

async function main() {
  const flags = parseArgs();

  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  if (flags['log-path']) {
    setLintLogPath(flags['log-path']);
  }

  let ctx;
  try {
    ctx = buildContext(flags);
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }

  if (ctx.changedFiles.length > 0) {
    ctx.changedFiles = resolveScope(ctx);
  } else {
    resolveScope(ctx);
  }
  ctx.diagnostics = [
    ...(Array.isArray(ctx.diagnostics) ? ctx.diagnostics : []),
    ...takeDiscoveryDiagnostics(),
  ];

  log('INFO', `Starting lint report (tier: ${ctx.tier}, types: ${[...ctx.projectTypes].join(', ')})`);
  const report = await runAllTools(ctx);
  validateLintReport(report);
  writeReport(report, selectTruthyValue(() => (flags.output), () => (null)));

  // Exit with error code if findings or tool failures make the report non-clean.
  process.exit(lintReportExitCode(report));
}

// ─── Exports (for pipeline.ts to import directly) ──────────────────────────

export { buildContext, lintReportExitCode, normalizeModulePath, runAllTools, detectProjectTypes, TOOL_ADAPTERS, TIERS };
export default main;

// ─── Direct execution ──────────────────────────────────────────────────────

const __currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const __entryPath = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

if (__currentPath === __entryPath) {
  main().catch((e: any) => {
    log('ERROR', e.message);
    process.exit(1);
  });
}
