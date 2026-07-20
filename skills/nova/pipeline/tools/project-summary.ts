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
// ── Helpers ─────────────────────────────────────────────────────

function log(msg) { console.log(`[SUMMARY] ${sanitizeMarkdownText(msg)}`); }

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordOrEmpty(value) {
  return isRecord(value) ? value : {};
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function entriesOf(value) {
  return Object.entries(recordOrEmpty(value));
}

function keysOf(value) {
  return Object.keys(recordOrEmpty(value));
}

function countMatches(text, regex) {
  const matches = String(text).match(regex);
  return matches ? matches.length : 0;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function integerTextOrZero(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstNonEmptyLine(value) {
  return selectDefinedValue(() => (String(value).split('\n').find((line) => line.trim().length > 0)), () => (null));
}

function requiredNonEmptyConfigString(value, field) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) {
    throw new Error(`${field}: required non-empty string in normalized swarm config`);
  }
  return value.trim();
}

function optionalEnvString(name) {
  const value = process.env[name];
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function envFlag(name) {
  const value = optionalEnvString(name);
  const normalized = value === null ? '' : value.toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function projectSummaryDiscordMuted(opts = {}) {
  return [opts.disableDiscordWebhooks === true, envFlag('KUBECLAW_DISABLE_DISCORD_WEBHOOKS')].some(Boolean);
}

function resolveRepoDir(repoDir = null) {
  const explicitRepo = selectDefinedValue(() => (repoDir), () => (null));
  let resolvedRepo;
  if (explicitRepo) {
    resolvedRepo = path.resolve(explicitRepo);
  } else {
    try {
      resolvedRepo = getRepoRoot();
    } catch (_error) {
      throw new Error('Cannot determine repo root. Use --repo <path>, set REPO_ROOT, or run from within the git repo');
    }
  }
  if (!fs.existsSync(path.join(resolvedRepo, '.git'))) {
    throw new Error(`Repo root '${resolvedRepo}' is not a git repository (no .git directory)`);
  }
  return resolvedRepo;
}

function git(repoDir, args, diagnostics = null) {
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
  } catch (error) {
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

function gitText(repoDir, args, diagnostics = null) {
  return git(repoDir, args, diagnostics).stdout;
}

// ── Resolve project paths ───────────────────────────────────────

function validateProjectSelector(project) {
  if (selectTruthyValue(() => (!project), () => (typeof project !== 'string'))) {
    throw new Error('project-summary.project: project is empty or not a string');
  }
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (project.includes('\0')), () => (project === '.'))), () => (project === '..'))), () => (/[\\/]/.test(project)))), () => (project.split(/[\\/]/).includes('..')))) {
    throw new Error(`project-summary.project: invalid project selector '${project}'`);
  }
  return project;
}

function resolveProjectPaths(project, repoDir, configPath) {
  const { config: swarmConfig } = configPath
    ? loadPlatformSwarmConfig(configPath)
    : loadPlatformSwarmConfig();
  const safeProject = validateProjectSelector(project);
  const projectsRoot = resolveScopedPath(requiredNonEmptyConfigString(swarmConfig.projects_root, 'config.projects_root'), {
    baseDir: repoDir,
    scopeDir: repoDir,
    field: 'project-summary.projectsRoot',
    scopeDescription: 'repository root',
  });
  const projectRoot = resolveScopedPath(path.join(safeProject, 'src'), {
    baseDir: projectsRoot,
    scopeDir: projectsRoot,
    field: 'project-summary.projectRoot',
    scopeDescription: 'configured projects root',
  });
  const swarmRoot = resolveScopedPath('.swarm', {
    baseDir: projectRoot,
    scopeDir: projectRoot,
    field: 'project-summary.swarmRoot',
    scopeDescription: 'project source root',
  });
  const progressPath = resolveScopedPath('progress.json', {
    baseDir: swarmRoot,
    scopeDir: swarmRoot,
    field: 'project-summary.progressPath',
    scopeDescription: 'project swarm root',
  });
  return { projectRoot, swarmRoot, progressPath };
}

// ═══════════════════════════════════════════════════════════════
// DATA COLLECTORS
// ═══════════════════════════════════════════════════════════════

// ── 1. Code Stats ───────────────────────────────────────────────

