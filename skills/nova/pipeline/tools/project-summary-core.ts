import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Skill: project-summary — Project Lifecycle Report
// ═══════════════════════════════════════════════════════════════
//
// Generates a comprehensive summary of a KubeClaw project:
// code stats, test metrics, agent invocations, gate results,
// quality indicators, timeline, and failure analysis.
//
// Data sources:
//   - progress.json             (module/gate definitions)
//   - lifecycle/read-models.json (per-module: attempts, timestamps, cost)
//   - runner-verdict.json       (per-module: suite results, checks, findings)
//   - test-spec.json            (API test counts per module)
//   - echo review JSONs         (critical/deferred issues, verdicts)
//   - pipeline.jsonl            (structured agent invocation telemetry)
//   - git + source files        (LOC, commits, unit test functions)
//
// Usage:
//   node project-summary.ts --project kubecommand
//   node project-summary.ts --project kubecommand --discord
//   node project-summary.ts --project kubecommand --output /tmp/summary.md
//   node project-summary.ts --project kubecommand --json

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { parseCliArgs } from '../cli-args.ts';
import { getRepoRoot } from '../core/git-context.ts';
import { loadPlatformSwarmConfig } from '../core/platform-config.ts';
import { discordEmbeds } from '../integrations/discord.ts';
import { normalizeLifecycleStatus } from '../lifecycle-state.ts';
import { sanitizeJsonEgress, sanitizeMarkdownText } from '../egress.ts';
import { buildSubprocessEnv, resolveScopedPath, validateAllowedPath } from '../security.ts';
import { buildCaseStudyBase, buildDiscordEmbeds, buildMarkdown, pct } from './project-summary-formatters.ts';
import { addDiagnostic, discoverLatestLifecycleReadModels, extToLang, readJsonData, readJsonRecord } from './project-summary-lifecycle.ts';
import { discoverLatestRun } from '../run-discovery.ts';
import { readNovaEnvironment } from '../core/runtime-environment.ts';
import type { NovaEnvironmentKey } from '../core/runtime-environment.ts';
// ── Helpers ─────────────────────────────────────────────────────

export function firstDefined(...values: any) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function isRecord(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function recordOrEmpty(value: any): Record<string, any> {
  return isRecord(value) ? value : {};
}

export function arrayOrEmpty(value: any) {
  return Array.isArray(value) ? value : [];
}

export function entriesOf(value: any): Array<[string, Record<string, any>]> {
  return Object.entries(recordOrEmpty(value));
}

export function keysOf(value: any) {
  return Object.keys(recordOrEmpty(value));
}

export function countMatches(text: any, regex: any) {
  const matches = String(text).match(regex);
  return matches ? matches.length : 0;
}

export function numberOrZero(value: any) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function integerTextOrZero(value: any) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function firstNonEmptyLine(value: any) {
  return selectDefinedValue(() => (String(value).split('\n').find((line: any) => line.trim().length > 0)), () => (null));
}

export function requiredNonEmptyConfigString(value: any, field: any) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) {
    throw new Error(`${field}: required non-empty string in normalized swarm config`);
  }
  return value.trim();
}

export function optionalEnvString(name: NovaEnvironmentKey) {
  const value = readNovaEnvironment(name);
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function envFlag(name: any) {
  const value = optionalEnvString(name);
  const normalized = value === null ? '' : value.toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

export function projectSummaryDiscordMuted(opts: any = {}) {
  return [opts.disableDiscordWebhooks === true, envFlag('KUBECLAW_DISABLE_DISCORD_WEBHOOKS')].some(Boolean);
}

export function resolveRepoDir(repoDir: any = null) {
  const explicitRepo = selectDefinedValue(() => (repoDir), () => (null));
  let resolvedRepo;
  if (explicitRepo) {
    resolvedRepo = path.resolve(explicitRepo);
  } else {
    try {
      resolvedRepo = getRepoRoot();
    } catch (_error: any) {
      throw new Error('Cannot determine repo root. Use --repo <path>, set REPO_ROOT, or run from within the git repo');
    }
  }
  if (!fs.existsSync(path.join(resolvedRepo, '.git'))) {
    throw new Error(`Repo root '${resolvedRepo}' is not a git repository (no .git directory)`);
  }
  return resolvedRepo;
}

export function git(repoDir: any, args: any, diagnostics: any = null) {
  try {
    return {
      ok: true,
      stdout: execFileSync('git', ['-C', repoDir, ...args], {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 50 * 1024 * 1024,
        env: buildSubprocessEnv(),
      }).trim(),
    };
  } catch (error: any) {
    const diag = {
      source: 'git',
      status: 'unavailable',
      command: ['git', '-C', repoDir, ...args],
      reason: selectTruthyValue(() => (error?.message), () => ('missing_error_message')),
    };
    addDiagnostic(diagnostics, diag);
    return { ok: false, stdout: '', diagnostic: diag };
  }
}

export function gitText(repoDir: any, args: any, diagnostics: any = null) {
  return git(repoDir, args, diagnostics).stdout;
}

// ── Resolve project paths ───────────────────────────────────────

export function validateProjectSelector(project: any) {
  if (selectTruthyValue(() => (!project), () => (typeof project !== 'string'))) {
    throw new Error('project-summary.project: project is empty or not a string');
  }
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (project.includes('\0')), () => (project === '.'))), () => (project === '..'))), () => (/[\\/]/.test(project)))), () => (project.split(/[\\/]/).includes('..')))) {
    throw new Error(`project-summary.project: invalid project selector '${project}'`);
  }
  return project;
}

export function resolveProjectPaths(project: any, repoDir: any, configPath: any) {
  const { config: swarmConfig } = configPath
    ? loadPlatformSwarmConfig(configPath)
    : loadPlatformSwarmConfig();
  const safeProject = validateProjectSelector(project);
  const projectsRoot = requiredNonEmptyConfigString(resolveScopedPath(requiredNonEmptyConfigString(swarmConfig.projects_root, 'config.projects_root'), {
    baseDir: repoDir,
    scopeDir: repoDir,
    field: 'project-summary.projectsRoot',
    scopeDescription: 'repository root',
  }), 'project-summary.projectsRoot');
  const projectRoot = requiredNonEmptyConfigString(resolveScopedPath(path.join(safeProject, 'src'), {
    baseDir: projectsRoot,
    scopeDir: projectsRoot,
    field: 'project-summary.projectRoot',
    scopeDescription: 'configured projects root',
  }), 'project-summary.projectRoot');
  const swarmRoot = requiredNonEmptyConfigString(resolveScopedPath('.swarm', {
    baseDir: projectRoot,
    scopeDir: projectRoot,
    field: 'project-summary.swarmRoot',
    scopeDescription: 'project source root',
  }), 'project-summary.swarmRoot');
  const progressPath = requiredNonEmptyConfigString(resolveScopedPath('progress.json', {
    baseDir: swarmRoot,
    scopeDir: swarmRoot,
    field: 'project-summary.progressPath',
    scopeDescription: 'project swarm root',
  }), 'project-summary.progressPath');
  return { projectRoot, swarmRoot, progressPath };
}

// ═══════════════════════════════════════════════════════════════
// DATA COLLECTORS
// ═══════════════════════════════════════════════════════════════

// ── 1. Code Stats ───────────────────────────────────────────────
