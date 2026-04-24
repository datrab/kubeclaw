// ═══════════════════════════════════════════════════════════════
// Skill: project-summary — Project Lifecycle Report
// ═══════════════════════════════════════════════════════════════
//
// Generates a comprehensive summary of a KubeClaw project:
// code stats, test metrics, agent invocations, gate results,
// quality indicators, timeline, and failure analysis.
//
// Data sources:
//   - progress.json          (module/gate definitions)
//   - status.json            (per-module: attempts, timestamps, cost)
//   - runner-verdict.json    (per-module: suite results, checks, findings)
//   - test-spec.json         (API test counts per module)
//   - echo review JSONs      (critical/deferred issues, verdicts)
//   - prompts/               (agent invocation counts)
//   - git + source files     (LOC, commits, unit test functions)
//
// Usage:
//   node project-summary.js --project kubecommand
//   node project-summary.js --project kubecommand --discord
//   node project-summary.js --project kubecommand --output /tmp/summary.md
//   node project-summary.js --project kubecommand --json

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { discordEmbeds } from '../integrations/discord.js';
import { normalizeLifecycleStatus } from '../../../common/pipeline/lifecycle-state.js';
import { validateAllowedPath } from '../../../common/pipeline/security.js';

// ── Defaults ────────────────────────────────────────────────────

const SOURCE_REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

// ── Helpers ─────────────────────────────────────────────────────

function log(msg) { console.log(`[SUMMARY] ${msg}`); }