function collectCodeStats(repoDir, projectRoot, diagnostics = null) {
  const relProject = path.relative(repoDir, projectRoot);
  let tracked = gitText(repoDir, ['ls-files', '--', relProject], diagnostics)
    .split('\n').filter(Boolean);

  // Fallback: walk filesystem when git ls-files returns no tracked project files.
  if (tracked.length === 0) {
    const walkFiles = (dir, base) => {
      const results = [];
      if (!fs.existsSync(dir)) return results;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '__pycache__', '.git', '.venv', 'venv'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const rel = path.join(base, entry.name);
        if (entry.isDirectory()) results.push(...walkFiles(full, rel));
        else results.push(rel);
      }
      return results;
    };
    tracked = walkFiles(projectRoot, relProject);
  }

  let totalLines = 0, totalFiles = 0, codeLines = 0;
  const byLang = {};
  const binaryExts = new Set(['.png','.jpg','.gif','.ico','.woff','.woff2','.ttf','.eot','.zip','.tar','.gz','.db','.sqlite']);

  for (const file of tracked) {
    const filePath = path.join(repoDir, file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const stat = fs.statSync(filePath);
      if (selectTruthyValue(() => (stat.isDirectory()), () => (stat.size > 2 * 1024 * 1024))) continue;
      const ext = path.extname(file).toLowerCase();
      if (binaryExts.has(ext)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').length;
      totalLines += lines;
      totalFiles++;
      const isSwarm = file.includes('.swarm/');
      const lang = extToLang(ext);
      if (!byLang[lang]) byLang[lang] = { total: 0, code: 0, swarm: 0 };
      byLang[lang].total += lines;
      if (isSwarm) byLang[lang].swarm += lines; else { byLang[lang].code += lines; codeLines += lines; }
    } catch (_error) { /* skip */ }
  }

  const swarmFiles = tracked.filter(f => f.includes('.swarm/')).length;
  const codeFiles = totalFiles - swarmFiles;
  const commitCount = integerTextOrZero(gitText(repoDir, ['rev-list', '--count', 'HEAD', '--', relProject], diagnostics));
  const authors = [...new Set(gitText(repoDir, ['log', '--format=%aN', '--', relProject], diagnostics).split('\n').filter(Boolean))].sort();
  const firstCommit = firstNonEmptyLine(gitText(repoDir, ['log', '--reverse', '--format=%aI', '--', relProject], diagnostics));
  const lastCommit = gitText(repoDir, ['log', '-1', '--format=%aI', '--', relProject], diagnostics);

  return { totalLines, codeLines, totalFiles, codeFiles, swarmFiles, byLang, commitCount, authors,
    firstCommit, lastCommit: firstNonEmptyLine(lastCommit) };
}

// ── 2. Unit Test Census (from source code) ──────────────────────

function collectUnitTestCensus(projectRoot) {
  const result = { python: { files: 0, functions: 0, lines: 0 }, frontend: { files: 0, functions: 0, lines: 0 } };
  const skipDirs = new Set(['node_modules', '__pycache__', '.swarm', '.git', '.venv', 'venv', 'dist', 'build', '.next']);

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(full);
        continue;
      }

      try {
        // Python: any test_*.py file anywhere in the project
        if (entry.name.startsWith('test_') && entry.name.endsWith('.py')) {
          const content = fs.readFileSync(full, 'utf8');
          const funcs = countMatches(content, /(?:def|async def) test_/g);
          if (funcs > 0) {
            result.python.files++;
            result.python.functions += funcs;
            result.python.lines += content.split('\n').length;
          }
          continue;
        }

        // Frontend: any *.test.{ts,tsx,js,jsx} or *.spec.{ts,tsx,js,jsx}
        if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf8');
          const blocks = countMatches(content, /\bit\(|\btest\(|\bdescribe\(/g);
          if (blocks > 0) {
            result.frontend.files++;
            result.frontend.functions += blocks;
            result.frontend.lines += content.split('\n').length;
          }
        }
      } catch (_error) { /* skip unreadable */ }
    }
  };

  walk(projectRoot);
  result.totalFunctions = result.python.functions + result.frontend.functions;
  result.totalFiles = result.python.files + result.frontend.files;
  return result;
}

// ── 3. API Test Spec Census ─────────────────────────────────────

