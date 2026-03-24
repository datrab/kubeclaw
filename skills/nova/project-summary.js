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

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  repoDir: '/home/node/.openclaw/workspace/git-repo',
  configPath: '/home/node/.openclaw/swarm.config.json',
};

// ── Helpers ─────────────────────────────────────────────────────

function log(msg) { console.log(`[SUMMARY] ${msg}`); }

function git(repoDir, args) {
  try {
    return execSync(`git -C "${repoDir}" ${args}`, {
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
  let tracked = git(repoDir, `ls-files -- "${relProject}"`)
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

  let totalLines = 0, totalFiles = 0;
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
      if (isSwarm) byLang[lang].swarm += lines; else byLang[lang].code += lines;
    } catch { /* skip */ }
  }

  const swarmFiles = tracked.filter(f => f.includes('.swarm/')).length;
  const codeFiles = totalFiles - swarmFiles;
  const commitCount = parseInt(git(repoDir, `rev-list --count HEAD -- "${relProject}"`) || '0');
  const authors = git(repoDir, `log --format="%aN" -- "${relProject}" | sort -u`).split('\n').filter(Boolean);
  const firstCommit = git(repoDir, `log --reverse --format="%aI" -- "${relProject}" | head -1`);
  const lastCommit = git(repoDir, `log -1 --format="%aI" -- "${relProject}"`);

  return { totalLines, totalFiles, codeFiles, swarmFiles, byLang, commitCount, authors,
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
    const status = readJson(statusPath) || {};

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
  const L = [];

  L.push(`# Project Summary: ${project}`);
  L.push(`Generated: ${new Date().toISOString()}\n`);

  // ── Overview
  L.push('## Overview\n');
  L.push('| Metric | Value |');
  L.push('|---|---|');
  L.push(`| Modules | ${pipeline.totalCompleted} completed, ${pipeline.totalBlocked} blocked, ${pipeline.totalPending} pending (of ${pipeline.moduleCount}) |`);
  L.push(`| Gates | ${pipeline.gateCount} (${pipeline.gateStats.filter(g => g.status === 'GO' || g.status === 'PASS').length} passed) |`);
  L.push(`| Total Pipeline Attempts | ${pipeline.totalAttempts} |`);
  L.push(`| First-Pass Rate | ${pipeline.firstPassRate}% (${pipeline.passedFirstTry}/${pipeline.totalCompleted}) |`);
  L.push(`| Avg Attempts per Module | ${pipeline.avgAttempts} |`);
  if (pipeline.elapsedHours) L.push(`| Wall Clock Time | ${pipeline.elapsedHours}h |`);
  if (pipeline.totalDuration > 0) L.push(`| Total Agent Time | ${formatDuration(pipeline.totalDuration)} |`);
  if (pipeline.earliestStart) L.push(`| Started | ${pipeline.earliestStart.split('T')[0]} |`);
  if (pipeline.latestComplete) L.push(`| Completed | ${pipeline.latestComplete.split('T')[0]} |`);
  L.push('');

  // ── Code
  L.push('## Code\n');
  L.push('| Metric | Value |');
  L.push('|---|---|');
  L.push(`| Total Lines | ${formatNum(code.totalLines)} |`);
  L.push(`| Files | ${code.codeFiles} code + ${code.swarmFiles} pipeline config |`);
  L.push(`| Commits | ${code.commitCount} |`);
  L.push(`| Contributors | ${code.authors.join(', ') || '—'} |`);
  L.push('');

  const langs = Object.entries(code.byLang)
    .filter(([l]) => !['JSON','Markdown','YAML','Other'].includes(l))
    .map(([l, v]) => [l, v.code])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (langs.length > 0) {
    const codeLoc = langs.reduce((s, [, v]) => s + v, 0);
    L.push('### Lines by Language (code only)\n');
    L.push('| Language | Lines | Share |');
    L.push('|---|---|---|');
    for (const [lang, loc] of langs) L.push(`| ${lang} | ${formatNum(loc)} | ${pct(loc, codeLoc)}% |`);
    L.push('');
  }

  // ── Tests
  L.push('## Tests\n');
  L.push('| Metric | Value |');
  L.push('|---|---|');
  L.push(`| Unit Tests (Python/pytest) | ${unitCensus.python.functions} functions in ${unitCensus.python.files} files |`);
  L.push(`| Unit Tests (Frontend/Vitest) | ${unitCensus.frontend.functions} test blocks in ${unitCensus.frontend.files} files |`);
  L.push(`| API Test Specs | ${apiCensus.totalCases} cases in ${apiCensus.specs.length} specs |`);
  L.push(`| Total Test Functions | ${unitCensus.totalFunctions + apiCensus.totalCases} |`);
  L.push(`| Suite Runs (Buster pre-checks) | ${tests.totalRuns} |`);
  L.push(`| Total Checks Executed | ${tests.totalChecks} |`);
  L.push(`| Total Findings | ${tests.totalFindings} |`);
  L.push(`| Test Duration (cumulative) | ${formatDuration(tests.totalDuration / 1000)} |`);
  L.push('');

  // Suite breakdown
  const suiteOrder = ['build','health','security','api','unit','a11y','perf','bundle','visual-reg','e2e'];
  const sortedSuites = Object.entries(tests.suiteAgg).sort((a, b) => {
    const ia = suiteOrder.indexOf(a[0]), ib = suiteOrder.indexOf(b[0]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  if (sortedSuites.length > 0) {
    L.push('### Suite Breakdown\n');
    L.push('| Suite | Runs | Pass | Fail | Skip | Checks | Findings | Avg Duration |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const [name, s] of sortedSuites) {
      const avgDur = s.runs > 0 ? Math.round(s.durationMs / s.runs) : 0;
      L.push(`| ${name} | ${s.runs} | ${s.pass} | ${s.fail} | ${s.skip + s.error} | ${s.checks} | ${s.findings} | ${avgDur}ms |`);
    }
    L.push('');
  }

  // ── Agent Invocations
  L.push('## Agent Invocations\n');
  L.push('| Agent | Spawns |');
  L.push('|---|---|');
  L.push(`| Forge (code writer) | ${agents.forge} |`);
  L.push(`| Buster (tester) | ${agents.buster} |`);
  L.push(`| Echo (reviewer) | ${agents.echo} |`);
  L.push(`| Gate/Review Fixes | ${agents.gateFix + agents.reviewFix} |`);
  L.push(`| **Total** | **${agents.total}** |`);
  L.push('');

  // ── Tokens
  if (pipeline.tokens.total > 0) {
    L.push('## Token Usage\n');
    L.push('| Agent | Input | Output | Total |');
    L.push('|---|---|---|---|');
    L.push(`| Forge | ${formatNum(pipeline.tokens.forgeIn)} | ${formatNum(pipeline.tokens.forgeOut)} | ${formatNum(pipeline.tokens.forgeIn + pipeline.tokens.forgeOut)} |`);
    L.push(`| Buster | ${formatNum(pipeline.tokens.busterIn)} | ${formatNum(pipeline.tokens.busterOut)} | ${formatNum(pipeline.tokens.busterIn + pipeline.tokens.busterOut)} |`);
    L.push(`| **Total** | | | **${formatNum(pipeline.tokens.total)}** |`);
    L.push('');
  }

  // ── Quality Gates
  if (pipeline.gateStats.length > 0 || reviews.reviews.length > 0) {
    L.push('## Quality Gates\n');
    L.push('| Gate | Type | Status |');
    L.push('|---|---|---|');
    for (const g of pipeline.gateStats) {
      const icon = ['GO','PASS'].includes(g.status) ? '✅' : ['NO-GO','FAIL'].includes(g.status) ? '❌' : '⏳';
      L.push(`| ${g.title} | ${g.type} | ${icon} ${g.status} |`);
    }
    L.push('');

    if (reviews.totalCritical > 0 || reviews.totalDeferred > 0) {
      L.push('### Echo Review Findings\n');
      L.push(`| Metric | Count |`);
      L.push(`|---|---|`);
      L.push(`| Critical Issues Found | ${reviews.totalCritical} |`);
      L.push(`| Deferred Issues | ${reviews.totalDeferred} |`);
      L.push(`| Total Reviews | ${reviews.reviews.filter(r => r.type === 'detail').length} |`);
      L.push('');
    }
  }

  // ── Hardest Modules
  if (pipeline.hardestModules.length > 0) {
    L.push('## Hardest Modules\n');
    L.push('| Module | Fails | Attempts | Status |');
    L.push('|---|---|---|---|');
    for (const m of pipeline.hardestModules) {
      const icon = m.status === 'PASS' ? '✅' : m.status === 'BLOCKED' ? '🚫' : '⏳';
      L.push(`| ${m.id}. ${m.title} | ${m.failCount} | ${m.attempts} | ${icon} |`);
    }
    L.push('');
  }

  // ── Failure Patterns
  if (pipeline.failPatterns.length > 0) {
    L.push('## Top Failure Patterns\n');
    L.push('| Pattern | Count |');
    L.push('|---|---|');
    for (const [p, c] of pipeline.failPatterns) L.push(`| ${p.slice(0, 120)} | ${c} |`);
    L.push('');
  }

  // ── Module Detail
  L.push('## Module Detail\n');
  L.push('| # | Module | Status | Fails | Duration | Suites |');
  L.push('|---|---|---|---|---|---|');
  for (const m of pipeline.moduleStats) {
    const icon = m.status === 'PASS' ? '✅' : m.status === 'BLOCKED' ? '🚫' : '⏳';
    const dur = formatDuration(m.cost.total_duration_seconds || 0);
    const tr = tests.perModule.find(t => t.id === m.id);
    const suites = tr ? tr.suites.join(', ') : '—';
    L.push(`| ${m.id} | ${m.title} | ${icon} | ${m.failCount} | ${dur} | ${suites} |`);
  }
  L.push('');

  // ── Timeline
  L.push('## Timeline\n');
  L.push('| Module | Started | Completed | Duration |');
  L.push('|---|---|---|---|');
  for (const m of pipeline.moduleStats.filter(m => m.startedAt).sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))) {
    const s = m.startedAt ? m.startedAt.slice(5, 16).replace('T', ' ') : '—';
    const c = m.completedAt ? m.completedAt.slice(5, 16).replace('T', ' ') : '—';
    const dur = formatDuration(m.cost.total_duration_seconds || 0);
    L.push(`| ${m.id}. ${m.title} | ${s} | ${c} | ${dur} |`);
  }
  L.push('');

  L.push('---');
  L.push(`*Generated by project-summary.js — KubeClaw Pipeline*`);
  return L.join('\n');
}

// ── Discord Embeds ──────────────────────────────────────────────

function buildDiscordEmbeds(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents) {
  const langs = Object.entries(code.byLang)
    .filter(([l]) => !['JSON','Markdown','YAML','Other'].includes(l))
    .map(([l, v]) => [l, v.code]).filter(([,v]) => v > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([l, n]) => `${l}: ${formatNum(n)}`).join(', ') || '—';

  const hardest = pipeline.hardestModules.slice(0, 3)
    .map(m => `${m.id}. ${m.title} (${m.failCount} fails)`)
    .join('\n') || 'All passed first try! 🎉';

  const gateStr = pipeline.gateStats
    .map(g => `${['GO','PASS'].includes(g.status)?'✅':['NO-GO','FAIL'].includes(g.status)?'❌':'⏳'} ${g.title}`)
    .join('\n') || '—';

  const totalTests = unitCensus.totalFunctions + apiCensus.totalCases;

  return [{
    title: `📊 Project Summary: ${project}`,
    color: pipeline.totalBlocked > 0 ? 15548997 : pipeline.totalPending > 0 ? 16776960 : 5763719,
    fields: [
      { name: '📦 Modules', value: `${pipeline.totalCompleted}/${pipeline.moduleCount}`, inline: true },
      { name: '🎯 First-Pass', value: `${pipeline.firstPassRate}%`, inline: true },
      { name: '🔄 Attempts', value: `${pipeline.totalAttempts}`, inline: true },
      { name: '📝 Lines of Code', value: formatNum(code.totalLines), inline: true },
      { name: '📁 Files', value: `${code.codeFiles}`, inline: true },
      { name: '🔀 Commits', value: `${code.commitCount}`, inline: true },
      { name: '🧪 Tests Written', value: `${totalTests} (${unitCensus.python.functions} py + ${unitCensus.frontend.functions} tsx + ${apiCensus.totalCases} api)`, inline: false },
      { name: '🤖 Agent Spawns', value: `${agents.total} (${agents.forge} Forge, ${agents.buster} Buster, ${agents.echo} Echo)`, inline: false },
      { name: '🔤 Languages', value: langs, inline: false },
      { name: '🏔️ Hardest', value: hardest, inline: false },
      { name: '🚦 Gates', value: gateStr, inline: false },
      ...(pipeline.elapsedHours ? [{ name: '⏱️ Duration', value: `${pipeline.elapsedHours}h wall clock`, inline: true }] : []),
      ...(reviews.totalCritical > 0 ? [{ name: '🔍 Review Issues', value: `${reviews.totalCritical} critical, ${reviews.totalDeferred} deferred`, inline: true }] : []),
    ],
    footer: { text: `KubeClaw • ${new Date().toISOString().split('T')[0]}` },
  }];
}

async function postToDiscord(embeds) {
  const url = process.env.DISCORD_WEBHOOK;
  if (!url) { log('DISCORD_WEBHOOK not set — skipping'); return false; }
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    log('Discord: summary posted');
    return true;
  } catch (e) { log(`Discord post failed: ${e.message}`); return false; }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function generateSummary(opts = {}) {
  const project    = opts.project || process.env.CURRENT_PROJECT;
  const repoDir    = opts.repoDir || process.env.REPO_DIR || DEFAULTS.repoDir;
  const configPath = opts.configPath || process.env.SWARM_CONFIG || DEFAULTS.configPath;

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

  log('Summary complete.');
  return {
    project, markdown, embeds,
    data: { code, unitCensus, apiCensus, pipeline, tests, reviews, agents },
  };
}

// ═══════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════

if (require.main === module) {
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
      if (getFlag('discord')) await postToDiscord(result.embeds);
      process.exit(0);
    })
    .catch((err) => { console.error(`Error: ${err.message}`); process.exit(1); });
}

module.exports = { generateSummary };
