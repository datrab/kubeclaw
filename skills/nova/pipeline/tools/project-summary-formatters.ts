// ═══════════════════════════════════════════════════════════════
// Project summary report formatters
// ═══════════════════════════════════════════════════════════════

export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
}

export function formatNum(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }

function pythonUnitFunctions(unitCensus = {}) {
  return unitCensus.python?.functions ?? unitCensus.pythonFunctions ?? 0;
}

function frontendUnitFunctions(unitCensus = {}) {
  return unitCensus.frontend?.functions ?? unitCensus.frontendBlocks ?? 0;
}

function pythonUnitFiles(unitCensus = {}) {
  return unitCensus.python?.files ?? unitCensus.pythonFiles ?? 0;
}

function frontendUnitFiles(unitCensus = {}) {
  return unitCensus.frontend?.files ?? unitCensus.frontendFiles ?? 0;
}

function apiSpecs(apiCensus = {}) {
  return Array.isArray(apiCensus.specs) ? apiCensus.specs : [];
}

function totalTestSurface(unitCensus = {}, apiCensus = {}) {
  return pythonUnitFunctions(unitCensus) + frontendUnitFunctions(unitCensus) + (apiCensus.totalCases || 0);
}

function moduleFailCount(module = {}) {
  return module.failCount ?? module.fails ?? 0;
}

const SCOPE_GROUP_KEYS = new Set([
  'platform_backend',
  'frontend_ui',
  'delivery_ops',
  'data_security',
  'other',
]);

function normalizeScopeGroup(value) {
  if (typeof value !== 'string') return 'other';
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, '_');
  return SCOPE_GROUP_KEYS.has(normalized) ? normalized : 'other';
}

function moduleDisplayName(module) {
  if (typeof module === 'string') return module;
  return module?.title || module?.name || module?.id || '';
}

function moduleScopeGroup(module) {
  if (!module || typeof module === 'string') return 'other';
  return normalizeScopeGroup(
    module.scope_group
      ?? module.scopeGroup
      ?? module.scope?.group
      ?? module.category
      ?? module.metadata?.scope_group
      ?? module.metadata?.scopeGroup
  );
}

export function groupDeliveredScope(modules = []) {
  const groups = {
    platform_backend: [],
    frontend_ui: [],
    delivery_ops: [],
    data_security: [],
    other: [],
  };
  for (const module of modules) {
    const title = String(moduleDisplayName(module) || '');
    if (!title) continue;
    groups[moduleScopeGroup(module)].push(title);
  }
  return groups;
}

export function buildCaseStudyBase(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents) {
  const deliveredModuleStats = (pipeline.moduleStats || []).filter(m => m.status === 'PASS');
  const deliveredModules = deliveredModuleStats.map(m => m.title || m.id);
  const hardestModules = (pipeline.hardestModules || []).slice(0, 5).map(m => ({
    module: m.title || m.id,
    fails: moduleFailCount(m),
    attempts: m.attempts || 0,
    status: m.status || null,
  }));
  const pythonTests = pythonUnitFunctions(unitCensus);
  const frontendTests = frontendUnitFunctions(unitCensus);
  const scope = groupDeliveredScope(deliveredModuleStats);
  const testDurationSeconds = tests.totalDurationSec ?? ((tests.totalDuration || 0) / 1000);
  return {
    project: {
      id: project,
      name: String(project || ''),
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
      code_files: code.codeFiles ?? 0,
      pipeline_config_files: code.swarmFiles || 0,
      commits: code.commitCount || 0,
      contributors: code.authors || [],
      languages: Object.entries(code.byLang || {}).map(([lang, v]) => ({ name: lang, lines: v.code || 0, share_pct: pct(v.code || 0, Math.max(1, (code.totalLines || 0) - (code.byLang?.JSON?.total || 0) - (code.byLang?.Markdown?.total || 0) - (code.byLang?.YAML?.total || 0)) ) })).filter(x => x.lines > 0),
    },
    tests: {
      unit_test_functions_total: pythonTests + frontendTests + (apiCensus.totalCases || 0),
      python_unit_tests: pythonTests,
      frontend_unit_tests: frontendTests,
      api_test_cases: apiCensus.totalCases || 0,
      suite_runs: tests.totalRuns || 0,
      checks_executed: tests.totalChecks || 0,
      findings_total: tests.totalFindings || 0,
      duration_seconds: testDurationSeconds,
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


export function buildMarkdown(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents) {
  const cs = buildCaseStudyBase(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents);
  const pythonTests = pythonUnitFunctions(unitCensus);
  const frontendTests = frontendUnitFunctions(unitCensus);
  const apiTestSpecs = apiSpecs(apiCensus);
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
  L.push(`| Unit Tests (Python/pytest) | ${pythonTests} functions in ${pythonUnitFiles(unitCensus)} files |`);
  L.push(`| Unit Tests (Frontend/Vitest) | ${frontendTests} test blocks in ${frontendUnitFiles(unitCensus)} files |`);
  L.push(`| API Test Specs | ${apiCensus.totalCases || 0} cases in ${apiTestSpecs.length} specs |`);
  L.push(`| Total Test Functions | ${totalTestSurface(unitCensus, apiCensus)} |`);
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
      L.push(`| ${m.title || m.id} | ${moduleFailCount(m)} | ${m.attempts || 0} | ${m.status || '—'} |`);
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
  L.push(`*Generated by project-summary.ts — KubeClaw Pipeline*`);
  return L.join('\n');
}

// ── Discord Embeds ──────────────────────────────────────────────

const DISCORD_FIELD_VALUE_LIMIT = 1024;

function truncateDiscordFieldValue(value) {
  const s = String(value ?? '—');
  if (s.length <= DISCORD_FIELD_VALUE_LIMIT) return s;
  return s.slice(0, DISCORD_FIELD_VALUE_LIMIT - 1) + '…';
}

function withDiscordSafeFields(embed) {
  return {
    ...embed,
    fields: (embed.fields || []).map(field => ({
      ...field,
      value: truncateDiscordFieldValue(field.value),
    })),
  };
}

export function buildDiscordEmbeds(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents) {
  const langs = Object.entries(code.byLang || {})
    .filter(([l]) => !['JSON','Markdown','YAML','Other'].includes(l))
    .map(([l, v]) => [l, v.code])
    .filter(([,v]) => v > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([l, n]) => `${l}: ${formatNum(n)}`).join(', ') || '—';

  const hardest = (pipeline.hardestModules || []).slice(0, 3)
    .map(m => `${m.id}. ${m.title} (${moduleFailCount(m)} fails)`)
    .join('\n') || 'All passed first try! 🎉';

  const gateStr = (pipeline.gateStats || [])
    .map(g => `${['GO','PASS'].includes(g.status)?'✅':['NO-GO','FAIL'].includes(g.status)?'❌':'⏳'} ${g.title}`)
    .join('\n') || '—';

  const totalTests = totalTestSurface(unitCensus, apiCensus);
  const pythonTests = pythonUnitFunctions(unitCensus);
  const frontendTests = frontendUnitFunctions(unitCensus);
  const passedGates = (pipeline.gateStats || []).filter(g => ['GO','PASS'].includes(g.status)).length;
  const scope = groupDeliveredScope((pipeline.moduleStats || []).filter(m => m.status === 'PASS'));
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
      { name: '🧪 Tests Written', value: `${totalTests} (${pythonTests} py + ${frontendTests} tsx + ${apiCensus.totalCases || 0} api)`, inline: false },
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

  return [operational, executive].map(withDiscordSafeFields);
}