function collectApiTestCensus(swarmRoot, diagnostics = null) {
  const specs = [];
  let totalCases = 0;

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name !== 'test-spec.json') continue;
      const data = readJsonData(full, diagnostics);
      if (!data?.tests) continue;
      const [, modDir = null] = path.relative(swarmRoot, full).split('/');
      if (!modDir) {
        addDiagnostic(diagnostics, {
          source: 'api_test_census',
          status: 'module_dir_missing',
          path: full,
          optional: true,
        });
        continue;
      }
      const count = data.tests.length;
      specs.push({ module: modDir, count });
      totalCases += count;
    }
  };
  walk(swarmRoot);
  return { specs, totalCases };
}

// ── 4. Pipeline Stats (lifecycle read models) ───────────────────

function collectPipelineStats(progress, swarmRoot, diagnostics = null) {
  const modules = recordOrEmpty(progress.modules);
  const gates = recordOrEmpty(progress.gates);
  const lifecycleSnapshot = discoverLatestLifecycleReadModels(swarmRoot, readJsonData, diagnostics);
  const lifecycleModules = recordOrEmpty(lifecycleSnapshot.data?.modules);
  const lifecycleGates = recordOrEmpty(lifecycleSnapshot.data?.gates);

  const moduleStats = [];
  let totalAttempts = 0, totalDuration = 0;
  let totalForgeIn = 0, totalForgeOut = 0, totalBusterIn = 0, totalBusterOut = 0;
  let passedFirstTry = 0, totalCompleted = 0, totalBlocked = 0, totalPending = 0;
  let earliestStart = null, latestComplete = null;

  for (const [id, mod] of entriesOf(modules)) {
    const moduleConfig = recordOrEmpty(mod);
    const status = normalizeLifecycleStatus(recordOrEmpty(lifecycleModules[id]));
    const failCount = numberOrZero(status.fail_count);
    const currentAttempt = numberOrZero(status.current_attempt);
    const cost = recordOrEmpty(status.cost);
    const attempts = currentAttempt > 0
      ? Number(status.current_attempt)
      : failCount + (status.status === 'PASS' ? 1 : 0);

    const stat = {
      id, title: moduleConfig.title, dir: moduleConfig.dir,
      scope_group: selectDefinedValue(() => (moduleConfig.scope_group), () => (null)),
      status: selectDefinedValue(() => (status.status), () => ('PENDING')),
      failCount,
      attempts,
      startedAt: selectDefinedValue(() => (selectDefinedValue(() => (status.started_at), () => (status.attempt_started_at))), () => (null)),
      completedAt: selectDefinedValue(() => (status.completed_at), () => (null)),
      blockedPhase: selectDefinedValue(() => (selectDefinedValue(() => (status.blockedPhase), () => (status.blocked_phase))), () => (null)),
      blockedReason: selectDefinedValue(() => (selectDefinedValue(() => (status.reason), () => (status.completion_summary))), () => (null)),
      completionSummary: selectDefinedValue(() => (status.completion_summary), () => (null)),
      failSummaries: arrayOrEmpty(status.fail_summaries),
      forgeDiffStat: selectDefinedValue(() => (status.forge_diff_stat), () => (null)),
      historyEntries: arrayOrEmpty(status.history).length,
      cost,
    };

    if (stat.status === 'PASS') { totalCompleted++; if (stat.failCount === 0) passedFirstTry++; }
    else if (stat.status === 'BLOCKED') totalBlocked++;
    else totalPending++;

    totalAttempts += stat.attempts;
    totalDuration += numberOrZero(stat.cost.total_duration_seconds);
    totalForgeIn += numberOrZero(stat.cost.forge_tokens_in);
    totalForgeOut += numberOrZero(stat.cost.forge_tokens_out);
    totalBusterIn += numberOrZero(stat.cost.buster_tokens_in);
    totalBusterOut += numberOrZero(stat.cost.buster_tokens_out);

    if (stat.startedAt) { const d = new Date(stat.startedAt); if (selectTruthyValue(() => (!earliestStart), () => (d < earliestStart))) earliestStart = d; }
    if (stat.completedAt) { const d = new Date(stat.completedAt); if (selectTruthyValue(() => (!latestComplete), () => (d > latestComplete))) latestComplete = d; }

    moduleStats.push(stat);
  }

  // Failure patterns
  const failPatterns = {};
  for (const mod of moduleStats) {
    for (const fail of mod.failSummaries) {
      const summary = typeof fail?.summary === 'string' && fail.summary.trim()
        ? fail.summary
        : 'failure_summary_missing';
      const p = summary.slice(0, 80).replace(/Module \d+[a-z]?:?\s*/i, '').trim();
      failPatterns[p] = numberOrZero(failPatterns[p]) + 1;
    }
  }

  // Gate stats
  const gateStats = [];
  for (const [gateId, gate] of entriesOf(gates)) {
    const lifecycleGate = normalizeLifecycleStatus(recordOrEmpty(lifecycleGates[gateId]));
    const outPath = gate.output_file ? path.join(swarmRoot, gate.output_file) : null;
    const result = outPath ? readJsonData(outPath, diagnostics) : null;
    const status = selectDefinedValue(
      () => (lifecycleGate.status),
      () => (result?.status),
      () => (result?.verdict),
      () => ('PENDING'),
    );
    gateStats.push({
      id: gateId, type: gate.type, title: gate.title,
      status,
      note: selectDefinedValue(
        () => (lifecycleGate.note),
        () => (lifecycleGate.reason),
        () => (result?.note),
        () => (result?.summary),
        () => (null),
      ),
      startedAt: selectDefinedValue(() => (lifecycleGate.started_at), () => (null)),
      completedAt: selectDefinedValue(() => (lifecycleGate.completed_at), () => (null)),
      outputPath: outPath,
    });
  }

  const elapsedHours = earliestStart && latestComplete
    ? Math.round((latestComplete - earliestStart) / (1000 * 60 * 60) * 10) / 10
    : null;

  return {
    lifecycleSource: lifecycleSnapshot.source,
    lifecycleReadModelsPath: lifecycleSnapshot.path,
    moduleCount: keysOf(modules).length,
    gateCount: keysOf(gates).length,
    totalCompleted, totalBlocked, totalPending,
    totalAttempts, passedFirstTry,
    firstPassRate: pct(passedFirstTry, totalCompleted),
    avgAttempts: totalCompleted > 0 ? Math.round((totalAttempts / totalCompleted) * 10) / 10 : 0,
    totalDuration, elapsedHours,
    earliestStart: selectTruthyValue(() => (earliestStart?.toISOString()), () => (null)),
    latestComplete: selectTruthyValue(() => (latestComplete?.toISOString()), () => (null)),
    tokens: {
      forgeIn: totalForgeIn, forgeOut: totalForgeOut,
      busterIn: totalBusterIn, busterOut: totalBusterOut,
      total: totalForgeIn + totalForgeOut + totalBusterIn + totalBusterOut,
    },
    hardestModules: [...moduleStats].filter(m => m.failCount > 0).sort((a, b) => b.failCount - a.failCount).slice(0, 5),
    failPatterns: Object.entries(failPatterns).sort((a, b) => b[1] - a[1]).slice(0, 5),
    gateStats, moduleStats,
  };
}