function existingDir(candidate) {
  if (!candidate) return null;
  const resolved = path.resolve(candidate);
  try {
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

function existingFile(candidate) {
  if (!candidate) return null;
  const resolved = path.resolve(candidate);
  try {
    return fs.statSync(resolved).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

function discoverDefaultRepoDir() {
  const cwd = process.cwd();
  const candidates = [
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

  for (const candidate of candidates) {
    const found = existingDir(candidate);
    if (found) return found;
  }
  return path.resolve(process.env.REPO_DIR || SOURCE_REPO_DIR);
}

function discoverDefaultConfigPath(repoDir) {
  const repoRoot = path.resolve(repoDir || discoverDefaultRepoDir());
  const workspaceRoot = path.resolve(repoRoot, '..');
  const openclawRoot = path.resolve(workspaceRoot, '..');
  const sourceDerivedDefault = path.join(openclawRoot, 'swarm.config.json');
  const candidates = [
    process.env.SWARM_CONFIG,
    sourceDerivedDefault,
    path.join(workspaceRoot, 'swarm.config.json'),
  ];

  for (const candidate of candidates) {
    const found = existingFile(candidate);
    if (found) return found;
  }
  return path.resolve(process.env.SWARM_CONFIG || sourceDerivedDefault);
}

function git(repoDir, args) {
  try {
    return execFileSync('git', ['-C', repoDir, ...args], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 50 * 1024 * 1024,
    }).trim();
  } catch { return ''; }
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
}

function formatNum(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }

// ── Resolve project paths ───────────────────────────────────────

function resolveProjectPaths(project, repoDir, configPath) {
  let swarmConfig = {};
  if (configPath && fs.existsSync(configPath)) {
    swarmConfig = readJson(configPath) || {};
  }
  const projectRoot = swarmConfig.projects_root
    ? path.join(repoDir, swarmConfig.projects_root, project, 'src')
    : path.join(repoDir, 'Projects', project, 'src');
  const swarmRoot = path.join(projectRoot, '.swarm');
  const progressPath = path.join(swarmRoot, 'progress.json');
  return { projectRoot, swarmRoot, progressPath };
}

function toTitleCaseProject(project) {
  if (!project) return '';
  return String(project)
    .replace(/[-_]+/g, ' ')
    .replace(/\w/g, (m) => m.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function groupDeliveredScope(moduleTitles = []) {
  const groups = {
    platform_backend: [],
    frontend_ui: [],
    delivery_ops: [],
    data_security: [],
    other: [],
  };
  for (const title of moduleTitles) {
    const t = String(title || '');
    const l = t.toLowerCase();
    if (/frontend|dashboard|pages|auth/.test(l)) groups.frontend_ui.push(t);
    else if (/helm|delivery|build pipeline|apply|deploy|git/.test(l)) groups.delivery_ops.push(t);
    else if (/storage|database|secrets|configmaps|alerts/.test(l)) groups.data_security.push(t);
    else if (/pods|deployments|nodes|websockets|services|cronjobs|kubernetes|connection/.test(l)) groups.platform_backend.push(t);
    else groups.other.push(t);
  }
  return groups;
}

function buildCaseStudyBase(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents) {
  const deliveredModules = (pipeline.moduleStats || []).filter(m => m.status === 'PASS').map(m => m.title || m.id);
  const hardestModules = (pipeline.hardestModules || []).slice(0, 5).map(m => ({
    module: m.title || m.id,
    fails: m.fails || 0,
    attempts: m.attempts || 0,
    status: m.status || null,
  }));
  const scope = groupDeliveredScope(deliveredModules);
  return {
    project: {
      id: project,
      name: toTitleCaseProject(project),
      generated_at: new Date().toISOString(),
      status: (pipeline.totalCompleted || 0) === (pipeline.moduleCount || 0) && (pipeline.gateStats || []).every(g => ['GO','PASS'].includes(g.status)) ? 'complete' : 'incomplete',
    },
    delivery: {
      started_at: pipeline.earliestStart || null,
      completed_at: pipeline.latestComplete || null,
      wall_clock_hours: pipeline.elapsedHours || null,
      agent_runtime_hours: pipeline.agentHours || null,
    },
    modules: {
      total: pipeline.moduleCount || 0,
      passed: pipeline.totalCompleted || 0,
      blocked: pipeline.totalBlocked || 0,
      pending: pipeline.totalPending || 0,
      first_pass_rate_pct: pipeline.firstPassRate || 0,
      avg_attempts_per_module: pipeline.avgAttempts || 0,
      total_attempts: pipeline.totalAttempts || 0,
    },
    gates: {
      total: pipeline.gateCount || 0,
      passed: (pipeline.gateStats || []).filter(g => ['GO','PASS'].includes(g.status)).length,
      failed: (pipeline.gateStats || []).filter(g => !['GO','PASS'].includes(g.status)).length,
      reviews_total: (reviews.reviews || []).length,
      critical_issues_found: reviews.totalCritical || 0,
      deferred_issues_found: reviews.totalDeferred || 0,
    },
    code: {
      total_lines: code.codeLines || 0,
      code_files: code.totalFiles || 0,
      pipeline_config_files: code.swarmFiles || 0,
      commits: code.commitCount || 0,
      contributors: code.authors || [],
      languages: Object.entries(code.byLang || {}).map(([lang, v]) => ({ name: lang, lines: v.code || 0, share_pct: pct(v.code || 0, Math.max(1, (code.totalLines || 0) - (code.byLang?.JSON?.total || 0) - (code.byLang?.Markdown?.total || 0) - (code.byLang?.YAML?.total || 0)) ) })).filter(x => x.lines > 0),
    },
    tests: {
      unit_test_functions_total: (unitCensus.pythonFunctions || 0) + (unitCensus.frontendBlocks || 0) + (apiCensus.totalCases || 0),
      python_unit_tests: unitCensus.pythonFunctions || 0,
      frontend_unit_tests: unitCensus.frontendBlocks || 0,
      api_test_cases: apiCensus.totalCases || 0,
      suite_runs: tests.totalRuns || 0,
      checks_executed: tests.totalChecks || 0,
      findings_total: tests.totalFindings || 0,
      duration_seconds: tests.totalDurationSec || 0,
    },
    agents: {
      forge_spawns: agents.forge || 0,
      buster_spawns: agents.buster || 0,
      echo_spawns: agents.echo || 0,
      gate_fix_spawns: (agents.gateFix || 0) + (agents.reviewFix || 0),
      total_spawns: agents.total || 0,
    },
    scope: {
      delivered_modules: deliveredModules,
      delivered_scope_groups: scope,
    },
    highlights: {
      hardest_modules: hardestModules,
      top_failure_patterns: (pipeline.failPatterns || []).map(([pattern, count]) => ({ pattern, count })),
    },
    quality_outcome: {
      all_modules_passed: (pipeline.totalCompleted || 0) === (pipeline.moduleCount || 0),
      all_gates_passed: (pipeline.gateStats || []).every(g => ['GO','PASS'].includes(g.status)),
      final_status: (pipeline.totalCompleted || 0) === (pipeline.moduleCount || 0) && (pipeline.gateStats || []).every(g => ['GO','PASS'].includes(g.status)) ? 'GO' : 'INCOMPLETE',
    },
    timeline: pipeline.moduleStats || [],
  };
}

function extToLang(ext) {
  const m = {
    '.py':'Python','.pyi':'Python','.ts':'TypeScript','.tsx':'TypeScript',
    '.js':'JavaScript','.jsx':'JavaScript','.cjs':'JavaScript','.mjs':'JavaScript',
    '.html':'HTML','.htm':'HTML','.css':'CSS','.scss':'CSS','.less':'CSS',
    '.json':'JSON','.md':'Markdown','.yaml':'YAML','.yml':'YAML',
    '.sql':'SQL','.sh':'Shell','.bash':'Shell','.dockerfile':'Docker',
  };
  return m[ext] || 'Other';
}

// ═══════════════════════════════════════════════════════════════
// DATA COLLECTORS
// ═══════════════════════════════════════════════════════════════

// ── 1. Code Stats ───────────────────────────────────────────────

function collectCodeStats(repoDir, projectRoot) {
  const relProject = path.relative(repoDir, projectRoot);
  let tracked = git(repoDir, ['ls-files', '--', relProject])
    .split('\n').filter(Boolean);

  // Fallback: walk filesystem if git ls-files returns nothing (e.g. no .git dir)
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
    } catch { /* skip */ }
  }

  const swarmFiles = tracked.filter(f => f.includes('.swarm/')).length;
  const codeFiles = totalFiles - swarmFiles;
  const commitCount = parseInt(git(repoDir, ['rev-list', '--count', 'HEAD', '--', relProject]) || '0');
  const authors = [...new Set(git(repoDir, ['log', '--format=%aN', '--', relProject]).split('\n').filter(Boolean))].sort();
  const firstCommit = git(repoDir, ['log', '--reverse', '--format=%aI', '--', relProject]).split('\n').find(Boolean) || '';
  const lastCommit = git(repoDir, ['log', '-1', '--format=%aI', '--', relProject]);

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
      } catch { /* skip unreadable */ }
    }
  };

  walk(projectRoot);
  result.totalFunctions = result.python.functions + result.frontend.functions;
  result.totalFiles = result.python.files + result.frontend.files;
  return result;
}

// ── 3. API Test Spec Census ─────────────────────────────────────

function collectApiTestCensus(swarmRoot) {
  const specs = [];
  let totalCases = 0;

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name !== 'test-spec.json') continue;
      const data = readJson(full);
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

// ── 4. Pipeline Stats (status.json) ─────────────────────────────

function collectPipelineStats(progress, swarmRoot) {
  const modules = progress.modules || {};
  const gates = progress.gates || {};

  const moduleStats = [];
  let totalAttempts = 0, totalDuration = 0;
  let totalForgeIn = 0, totalForgeOut = 0, totalBusterIn = 0, totalBusterOut = 0;
  let passedFirstTry = 0, totalCompleted = 0, totalBlocked = 0, totalPending = 0;
  let earliestStart = null, latestComplete = null;

  for (const [id, mod] of Object.entries(modules)) {
    const statusPath = path.join(swarmRoot, 'modules', mod.dir, 'status.json');
    const status = normalizeLifecycleStatus(readJson(statusPath) || {});

    const stat = {
      id, title: mod.title, dir: mod.dir,
      status: status.status || 'PENDING',
      failCount: status.fail_count || 0,
      attempts: (status.fail_count || 0) + (status.status === 'PASS' ? 1 : 0),
      startedAt: status.started_at || null,
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
    const result = outPath ? readJson(outPath) : null;
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

function collectTestResults(swarmRoot, modules) {
  const suiteAgg = {};  // suite name → { runs, pass, fail, skip, error, checks, checksPassed, findings, durationMs }
  let totalRuns = 0, totalChecks = 0, totalChecksPassed = 0, totalFindings = 0, totalDuration = 0;
  const perModule = [];

  for (const [id, mod] of Object.entries(modules)) {
    const verdictPath = path.join(swarmRoot, 'modules', mod.dir, 'test-results', 'runner-verdict.json');
    const verdict = readJson(verdictPath);
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

function collectReviewStats(swarmRoot) {
  const reviewDir = path.join(swarmRoot, 'echo-review');
  if (!fs.existsSync(reviewDir)) return { reviews: [], totalCritical: 0, totalDeferred: 0 };

  const reviews = [];
  let totalCritical = 0, totalDeferred = 0;

  for (const file of fs.readdirSync(reviewDir)) {
    if (!file.endsWith('.json') || file === 'EARLY-REVIEW.json' || file === 'MIDPOINT-REVIEW.json' || file === 'FINAL-REVIEW.json') {
      // Check merged review files (GO/NO-GO summaries)
      if (file.endsWith('-REVIEW.json') && !file.startsWith('echo-')) {
        const data = readJson(path.join(reviewDir, file));
        if (data?.status) {
          reviews.push({ file, type: 'summary', status: data.status, note: data.note || null });
        }
      }
      continue;
    }
    // Detailed review files: echo-opus-EARLY-REVIEW.json etc.
    const data = readJson(path.join(reviewDir, file));
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

// ── 7. Agent Invocations (prompt file census) ───────────────────

function collectAgentInvocations(swarmRoot) {
  const result = { forge: 0, buster: 0, echo: 0, gateFix: 0, reviewFix: 0, total: 0 };

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.md')) continue;
      const name = entry.name.toLowerCase();
      if (name.startsWith('forge-gatefix') || name.startsWith('forge-reviewfix')) result.gateFix++;
      else if (name.startsWith('forge-')) result.forge++;
      else if (name.startsWith('buster-')) result.buster++;
      else if (name.startsWith('echo-') || name.startsWith('review-')) result.echo++;
    }
  };

  // Module-level prompts
  const modulesDir = path.join(swarmRoot, 'modules');
  if (fs.existsSync(modulesDir)) {
    for (const mod of fs.readdirSync(modulesDir)) {
      walk(path.join(modulesDir, mod, 'prompts'));
    }
  }

  // Top-level prompts (pipeline run prompts)
  walk(path.join(swarmRoot, 'prompts'));

  // Gate prompts
  walk(path.join(swarmRoot, 'echo-review', 'prompts'));
  walk(path.join(swarmRoot, 'buster-test', 'prompts'));

  result.total = result.forge + result.buster + result.echo + result.gateFix + result.reviewFix;
  return result;
}

// ═══════════════════════════════════════════════════════════════
// REPORT BUILDER
// ═══════════════════════════════════════════════════════════════

function buildMarkdown(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents) {
  const cs = buildCaseStudyBase(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents);
  const L = [];
  L.push(`# Project Summary: ${project}`);
  L.push(`Generated: ${new Date().toISOString()}`);
  L.push('');
  L.push('## Executive Summary');
  L.push('');
  L.push(`- **Final Status:** ${cs.quality_outcome.final_status}`);
  L.push(`- **Delivery Outcome:** ${cs.modules.passed}/${cs.modules.total} modules passed, ${cs.gates.passed}/${cs.gates.total} gates passed`);
  L.push(`- **Wall Clock Time:** ${pipeline.elapsedHours || '—'}h`);
  L.push(`- **Agent Runtime:** ${pipeline.agentHours ? pipeline.agentHours + 'h' : '—'}`);
  L.push(`- **Test Surface:** ${cs.tests.unit_test_functions_total} total tests/checkable cases (${cs.tests.python_unit_tests} Python, ${cs.tests.frontend_unit_tests} frontend, ${cs.tests.api_test_cases} API)`);
  L.push(`- **Review Outcome:** ${reviews.totalCritical || 0} critical and ${reviews.totalDeferred || 0} deferred issues identified across ${(reviews.reviews || []).length} review cycle(s)`);
  L.push('');
  L.push('## Scope Delivered');
  L.push('');
  const groups = cs.scope.delivered_scope_groups || {};
  const sectionMap = [
    ['Platform / Backend', groups.platform_backend || []],
    ['Frontend / UI', groups.frontend_ui || []],
    ['Delivery / Ops', groups.delivery_ops || []],
    ['Data / Security', groups.data_security || []],
    ['Other', groups.other || []],
  ];
  for (const [title, items] of sectionMap) {
    if (!items.length) continue;
    L.push(`### ${title}`);
    for (const item of items) L.push(`- ${item}`);
    L.push('');
  }
  L.push('## Delivery Metrics');
  L.push('');
  L.push('| Metric | Value |');
  L.push('|---|---|');
  L.push(`| Modules | ${pipeline.totalCompleted} completed, ${pipeline.totalBlocked} blocked, ${pipeline.totalPending} pending (of ${pipeline.moduleCount}) |`);
  L.push(`| Gates | ${pipeline.gateCount} (${(pipeline.gateStats || []).filter(g => ['GO','PASS'].includes(g.status)).length} passed) |`);
  L.push(`| Total Pipeline Attempts | ${pipeline.totalAttempts} |`);
  L.push(`| First-Pass Rate | ${pipeline.firstPassRate}% (${pipeline.passedFirstTry}/${pipeline.moduleCount}) |`);
  L.push(`| Avg Attempts per Module | ${pipeline.avgAttempts} |`);
  L.push(`| Wall Clock Time | ${pipeline.elapsedHours}h |`);
  L.push(`| Total Agent Time | ${formatDuration((pipeline.agentHours || 0) * 3600)} |`);
  L.push(`| Started | ${pipeline.earliestStart?.slice(0, 10) || '—'} |`);
  L.push(`| Completed | ${pipeline.latestComplete?.slice(0, 10) || '—'} |`);
  L.push('');
  L.push('## Code');
  L.push('');
  L.push('| Metric | Value |');
  L.push('|---|---|');
  L.push(`| Total Code Lines | ${formatNum(code.codeLines || code.totalLines)} |`);
  L.push(`| Code Files | ${code.codeFiles} |`);
  L.push(`| Pipeline Artifact Files | ${code.swarmFiles || 0} |`);
  L.push(`| Commits | ${code.commitCount || 0} |`);
  L.push(`| Contributors | ${(code.authors || []).join(', ') || '—'} |`);
  L.push('');
  L.push('### Lines by Language (code only)');
  L.push('');
  L.push('| Language | Lines | Share |');
  L.push('|---|---|---|');
  for (const [lang, stats] of Object.entries(code.byLang || {})) {
    if (!stats.code) continue;
    const share = pct(stats.code, Math.max(1, code.totalLines - (code.byLang?.JSON?.total || 0) - (code.byLang?.Markdown?.total || 0) - (code.byLang?.YAML?.total || 0)));
    L.push(`| ${lang} | ${formatNum(stats.code)} | ${share}% |`);
  }
  L.push('');
  L.push('## Quality Outcome');
  L.push('');
  L.push('| Metric | Value |');
  L.push('|---|---|');
  L.push(`| All Modules Passed | ${cs.quality_outcome.all_modules_passed ? 'Yes' : 'No'} |`);
  L.push(`| All Gates Passed | ${cs.quality_outcome.all_gates_passed ? 'Yes' : 'No'} |`);
  L.push(`| Reviews Run | ${(reviews.reviews || []).length} |`);
  L.push(`| Critical Issues Found | ${reviews.totalCritical || 0} |`);
  L.push(`| Deferred Issues Found | ${reviews.totalDeferred || 0} |`);
  L.push(`| Suite Runs | ${tests.totalRuns || 0} |`);
  L.push(`| Total Checks Executed | ${tests.totalChecks || 0} |`);
  L.push(`| Total Findings | ${tests.totalFindings || 0} |`);
  L.push('');
  L.push('## Tests');
  L.push('');
  L.push('| Metric | Value |');
  L.push('|---|---|');
  L.push(`| Unit Tests (Python/pytest) | ${unitCensus.python.functions} functions in ${unitCensus.python.files} files |`);
  L.push(`| Unit Tests (Frontend/Vitest) | ${unitCensus.frontend.functions} test blocks in ${unitCensus.frontend.files} files |`);
  L.push(`| API Test Specs | ${apiCensus.totalCases} cases in ${apiCensus.specs.length} specs |`);
  L.push(`| Total Test Functions | ${(unitCensus.python.functions || 0) + (unitCensus.frontend.functions || 0) + (apiCensus.totalCases || 0)} |`);
  L.push(`| Suite Runs (Buster pre-checks) | ${tests.totalRuns || 0} |`);
  L.push(`| Total Checks Executed | ${tests.totalChecks || 0} |`);
  L.push(`| Total Findings | ${tests.totalFindings || 0} |`);
  L.push(`| Test Duration (cumulative) | ${formatDuration((tests.totalDuration || 0) / 1000)} |`);
  L.push('');
  if (Object.keys(tests.suiteAgg || {}).length) {
    L.push('### Suite Breakdown');
    L.push('');
    L.push('| Suite | Runs | Pass | Fail | Skip | Checks | Findings | Avg Duration |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const [suite, s] of Object.entries(tests.suiteAgg || {})) {
      const avg = s.runs ? Math.round((s.durationMs || 0) / s.runs) : 0;
      L.push(`| ${suite} | ${s.runs} | ${s.pass} | ${s.fail} | ${s.skip} | ${s.checks} | ${s.findings} | ${avg}ms |`);
    }
    L.push('');
  }
  L.push('## Agent Invocations');
  L.push('');
  L.push('| Agent | Spawns |');
  L.push('|---|---|');
  L.push(`| Forge (code writer) | ${agents.forge || 0} |`);
  L.push(`| Buster (tester) | ${agents.buster || 0} |`);
  L.push(`| Echo (reviewer) | ${agents.echo || 0} |`);
  L.push(`| Gate/Review Fixes | ${(agents.gateFix || 0) + (agents.reviewFix || 0)} |`);
  L.push(`| **Total** | **${agents.total || 0}** |`);
  L.push('');
  L.push('## Complexity Highlights');
  L.push('');
  if ((pipeline.hardestModules || []).length) {
    L.push('| Module | Fails | Attempts | Status |');
    L.push('|---|---|---|---|');
    for (const m of pipeline.hardestModules) {
      L.push(`| ${m.title || m.id} | ${m.fails || 0} | ${m.attempts || 0} | ${m.status || '—'} |`);
    }
    L.push('');
  }
  if ((pipeline.failPatterns || []).length) {
    L.push('### Top Failure Patterns');
    L.push('');
    L.push('| Pattern | Count |');
    L.push('|---|---|');
    for (const [pattern, count] of pipeline.failPatterns) {
      L.push(`| ${pattern} | ${count} |`);
    }
    L.push('');
  }
  L.push('## Module Detail');
  L.push('');
  L.push('| # | Module | Status | Fails | Duration | Suites |');
  L.push('|---|---|---|---|---|---|');
  for (const m of (pipeline.moduleStats || [])) {
    const suites = (tests.perModule || []).find(x => x.id === m.id)?.suites || [];
    const dur = m.cost?.total_duration_seconds ? formatDuration(m.cost.total_duration_seconds) : '—';
    L.push(`| ${m.id || '—'} | ${m.title || '—'} | ${m.status || '—'} | ${m.failCount || 0} | ${dur} | ${suites.join(', ') || '—'} |`);
  }
  L.push('');
  L.push('## Timeline');
  L.push('');
  L.push('| Module | Started | Completed | Duration |');
  L.push('|---|---|---|---|');
  for (const m of (pipeline.moduleStats || [])) {
    const dur = m.cost?.total_duration_seconds ? formatDuration(m.cost.total_duration_seconds) : '—';
    L.push(`| ${m.id}. ${m.title} | ${(m.startedAt || '—').replace('T', ' ').slice(0, 16)} | ${(m.completedAt || '—').replace('T', ' ').slice(0, 16)} | ${dur} |`);
  }
  L.push('');
  L.push('---');
  L.push(`*Generated by project-summary.js — KubeClaw Pipeline*`);
  return L.join('\n');
}

// ── Discord Embeds ──────────────────────────────────────────────

function buildDiscordEmbeds(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents) {
  const langs = Object.entries(code.byLang || {})
    .filter(([l]) => !['JSON','Markdown','YAML','Other'].includes(l))
    .map(([l, v]) => [l, v.code])
    .filter(([,v]) => v > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([l, n]) => `${l}: ${formatNum(n)}`).join(', ') || '—';

  const hardest = (pipeline.hardestModules || []).slice(0, 3)
    .map(m => `${m.id}. ${m.title} (${m.failCount} fails)`)
    .join('\n') || 'All passed first try! 🎉';

  const gateStr = (pipeline.gateStats || [])
    .map(g => `${['GO','PASS'].includes(g.status)?'✅':['NO-GO','FAIL'].includes(g.status)?'❌':'⏳'} ${g.title}`)
    .join('\n') || '—';

  const totalTests = (unitCensus.totalFunctions || 0) + (apiCensus.totalCases || 0);
  const passedGates = (pipeline.gateStats || []).filter(g => ['GO','PASS'].includes(g.status)).length;
  const scope = groupDeliveredScope((pipeline.moduleStats || []).filter(m => m.status === 'PASS').map(m => m.title || m.id));
  const scopeSummary = [
    ...(scope.platform_backend || []).slice(0, 2),
    ...(scope.frontend_ui || []).slice(0, 2),
    ...(scope.delivery_ops || []).slice(0, 2),
  ].slice(0, 5).join('\n') || 'See project summary markdown';
  const quality = [
    `Modules: ${pipeline.totalCompleted}/${pipeline.moduleCount} passed`,
    `Gates: ${passedGates}/${pipeline.gateCount} passed`,
    `Reviews: ${reviews.totalCritical || 0} critical, ${reviews.totalDeferred || 0} deferred`,
    `Tests: ${totalTests} total surface`,
  ].join('\n');

  const operational = {
    title: `📊 Project Summary: ${project}`,
    color: pipeline.totalBlocked > 0 ? 15548997 : pipeline.totalPending > 0 ? 16776960 : 5763719,
    fields: [
      { name: '📦 Modules', value: `${pipeline.totalCompleted}/${pipeline.moduleCount}`, inline: true },
      { name: '🎯 First-Pass', value: `${pipeline.firstPassRate}%`, inline: true },
      { name: '🔄 Attempts', value: `${pipeline.totalAttempts}`, inline: true },
      { name: '📝 Code Lines', value: formatNum(code.codeLines || code.totalLines), inline: true },
      { name: '📁 Code Files', value: `${code.codeFiles}`, inline: true },
      { name: '🔀 Commits', value: `${code.commitCount || 0}`, inline: true },
      { name: '🧪 Tests Written', value: `${totalTests} (${unitCensus.python.functions} py + ${unitCensus.frontend.functions} tsx + ${apiCensus.totalCases} api)`, inline: false },
      { name: '🤖 Agent Spawns', value: `${agents.total} (${agents.forge} Forge, ${agents.buster} Buster, ${agents.echo} Echo)`, inline: false },
      { name: '🔤 Languages', value: langs, inline: false },
      { name: '🏔️ Hardest', value: hardest, inline: false },
      { name: '🚦 Gates', value: gateStr, inline: false },
      ...(pipeline.elapsedHours ? [{ name: '⏱️ Duration', value: `${pipeline.elapsedHours}h wall clock`, inline: true }] : []),
      ...((reviews.totalCritical || 0) > 0 ? [{ name: '🔍 Review Issues', value: `${reviews.totalCritical} critical, ${reviews.totalDeferred} deferred`, inline: true }] : []),
    ],
    footer: { text: `KubeClaw • ${new Date().toISOString().split('T')[0]}` },
  };

  const executive = {
    title: `🧾 Case Study Summary: ${project}`,
    color: (pipeline.totalCompleted === pipeline.moduleCount && passedGates === pipeline.gateCount) ? 5763719 : 16776960,
    fields: [
      { name: '✅ Final Status', value: (pipeline.totalCompleted === pipeline.moduleCount && passedGates === pipeline.gateCount) ? 'GO / COMPLETE' : 'INCOMPLETE', inline: true },
      { name: '⏱️ Delivery', value: `${pipeline.elapsedHours || '—'}h wall clock`, inline: true },
      { name: '🔄 Attempts', value: `${pipeline.totalAttempts}`, inline: true },
      { name: '📦 Scope', value: scopeSummary, inline: false },
      { name: '🧪 Quality Outcome', value: quality, inline: false },
      { name: '🤖 Agent Spawns', value: `${agents.total} total (${agents.forge} Forge, ${agents.buster} Buster, ${agents.echo} Echo)`, inline: false },
    ],
    footer: { text: `KubeClaw • ${new Date().toISOString().split('T')[0]}` },
  };

  return [operational, executive];
}

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
  const repoDir = opts.repoDir || discoverDefaultRepoDir();
  const configPath = opts.configPath || discoverDefaultConfigPath(repoDir);
  const { swarmRoot } = resolveProjectPaths(project, repoDir, configPath);
  const logDir = path.join(swarmRoot, 'logs');
  const latest = readJson(path.join(logDir, 'pipeline', 'latest.json')) || {};
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
      _logDir: context.logDir,
      _runLogDir: context.runLogDir,
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
    await discordEmbeds(config, summaryEmbeds, { level: 'INFO' });
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
  const repoDir    = validateAllowedPath(opts.repoDir || discoverDefaultRepoDir(), 'project-summary.repoDir');
  const configPath = validateAllowedPath(opts.configPath || discoverDefaultConfigPath(repoDir), 'project-summary.configPath');

  if (!project) throw new Error('No project specified (--project or CURRENT_PROJECT env)');
  if (!fs.existsSync(repoDir)) throw new Error(`Repo dir not found: ${repoDir}`);

  log(`Generating summary for: ${project}`);
  const { projectRoot, swarmRoot, progressPath } = resolveProjectPaths(project, repoDir, configPath);
  if (!fs.existsSync(progressPath)) throw new Error(`progress.json not found: ${progressPath}`);
  const progress = readJson(progressPath);
  if (!progress) throw new Error('Failed to parse progress.json');

  log('Collecting code stats...');
  const code = collectCodeStats(repoDir, projectRoot);

  log('Collecting unit test census...');
  const unitCensus = collectUnitTestCensus(projectRoot);

  log('Collecting API test specs...');
  const apiCensus = collectApiTestCensus(swarmRoot);

  log('Collecting pipeline stats...');
  const pipeline = collectPipelineStats(progress, swarmRoot);

  log('Collecting test suite results...');
  const tests = collectTestResults(swarmRoot, progress.modules || {});

  log('Collecting review stats...');
  const reviews = collectReviewStats(swarmRoot);

  log('Collecting agent invocations...');
  const agents = collectAgentInvocations(swarmRoot);

  const markdown = buildMarkdown(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents);
  const embeds = buildDiscordEmbeds(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents);
  const caseStudyBase = buildCaseStudyBase(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents);

  log('Summary complete.');
  return {
    summaryType: 'project_summary',
    project, markdown, embeds, caseStudyBase,
    data: { code, unitCensus, apiCensus, pipeline, tests, reviews, agents },
  };
}

// ═══════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const args = process.argv.slice(2);
  const getArg = (n, fb) => { const i = args.indexOf(`--${n}`); return i === -1 || i + 1 >= args.length ? fb : args[i + 1]; };
  const getFlag = (n) => args.includes(`--${n}`);

  const project = getArg('project', process.env.CURRENT_PROJECT);
  const output  = getArg('output', null);
  const repoDir = getArg('repo', null);

  if (!project) { console.error('Usage: node project-summary.js --project <n> [--discord] [--output <file>] [--json] [--repo <path>]'); process.exit(2); }

  generateSummary({ project, ...(repoDir ? { repoDir } : {}) })
    .then(async (result) => {
      if (getFlag('json')) {
        const out = JSON.stringify(result.data, null, 2);
        if (output) { fs.writeFileSync(output, out); log(`JSON: ${output}`); } else console.log(out);
      } else {
        if (output) { fs.writeFileSync(output, result.markdown); log(`Report: ${output}`); } else console.log(result.markdown);
      }
      if (getFlag('discord')) {
        await postToDiscord(result.embeds, {
          project,
          repoDir,
          outputFile: getFlag('json') ? null : output,
          jsonOutputPath: getFlag('json') ? output : null,
        });
      }
      process.exit(0);
    })
    .catch((err) => { console.error(`Error: ${err.message}`); process.exit(1); });
}

export { generateSummary, postToDiscord };
