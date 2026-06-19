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
import { sanitizeJsonEgress, sanitizeMarkdownText } from '../redaction.ts';
import { buildSubprocessEnv, resolveScopedPath, validateAllowedPath } from '../security.ts';
import { buildCaseStudyBase, buildDiscordEmbeds, buildMarkdown, pct } from './project-summary-formatters.ts';
import { addDiagnostic, discoverLatestLifecycleReadModels, extToLang, readJsonData, readJsonRecord } from './project-summary-lifecycle.ts';

// ── Helpers ─────────────────────────────────────────────────────

function log(msg) { console.log(`[SUMMARY] ${sanitizeMarkdownText(msg)}`); }

function resolveRepoDir(repoDir = null) {
  const explicitRepo = repoDir || process.env.REPO_ROOT || null;
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
      reason: error?.message || 'unknown',
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
  if (!project || typeof project !== 'string') {
    throw new Error('project-summary.project: project is empty or not a string');
  }
  if (project.includes('\0') || project === '.' || project === '..' || /[\\/]/.test(project) || project.split(/[\\/]/).includes('..')) {
    throw new Error(`project-summary.project: invalid project selector '${project}'`);
  }
  return project;
}

function resolveProjectPaths(project, repoDir, configPath) {
  const { config: swarmConfig } = configPath
    ? loadPlatformSwarmConfig(configPath)
    : loadPlatformSwarmConfig();
  const safeProject = validateProjectSelector(project);
  const projectsRoot = resolveScopedPath(swarmConfig.projects_root || 'Projects', {
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
      if (stat.isDirectory() || stat.size > 2 * 1024 * 1024) continue;
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
  const commitCount = parseInt(gitText(repoDir, ['rev-list', '--count', 'HEAD', '--', relProject], diagnostics) || '0');
  const authors = [...new Set(gitText(repoDir, ['log', '--format=%aN', '--', relProject], diagnostics).split('\n').filter(Boolean))].sort();
  const firstCommit = gitText(repoDir, ['log', '--reverse', '--format=%aI', '--', relProject], diagnostics).split('\n').find(Boolean) || '';
  const lastCommit = gitText(repoDir, ['log', '-1', '--format=%aI', '--', relProject], diagnostics);

  return { totalLines, codeLines, totalFiles, codeFiles, swarmFiles, byLang, commitCount, authors,
    firstCommit: firstCommit || null, lastCommit: lastCommit || null };
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
          const funcs = (content.match(/(?:def|async def) test_/g) || []).length;
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
          const blocks = (content.match(/\bit\(|\btest\(|\bdescribe\(/g) || []).length;
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
      const modDir = path.relative(swarmRoot, full).split('/')[1] || 'gate';
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
  const modules = progress.modules || {};
  const gates = progress.gates || {};
  const lifecycleSnapshot = discoverLatestLifecycleReadModels(swarmRoot, readJsonData, diagnostics);
  const lifecycleModules = lifecycleSnapshot.data?.modules || {};

  const moduleStats = [];
  let totalAttempts = 0, totalDuration = 0;
  let totalForgeIn = 0, totalForgeOut = 0, totalBusterIn = 0, totalBusterOut = 0;
  let passedFirstTry = 0, totalCompleted = 0, totalBlocked = 0, totalPending = 0;
  let earliestStart = null, latestComplete = null;

  for (const [id, mod] of Object.entries(modules)) {
    const status = normalizeLifecycleStatus(lifecycleModules[id] || {});
    const attempts = Number(status.current_attempt || 0) > 0
      ? Number(status.current_attempt)
      : (status.fail_count || 0) + (status.status === 'PASS' ? 1 : 0);

    const stat = {
      id, title: mod.title, dir: mod.dir,
      scope_group: mod.scope_group ?? mod.scopeGroup ?? mod.scope?.group ?? mod.category ?? mod.metadata?.scope_group ?? mod.metadata?.scopeGroup ?? 'other',
      status: status.status || 'PENDING',
      failCount: status.fail_count || 0,
      attempts,
      startedAt: status.started_at || status.attempt_started_at || null,
      completedAt: status.completed_at || null,
      completionSummary: status.completion_summary || null,
      failSummaries: status.fail_summaries || [],
      forgeDiffStat: status.forge_diff_stat || null,
      historyEntries: (status.history || []).length,
      cost: status.cost || {},
    };

    if (stat.status === 'PASS') { totalCompleted++; if (stat.failCount === 0) passedFirstTry++; }
    else if (stat.status === 'BLOCKED') totalBlocked++;
    else totalPending++;

    totalAttempts += stat.attempts;
    totalDuration += stat.cost.total_duration_seconds || 0;
    totalForgeIn += stat.cost.forge_tokens_in || 0;
    totalForgeOut += stat.cost.forge_tokens_out || 0;
    totalBusterIn += stat.cost.buster_tokens_in || 0;
    totalBusterOut += stat.cost.buster_tokens_out || 0;

    if (stat.startedAt) { const d = new Date(stat.startedAt); if (!earliestStart || d < earliestStart) earliestStart = d; }
    if (stat.completedAt) { const d = new Date(stat.completedAt); if (!latestComplete || d > latestComplete) latestComplete = d; }

    moduleStats.push(stat);
  }

  // Failure patterns
  const failPatterns = {};
  for (const mod of moduleStats) {
    for (const fail of mod.failSummaries) {
      const p = (fail.summary || 'unknown').slice(0, 80).replace(/Module \d+[a-z]?:?\s*/i, '').trim();
      failPatterns[p] = (failPatterns[p] || 0) + 1;
    }
  }

  // Gate stats
  const gateStats = [];
  for (const [gateId, gate] of Object.entries(gates)) {
    const outPath = gate.output_file ? path.join(swarmRoot, gate.output_file) : null;
    const result = outPath ? readJsonData(outPath, diagnostics) : null;
    gateStats.push({
      id: gateId, type: gate.type, title: gate.title,
      status: result?.status || 'PENDING',
      note: result?.note || null,
    });
  }

  const elapsedHours = earliestStart && latestComplete
    ? Math.round((latestComplete - earliestStart) / (1000 * 60 * 60) * 10) / 10
    : null;

  return {
    lifecycleSource: lifecycleSnapshot.source,
    lifecycleReadModelsPath: lifecycleSnapshot.path,
    moduleCount: Object.keys(modules).length,
    gateCount: Object.keys(gates).length,
    totalCompleted, totalBlocked, totalPending,
    totalAttempts, passedFirstTry,
    firstPassRate: pct(passedFirstTry, totalCompleted),
    avgAttempts: totalCompleted > 0 ? Math.round((totalAttempts / totalCompleted) * 10) / 10 : 0,
    totalDuration, elapsedHours,
    earliestStart: earliestStart?.toISOString() || null,
    latestComplete: latestComplete?.toISOString() || null,
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

  for (const [id, mod] of Object.entries(modules)) {
    const verdictPath = path.join(swarmRoot, 'modules', mod.dir, 'test-results', 'runner-verdict.json');
    const verdict = readJsonData(verdictPath, diagnostics);
    if (!verdict?.suites) continue;

    totalRuns++;
    let modChecks = 0, modPassed = 0, modFindings = 0;

    for (const [suiteName, s] of Object.entries(verdict.suites)) {
      if (!suiteAgg[suiteName]) suiteAgg[suiteName] = { runs: 0, pass: 0, fail: 0, skip: 0, error: 0, checks: 0, checksPassed: 0, findings: 0, durationMs: 0 };
      const agg = suiteAgg[suiteName];
      agg.runs++;
      if (s.status === 'PASS') agg.pass++;
      else if (s.status === 'FAIL') agg.fail++;
      else if (s.status === 'SKIP') agg.skip++;
      else if (s.status === 'ERROR') agg.error++;
      agg.checks += s.checks_total || 0;
      agg.checksPassed += s.checks_passed || 0;
      agg.findings += (s.findings || []).length;
      agg.durationMs += s.duration_ms || 0;

      modChecks += s.checks_total || 0;
      modPassed += s.checks_passed || 0;
      modFindings += (s.findings || []).length;
    }

    totalChecks += modChecks;
    totalChecksPassed += modPassed;
    totalFindings += modFindings;
    totalDuration += verdict.duration_ms || 0;

    perModule.push({
      id, title: mod.title,
      status: verdict.overall_status,
      suites: Object.keys(verdict.suites),
      checks: modChecks, passed: modPassed, findings: modFindings,
      durationMs: verdict.duration_ms || 0,
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
    if (!file.endsWith('.json') || file === 'EARLY-REVIEW.json' || file === 'MIDPOINT-REVIEW.json' || file === 'FINAL-REVIEW.json') {
      // Check merged review files (PASS/FAIL summaries)
      if (file.endsWith('-REVIEW.json') && !file.startsWith('echo-')) {
        const data = readJsonData(path.join(reviewDir, file), diagnostics);
        if (data?.status) {
          reviews.push({ file, type: 'summary', status: data.status, note: data.note || null });
        }
      }
      continue;
    }
    // Detailed review files: echo-opus-EARLY-REVIEW.json etc.
    const data = readJsonData(path.join(reviewDir, file), diagnostics);
    if (!data) continue;

    const critical = (data.critical_issues || []).length;
    const deferred = (data.deferred_issues || []).length;
    totalCritical += critical;
    totalDeferred += deferred;

    reviews.push({
      file, type: 'detail',
      status: data.status || 'unknown',
      critical, deferred,
      summary: (data.summary || '').slice(0, 200),
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

function normalizeAgentInvocationKind(event = {}) {
  const raw = String(
    event.agent_type
      ?? event.agentType
      ?? event.payload?.agent_type
      ?? event.payload?.agentType
      ?? ''
  ).trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (!raw) return null;
  if (raw === 'forge' || raw === 'module_forge') return 'forge';
  if (raw === 'buster' || raw === 'module_buster') return 'buster';
  if (raw === 'echo' || raw === 'review' || raw === 'reviewer') return 'echo';
  if (raw === 'gate_fix' || raw === 'forge_gatefix' || raw === 'gatefix') return 'gateFix';
  if (raw === 'review_fix' || raw === 'forge_reviewfix' || raw === 'reviewfix') return 'reviewFix';
  return null;
}

function eventDedupKey(event = {}, filePath, lineNumber) {
  return event.event_id
    ?? event.id
    ?? event.trace_id
    ?? `${event.run_id || event.runId || ''}:${event.type || ''}:${event.agent_type || event.agentType || ''}:${event.session_key || event.sessionKey || ''}:${event.dispatch_id || event.dispatchId || ''}:${event.ts || event.timestamp || ''}:${filePath}:${lineNumber}`;
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
        reason: error?.message || 'unknown',
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
          reason: error?.message || 'unknown',
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
          status: 'unknown_agent_type',
          path: filePath,
          line: lineNumber,
          optional: true,
          agent_type: event.agent_type ?? event.agentType ?? null,
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
  if (identity.runId || identity.run_id) fields.push({ name: 'Run ID', value: identity.runId || identity.run_id, inline: true });
  return [...fields, ...extra];
}

function buildProjectSummaryArtifactFields(context = {}) {
  const fields = [];
  if (context.outputFile) fields.push({ name: 'Markdown', value: `\`${context.outputFileDisplay || context.outputFile}\``, inline: false });
  if (context.jsonOutputPath) fields.push({ name: 'Data', value: `\`${context.jsonOutputPathDisplay || context.jsonOutputPath}\``, inline: false });
  return fields;
}

function resolveDiscordContext(opts = {}) {
  const project = opts.project || process.env.CURRENT_PROJECT || null;
  const repoDir = resolveRepoDir(opts.repoDir);
  const configPath = opts.configPath || null;
  const { swarmRoot } = resolveProjectPaths(project, repoDir, configPath);
  const logDir = path.join(swarmRoot, 'logs');
  const latest = readJsonData(path.join(logDir, 'pipeline', 'latest.json'), null) || {};
  const runId = opts.runId || process.env.RUN_ID || process.env.PIPELINE_RUN_ID || latest.run_id || null;
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
  const url = opts.discordWebhookUrl || process.env.DISCORD_WEBHOOK;
  if (!url) { log('DISCORD_WEBHOOK not set — skipping'); return false; }
  try {
    const context = resolveDiscordContext(opts);
    const config = {
      project: context.project,
      repo_root: context.repoDir,
      _runId: context.runId,
      run_id: context.runId,
      discord_webhook_url: url,
      _disable_discord_webhooks: opts.disableDiscordWebhooks === true,
      telemetry: { enabled: Boolean(context.runId) },
    };
    const summaryEmbeds = (Array.isArray(embeds) ? embeds : []).map((embed = {}) => ({
      ...embed,
      fields: buildProjectSummaryDiscordFields({ run_id: context.runId }, [
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
  const project    = opts.project || process.env.CURRENT_PROJECT;
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
  const tests = collectTestResults(swarmRoot, progress.modules || {}, diagnostics);

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

  const project = flags.project || process.env.CURRENT_PROJECT;
  const output  = flags.output || null;
  const repoDir = flags.repo || null;

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

export { generateSummary, main, postToDiscord, resolveProjectPaths };
export default main;