// ── 5. Test Suite Results (runner-verdict.json) ─────────────────

function collectTestResults(swarmRoot, modules, diagnostics = null) {
  const suiteAgg = {};  // suite name → { runs, pass, fail, skip, error, checks, checksPassed, findings, durationMs }
  let totalRuns = 0, totalChecks = 0, totalChecksPassed = 0, totalFindings = 0, totalDuration = 0;
  const perModule = [];

  for (const [id, mod] of entriesOf(modules)) {
    const verdictPath = path.join(swarmRoot, 'modules', mod.dir, 'test-results', 'runner-verdict.json');
    const verdict = readJsonData(verdictPath, diagnostics);
    if (!verdict?.suites) continue;

    totalRuns++;
    let modChecks = 0, modPassed = 0, modFindings = 0;

    for (const [suiteName, s] of entriesOf(verdict.suites)) {
      if (!suiteAgg[suiteName]) suiteAgg[suiteName] = { runs: 0, pass: 0, fail: 0, skip: 0, error: 0, checks: 0, checksPassed: 0, findings: 0, durationMs: 0 };
      const agg = suiteAgg[suiteName];
      agg.runs++;
      if (s.status === 'PASS') agg.pass++;
      else if (s.status === 'FAIL') agg.fail++;
      else if (s.status === 'SKIP') agg.skip++;
      else if (s.status === 'ERROR') agg.error++;
      agg.checks += numberOrZero(s.checks_total);
      agg.checksPassed += numberOrZero(s.checks_passed);
      agg.findings += arrayOrEmpty(s.findings).length;
      agg.durationMs += numberOrZero(s.duration_ms);

      modChecks += numberOrZero(s.checks_total);
      modPassed += numberOrZero(s.checks_passed);
      modFindings += arrayOrEmpty(s.findings).length;
    }

    totalChecks += modChecks;
    totalChecksPassed += modPassed;
    totalFindings += modFindings;
    totalDuration += numberOrZero(verdict.duration_ms);

    perModule.push({
      id, title: mod.title,
      status: verdict.overall_status,
      suites: Object.keys(verdict.suites),
      checks: modChecks, passed: modPassed, findings: modFindings,
      durationMs: numberOrZero(verdict.duration_ms),
    });
  }

  return { suiteAgg, totalRuns, totalChecks, totalChecksPassed, totalFindings, totalDuration, perModule };
}

// ── 6. Echo Review Stats ────────────────────────────────────────

function collectReviewStats(swarmRoot, diagnostics = null) {
  const reviewDir = path.join(swarmRoot, 'echo-review');
  if (!fs.existsSync(reviewDir)) return { reviews: [], totalCritical: 0, totalDeferred: 0 };

  const reviews = [];
  let totalCritical = 0, totalDeferred = 0;

  for (const file of fs.readdirSync(reviewDir)) {
    if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!file.endsWith('.json')), () => (file === 'EARLY-REVIEW.json'))), () => (file === 'MIDPOINT-REVIEW.json'))), () => (file === 'FINAL-REVIEW.json'))) {
      // Check merged review files (PASS/FAIL summaries)
      if (file.endsWith('-REVIEW.json') && !file.startsWith('echo-')) {
        const data = readJsonData(path.join(reviewDir, file), diagnostics);
        if (data?.status) {
          reviews.push({ file, type: 'summary', status: data.status, note: selectDefinedValue(() => (data.note), () => (null)) });
        }
      }
      continue;
    }
    // Detailed review files: echo-opus-EARLY-REVIEW.json etc.
    const data = readJsonData(path.join(reviewDir, file), diagnostics);
    if (!data) continue;

    const critical = arrayOrEmpty(data.critical_issues).length;
    const deferred = arrayOrEmpty(data.deferred_issues).length;
    totalCritical += critical;
    totalDeferred += deferred;

    reviews.push({
      file, type: 'detail',
      status: selectDefinedValue(() => (data.status), () => ('review_status_missing')),
      critical, deferred,
      summary: String(selectDefinedValue(() => (data.summary), () => (''))).slice(0, 200),
    });
  }

  return { reviews, totalCritical, totalDeferred };
}

// ── 7. Agent Invocations (structured telemetry) ─────────────────

function discoverPipelineEventLogs(swarmRoot) {
  const logs = [
    path.join(swarmRoot, 'logs', 'pipeline', 'pipeline.jsonl'),
  ];
  const runsDir = path.join(swarmRoot, 'logs', 'pipeline', 'runs');
  if (fs.existsSync(runsDir)) {
    for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) logs.push(path.join(runsDir, entry.name, 'pipeline.jsonl'));
    }
  }
  return [...new Set(logs)];
}

const PROJECT_SUMMARY_AGENT_KIND_BY_TOKEN = Object.freeze({
  forge: 'forge',
  module_forge: 'forge',
  buster: 'buster',
  module_buster: 'buster',
  echo: 'echo',
  review: 'echo',
  reviewer: 'echo',
  gate_fix: 'gateFix',
  forge_gatefix: 'gateFix',
  gatefix: 'gateFix',
  review_fix: 'reviewFix',
  forge_reviewfix: 'reviewFix',
  reviewfix: 'reviewFix',
});

function normalizeAgentInvocationKind(event = {}) {
  const agentType = firstDefined(event.agent_type, event.agentType, event.payload?.agent_type, event.payload?.agentType, event.label, event.gateway_label, event.gatewayLabel, null);
  if (agentType === null) return null;
  const raw = String(agentType).trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (!raw) return null;
  const direct = selectDefinedValue(() => (PROJECT_SUMMARY_AGENT_KIND_BY_TOKEN[raw]), () => (null));
  if (direct) return direct;
  if (raw.startsWith('forge_')) return 'forge';
  if (raw.startsWith('buster_')) return 'buster';
  if (raw.startsWith('echo_')) return 'echo';
  if (raw.startsWith('gate_fix_')) return 'gateFix';
  if (raw.startsWith('review_fix_')) return 'reviewFix';
  return null;
}

function eventDedupPart(value) {
  return selectTruthyValue(() => (value === undefined), () => (value === null)) ? '' : String(value);
}

function eventDedupKey(event = {}, filePath, lineNumber) {
  return selectDefinedValue(() => (firstDefined(event.event_id, event.id, event.trace_id)), () => ([
    eventDedupPart(selectDefinedValue(() => (event.run_id), () => (event.runId))),
    eventDedupPart(event.type),
    eventDedupPart(firstDefined(event.agent_type, event.agentType)),
    eventDedupPart(selectDefinedValue(() => (event.session_key), () => (event.sessionKey))),
    eventDedupPart(selectDefinedValue(() => (event.dispatch_id), () => (event.dispatchId))),
    eventDedupPart(selectDefinedValue(() => (event.ts), () => (event.timestamp))),
    filePath,
    String(lineNumber),
].join(':')));
}

function collectAgentInvocations(swarmRoot, diagnostics = null) {
  const result = {
    forge: 0,
    buster: 0,
    echo: 0,
    gateFix: 0,
    reviewFix: 0,
    total: 0,
    source: 'pipeline_jsonl_agent_spawned',
  };
  const seen = new Set();

  for (const filePath of discoverPipelineEventLogs(swarmRoot)) {
    if (!fs.existsSync(filePath)) continue;
    let lines = [];
    try {
      lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    } catch (error) {
      addDiagnostic(diagnostics, {
        source: 'jsonl',
        status: 'unavailable',
        path: filePath,
        optional: true,
        reason: selectTruthyValue(() => (error?.message), () => ('missing_error_message')),
      });
      continue;
    }
    let lineNumber = 0;
    for (const line of lines) {
      lineNumber++;
      let event;
      try {
        event = JSON.parse(line);
      } catch (error) {
        addDiagnostic(diagnostics, {
          source: 'jsonl',
          status: 'malformed',
          path: filePath,
          line: lineNumber,
          optional: true,
          reason: selectTruthyValue(() => (error?.message), () => ('missing_error_message')),
        });
        continue;
      }
      if (event?.type !== 'agent.spawned' && event?.event_type !== 'agent.spawned') continue;
      const key = eventDedupKey(event, filePath, lineNumber);
      if (seen.has(key)) continue;
      seen.add(key);
      const kind = normalizeAgentInvocationKind(event);
      if (!kind) {
        addDiagnostic(diagnostics, {
          source: 'agent_invocations',
          status: 'unsupported_agent_type',
          path: filePath,
          line: lineNumber,
          optional: true,
          agent_type: firstDefined(event.agent_type, event.agentType, null),
        });
        continue;
      }
      result[kind]++;
    }
  }

  result.total = result.forge + result.buster + result.echo + result.gateFix + result.reviewFix;
  return result;
}

// ═══════════════════════════════════════════════════════════════
// REPORT BUILDER
// ═══════════════════════════════════════════════════════════════

function buildProjectSummaryDiscordFields(identity = {}, extra = []) {
  const fields = [];
  if (identity.runId) fields.push({ name: 'Run ID', value: identity.runId, inline: true });
  return [...fields, ...extra];
}

function projectSummaryArtifactDisplayPath(context, pathField, displayField) {
  const artifactPath = context[pathField];
  if (!artifactPath) return null;
  const displayPath = context[displayField];
  return selectTruthyValue(() => (displayPath), () => (artifactPath));
}

function buildProjectSummaryArtifactFields(context = {}) {
  const fields = [];
  const markdownPath = projectSummaryArtifactDisplayPath(context, 'outputFile', 'outputFileDisplay');
  const dataPath = projectSummaryArtifactDisplayPath(context, 'jsonOutputPath', 'jsonOutputPathDisplay');
  if (markdownPath) fields.push({ name: 'Markdown', value: `\`${markdownPath}\``, inline: false });
  if (dataPath) fields.push({ name: 'Data', value: `\`${dataPath}\``, inline: false });
  return fields;
}

function resolveDiscordContext(opts = {}) {
  const project = opts.project !== undefined && opts.project !== null && String(opts.project).trim()
    ? opts.project
    : optionalEnvString('CURRENT_PROJECT');
  const repoDir = resolveRepoDir(opts.repoDir);
  const configPath = opts.configPath ? opts.configPath : null;
  const { swarmRoot } = resolveProjectPaths(project, repoDir, configPath);
  const logDir = path.join(swarmRoot, 'logs');
  const latest = recordOrEmpty(discoverLatestRun(path.join(logDir, 'pipeline')));
  let runId = null;
  if (opts.runId !== undefined && opts.runId !== null && String(opts.runId).trim()) {
    runId = opts.runId;
  } else {
    const runIdEnv = optionalEnvString('RUN_ID');
    if (runIdEnv !== null) {
      runId = runIdEnv;
    } else {
      const pipelineRunIdEnv = optionalEnvString('PIPELINE_RUN_ID');
      runId = pipelineRunIdEnv !== null ? pipelineRunIdEnv : (latest.run_id !== undefined ? latest.run_id : null);
    }
  }
  const runLogDir = runId ? path.join(logDir, 'pipeline', 'runs', runId) : null;
  const outputFile = opts.outputFile ? path.resolve(opts.outputFile) : null;
  const jsonOutputPath = opts.jsonOutputPath ? path.resolve(opts.jsonOutputPath) : null;

  return {
    project,
    repoDir,
    configPath,
    logDir,
    runId,
    runLogDir,
    outputFile,
    jsonOutputPath,
    outputFileDisplay: outputFile ? path.relative(repoDir, outputFile) : null,
    jsonOutputPathDisplay: jsonOutputPath ? path.relative(repoDir, jsonOutputPath) : null,
  };
}

async function postToDiscord(embeds, opts = {}) {
  const url = opts.discordWebhookUrl !== undefined && opts.discordWebhookUrl !== null && String(opts.discordWebhookUrl).trim()
    ? opts.discordWebhookUrl
    : optionalEnvString('DISCORD_WEBHOOK');
  if (!url) { log('DISCORD_WEBHOOK not set — skipping'); return false; }
  if (projectSummaryDiscordMuted(opts)) {
    log('Discord: summary webhook muted by runtime config');
    return false;
  }
  try {
    const context = resolveDiscordContext(opts);
    const config = {
      project: context.project,
      repo_root: context.repoDir,
      _runId: context.runId,
      run_id: context.runId,
      discord_webhook_url: url,
      _disable_discord_webhooks: false,
      telemetry: { enabled: Boolean(context.runId) },
    };
    const summaryEmbeds = (Array.isArray(embeds) ? embeds : []).map((embed = {}) => ({
      ...embed,
      fields: buildProjectSummaryDiscordFields({ runId: context.runId }, [
        ...(Array.isArray(embed.fields) ? embed.fields : []),
        ...buildProjectSummaryArtifactFields(context),
      ]),
    }));
    await discordEmbeds(config, summaryEmbeds, { level: 'INFO', auditTargets: [path.join(context.logDir, 'pipeline', 'discord.jsonl'), context.runLogDir ? path.join(context.runLogDir, 'discord.jsonl') : null] });
    log('Discord: summary dispatched via pipeline integration');
    return true;
  } catch (e) {
    log(`Discord post failed: ${e.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function generateSummary(opts = {}) {
  const project    = opts.project !== undefined && opts.project !== null && String(opts.project).trim()
    ? opts.project
    : optionalEnvString('CURRENT_PROJECT');
  const repoDir    = validateAllowedPath(resolveRepoDir(opts.repoDir), 'project-summary.repoDir');
  const configPath = opts.configPath
    ? validateAllowedPath(opts.configPath, 'project-summary.configPath')
    : null;
  const diagnostics = [];

  if (!project) throw new Error('No project specified (--project or CURRENT_PROJECT env)');
  if (!fs.existsSync(repoDir)) throw new Error(`Repo dir not found: ${repoDir}`);

  log(`Generating summary for: ${project}`);
  const { projectRoot, swarmRoot, progressPath } = resolveProjectPaths(project, repoDir, configPath);
  if (!fs.existsSync(progressPath)) throw new Error(`progress.json not found: ${progressPath}`);
  const progress = readJsonData(progressPath, diagnostics, { optional: false });
  if (!progress) throw new Error('Failed to parse progress.json');

  log('Collecting code stats...');
  const code = collectCodeStats(repoDir, projectRoot, diagnostics);

  log('Collecting unit test census...');
  const unitCensus = collectUnitTestCensus(projectRoot);

  log('Collecting API test specs...');
  const apiCensus = collectApiTestCensus(swarmRoot, diagnostics);

  log('Collecting pipeline stats...');
  const pipeline = collectPipelineStats(progress, swarmRoot, diagnostics);

  log('Collecting test suite results...');
  const tests = collectTestResults(swarmRoot, recordOrEmpty(progress.modules), diagnostics);

  log('Collecting review stats...');
  const reviews = collectReviewStats(swarmRoot, diagnostics);

  log('Collecting agent invocations...');
  const agents = collectAgentInvocations(swarmRoot, diagnostics);

  const safeProject = sanitizeMarkdownText(project);
  const safeCode = sanitizeJsonEgress(code, 'project_summary_code');
  const safeUnitCensus = sanitizeJsonEgress(unitCensus, 'project_summary_unit_census');
  const safeApiCensus = sanitizeJsonEgress(apiCensus, 'project_summary_api_census');
  const safePipeline = sanitizeJsonEgress(pipeline, 'project_summary_pipeline');
  const safeTests = sanitizeJsonEgress(tests, 'project_summary_tests');
  const safeReviews = sanitizeJsonEgress(reviews, 'project_summary_reviews');
  const safeAgents = sanitizeJsonEgress(agents, 'project_summary_agents');
  const safeDiagnostics = sanitizeJsonEgress(diagnostics, 'project_summary_diagnostics');

  const markdown = sanitizeMarkdownText(buildMarkdown(safeProject, safeCode, safePipeline, safeTests, safeUnitCensus, safeApiCensus, safeReviews, safeAgents));
  const embeds = sanitizeJsonEgress(buildDiscordEmbeds(safeProject, safeCode, safePipeline, safeTests, safeUnitCensus, safeApiCensus, safeReviews, safeAgents), 'project_summary_embeds');
  const caseStudyBase = sanitizeJsonEgress(buildCaseStudyBase(safeProject, safeCode, safePipeline, safeTests, safeUnitCensus, safeApiCensus, safeReviews, safeAgents), 'case_study_base');

  log('Summary complete.');
  return {
    summaryType: 'project_summary',
    project: safeProject, markdown, embeds, caseStudyBase,
    data: { code: safeCode, unitCensus: safeUnitCensus, apiCensus: safeApiCensus, pipeline: safePipeline, tests: safeTests, reviews: safeReviews, agents: safeAgents, diagnostics: safeDiagnostics },
  };
}

// ═══════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════

async function main(args = process.argv.slice(2)) {
  const { values: flags } = parseCliArgs(args, {
    flags: {
      project: { type: 'string' },
      output: { type: 'string' },
      repo: { type: 'string' },
      discord: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });

  const project = flags.project !== undefined && flags.project !== null && String(flags.project).trim()
    ? String(flags.project).trim()
    : optionalEnvString('CURRENT_PROJECT');
  const output = flags.output !== undefined && flags.output !== null && String(flags.output).trim()
    ? String(flags.output).trim()
    : null;
  const repoDir = flags.repo !== undefined && flags.repo !== null && String(flags.repo).trim()
    ? String(flags.repo).trim()
    : null;

  if (!project) { console.error('Usage: node project-summary.ts --project <n> [--discord] [--output <file>] [--json] [--repo <path>]'); process.exit(2); }

  const result = await generateSummary({ project, ...(repoDir ? { repoDir } : {}) });
  if (flags.json) {
    const out = JSON.stringify(sanitizeJsonEgress(result.data, 'project_summary_cli_json'), null, 2);
    if (output) { fs.writeFileSync(output, out); log(`JSON: ${output}`); } else console.log(out);
  } else {
    const out = sanitizeMarkdownText(result.markdown);
    if (output) { fs.writeFileSync(output, out); log(`Report: ${output}`); } else console.log(out);
  }
  if (flags.discord) {
    await postToDiscord(result.embeds, {
      project,
      repoDir,
      outputFile: flags.json ? null : output,
      jsonOutputPath: flags.json ? output : null,
    });
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main()
    .then(() => process.exit(0))
    .catch((err) => { console.error(`Error: ${sanitizeMarkdownText(err.message)}`); process.exit(1); });
}

export {
  buildProjectSummaryArtifactFields,
  buildProjectSummaryDiscordFields,
  generateSummary,
  main,
  normalizeAgentInvocationKind,
  postToDiscord,
  resolveProjectPaths,
};
export default main;
