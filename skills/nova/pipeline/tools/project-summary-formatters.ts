import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Project summary report formatters
// ═══════════════════════════════════════════════════════════════

export function formatDuration(seconds) {
  if (selectTruthyValue(() => (!seconds), () => (seconds <= 0))) return '—';
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

const DISPLAY_ABSENT = '—';
const PASS_STATUSES = new Set(['PASS']);
const FAIL_STATUSES = new Set(['FAIL']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function reportRecord(value, field) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return {};
  if (!isRecord(value)) throw new Error(`${field}: expected project-summary object`);
  return value;
}

function reportArray(value, field) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return [];
  if (!Array.isArray(value)) throw new Error(`${field}: expected project-summary array`);
  return value;
}

function reportNumber(value, field) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`${field}: expected project-summary number`);
}

function reportString(value, field) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  if (typeof value === 'string') return value;
  throw new Error(`${field}: expected project-summary string`);
}

function reportDisplay(value) {
  const text = reportString(value, 'project_summary.display');
  return text.length > 0 ? text : DISPLAY_ABSENT;
}

function displayList(items) {
  const text = reportArray(items, 'project_summary.display_list').join(', ');
  return text.length > 0 ? text : DISPLAY_ABSENT;
}

function firstReportText(field, values) {
  for (const value of values) {
    const text = reportString(value, field).trim();
    if (text.length > 0) return text;
  }
  return '';
}

function passGateCount(gateStats) {
  return reportArray(gateStats, 'pipeline.gateStats').filter((gate) => PASS_STATUSES.has(gate.status)).length;
}

function failedGateCount(gateStats) {
  return reportArray(gateStats, 'pipeline.gateStats').filter((gate) => !PASS_STATUSES.has(gate.status)).length;
}

function finalStatusLabel({ allModulesPassed, allGatesPassed, blockedCount = 0 }) {
  if (allModulesPassed && allGatesPassed) return 'PASS';
  return blockedCount > 0 ? 'BLOCKED' : 'INCOMPLETE';
}

function blockedOutcomeLine(moduleStats) {
  const blocked = reportArray(moduleStats, 'pipeline.moduleStats').find((module) => module.status === 'BLOCKED');
  if (!blocked) return null;
  const phase = firstReportText('pipeline.moduleStats.blockedPhase', [
    selectDefinedValue(() => (blocked.blockedPhase), () => (null)),
    selectDefinedValue(() => (blocked.blocked_phase), () => (null)),
  ]);
  const reason = firstReportText('pipeline.moduleStats.blockedReason', [
    selectDefinedValue(() => (blocked.blockedReason), () => (null)),
    selectDefinedValue(() => (blocked.completionSummary), () => (null)),
  ]);
  return `- **Blocking Point:** ${moduleDisplayName(blocked)}${phase ? ` / ${phase}` : ''}${reason ? ` — ${reason}` : ''}`;
}

function hasPassedAllGates(gateStats) {
  return reportArray(gateStats, 'pipeline.gateStats').every((gate) => PASS_STATUSES.has(gate.status));
}

function normalizeFormatterInput({ code, pipeline, tests, unitCensus, apiCensus, reviews, agents }) {
  return {
    code: reportRecord(code, 'code'),
    pipeline: reportRecord(pipeline, 'pipeline'),
    tests: reportRecord(tests, 'tests'),
    unitCensus: reportRecord(unitCensus, 'unitCensus'),
    apiCensus: reportRecord(apiCensus, 'apiCensus'),
    reviews: reportRecord(reviews, 'reviews'),
    agents: reportRecord(agents, 'agents'),
  };
}

function pythonUnitFunctions(unitCensus) {
  const census = reportRecord(unitCensus, 'unitCensus');
  const python = reportRecord(census.python, 'unitCensus.python');
  if (python.functions !== undefined && python.functions !== null) return reportNumber(python.functions, 'unitCensus.python.functions');
  return reportNumber(census.pythonFunctions, 'unitCensus.pythonFunctions');
}

function frontendUnitFunctions(unitCensus) {
  const census = reportRecord(unitCensus, 'unitCensus');
  const frontend = reportRecord(census.frontend, 'unitCensus.frontend');
  if (frontend.functions !== undefined && frontend.functions !== null) return reportNumber(frontend.functions, 'unitCensus.frontend.functions');
  return reportNumber(census.frontendBlocks, 'unitCensus.frontendBlocks');
}

function pythonUnitFiles(unitCensus) {
  const census = reportRecord(unitCensus, 'unitCensus');
  const python = reportRecord(census.python, 'unitCensus.python');
  if (python.files !== undefined && python.files !== null) return reportNumber(python.files, 'unitCensus.python.files');
  return reportNumber(census.pythonFiles, 'unitCensus.pythonFiles');
}

function frontendUnitFiles(unitCensus) {
  const census = reportRecord(unitCensus, 'unitCensus');
  const frontend = reportRecord(census.frontend, 'unitCensus.frontend');
  if (frontend.files !== undefined && frontend.files !== null) return reportNumber(frontend.files, 'unitCensus.frontend.files');
  return reportNumber(census.frontendFiles, 'unitCensus.frontendFiles');
}

function apiSpecs(apiCensus) {
  return reportArray(reportRecord(apiCensus, 'apiCensus').specs, 'apiCensus.specs');
}

function apiTotalCases(apiCensus) {
  return reportNumber(reportRecord(apiCensus, 'apiCensus').totalCases, 'apiCensus.totalCases');
}

function totalTestSurface(unitCensus, apiCensus) {
  return pythonUnitFunctions(unitCensus) + frontendUnitFunctions(unitCensus) + apiTotalCases(apiCensus);
}

function moduleFailCount(module) {
  const record = reportRecord(module, 'pipeline.module');
  if (record.failCount !== undefined && record.failCount !== null) return reportNumber(record.failCount, 'pipeline.module.failCount');
  return reportNumber(record.fails, 'pipeline.module.fails');
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
  const record = reportRecord(module, 'pipeline.module');
  return firstReportText('pipeline.module.display_name', [record.title, record.name, record.id]);
}

function moduleScopeGroup(module) {
  if (selectTruthyValue(() => (!module), () => (typeof module === 'string'))) return 'other';
  const record = reportRecord(module, 'pipeline.module');
  const scope = reportRecord(record.scope, 'pipeline.module.scope');
  const metadata = reportRecord(record.metadata, 'pipeline.module.metadata');
  return normalizeScopeGroup(
    firstReportText('pipeline.module.scope_group', [
      record.scope_group,
      record.scopeGroup,
      scope.group,
      record.category,
      metadata.scope_group,
      metadata.scopeGroup,
    ])
  );
}

export function groupDeliveredScope(modules) {
  const groups = {
    platform_backend: [],
    frontend_ui: [],
    delivery_ops: [],
    data_security: [],
    other: [],
  };
  for (const module of reportArray(modules, 'pipeline.modules')) {
    const title = moduleDisplayName(module);
    if (title.length === 0) continue;
    groups[moduleScopeGroup(module)].push(title);
  }
  return groups;
}

export function buildCaseStudyBase(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents) {
  ({ code, pipeline, tests, unitCensus, apiCensus, reviews, agents } = normalizeFormatterInput({ code, pipeline, tests, unitCensus, apiCensus, reviews, agents }));
  const moduleStats = reportArray(pipeline.moduleStats, 'pipeline.moduleStats');
  const gateStats = reportArray(pipeline.gateStats, 'pipeline.gateStats');
  const reviewStats = reportArray(reviews.reviews, 'reviews.reviews');
  const deliveredModuleStats = moduleStats.filter(m => m.status === 'PASS');
  const deliveredModules = deliveredModuleStats.map(moduleDisplayName).filter(Boolean);
  const hardestModules = reportArray(pipeline.hardestModules, 'pipeline.hardestModules').slice(0, 5).map(m => ({
    module: moduleDisplayName(m),
    fails: moduleFailCount(m),
    attempts: reportNumber(m.attempts, 'pipeline.hardestModules.attempts'),
    status: reportString(m.status, 'pipeline.hardestModules.status'),
  }));
  const pythonTests = pythonUnitFunctions(unitCensus);
  const frontendTests = frontendUnitFunctions(unitCensus);
  const scope = groupDeliveredScope(deliveredModuleStats);
  const testDurationSeconds = tests.totalDurationSec !== undefined && tests.totalDurationSec !== null
    ? reportNumber(tests.totalDurationSec, 'tests.totalDurationSec')
    : reportNumber(tests.totalDuration, 'tests.totalDuration') / 1000;
  const completedModules = reportNumber(pipeline.totalCompleted, 'pipeline.totalCompleted');
  const totalModules = reportNumber(pipeline.moduleCount, 'pipeline.moduleCount');
  const blockedModules = reportNumber(pipeline.totalBlocked, 'pipeline.totalBlocked');
  const allModulesPassed = completedModules === totalModules;
  const allGatesPassed = hasPassedAllGates(gateStats);
  const finalStatus = finalStatusLabel({ allModulesPassed, allGatesPassed, blockedCount: blockedModules });
  return {
    project: {
      id: project,
      name: reportString(project, 'project'),
      generated_at: new Date().toISOString(),
      status: finalStatus === 'PASS' ? 'complete' : finalStatus.toLowerCase(),
    },
    delivery: {
      started_at: reportString(pipeline.earliestStart, 'pipeline.earliestStart'),
      completed_at: reportString(pipeline.latestComplete, 'pipeline.latestComplete'),
      wall_clock_hours: reportNumber(pipeline.elapsedHours, 'pipeline.elapsedHours'),
      agent_runtime_hours: reportNumber(pipeline.agentHours, 'pipeline.agentHours'),
    },
    modules: {
      total: totalModules,
      passed: completedModules,
      blocked: blockedModules,
      pending: reportNumber(pipeline.totalPending, 'pipeline.totalPending'),
      first_pass_rate_pct: reportNumber(pipeline.firstPassRate, 'pipeline.firstPassRate'),
      avg_attempts_per_module: reportNumber(pipeline.avgAttempts, 'pipeline.avgAttempts'),
      total_attempts: reportNumber(pipeline.totalAttempts, 'pipeline.totalAttempts'),
    },
    gates: {
      total: reportNumber(pipeline.gateCount, 'pipeline.gateCount'),
      passed: passGateCount(gateStats),
      failed: failedGateCount(gateStats),
      reviews_total: reviewStats.length,
      critical_issues_found: reportNumber(reviews.totalCritical, 'reviews.totalCritical'),
      deferred_issues_found: reportNumber(reviews.totalDeferred, 'reviews.totalDeferred'),
    },
    code: {
      total_lines: reportNumber(code.codeLines, 'code.codeLines'),
      code_files: reportNumber(code.codeFiles, 'code.codeFiles'),
      pipeline_config_files: reportNumber(code.swarmFiles, 'code.swarmFiles'),
      commits: reportNumber(code.commitCount, 'code.commitCount'),
      contributors: reportArray(code.authors, 'code.authors'),
      languages: languageRows(code),
    },
    tests: {
      unit_test_functions_total: pythonTests + frontendTests + apiTotalCases(apiCensus),
      python_unit_tests: pythonTests,
      frontend_unit_tests: frontendTests,
      api_test_cases: apiTotalCases(apiCensus),
      suite_runs: reportNumber(tests.totalRuns, 'tests.totalRuns'),
      checks_executed: reportNumber(tests.totalChecks, 'tests.totalChecks'),
      findings_total: reportNumber(tests.totalFindings, 'tests.totalFindings'),
      duration_seconds: testDurationSeconds,
    },
    agents: {
      forge_spawns: reportNumber(agents.forge, 'agents.forge'),
      buster_spawns: reportNumber(agents.buster, 'agents.buster'),
      echo_spawns: reportNumber(agents.echo, 'agents.echo'),
      gate_fix_spawns: reportNumber(agents.gateFix, 'agents.gateFix') + reportNumber(agents.reviewFix, 'agents.reviewFix'),
      total_spawns: reportNumber(agents.total, 'agents.total'),
    },
    scope: {
      delivered_modules: deliveredModules,
      delivered_scope_groups: scope,
    },
    highlights: {
      hardest_modules: hardestModules,
      top_failure_patterns: reportArray(pipeline.failPatterns, 'pipeline.failPatterns').map(([pattern, count]) => ({ pattern, count })),
    },
    quality_outcome: {
      all_modules_passed: allModulesPassed,
      all_gates_passed: allGatesPassed,
      final_status: finalStatus,
    },
    timeline: moduleStats,
  };
}

function languageTotalLines(code) {
  const byLang = reportRecord(code.byLang, 'code.byLang');
  const json = reportRecord(byLang.JSON, 'code.byLang.JSON');
  const markdown = reportRecord(byLang.Markdown, 'code.byLang.Markdown');
  const yaml = reportRecord(byLang.YAML, 'code.byLang.YAML');
  return Math.max(1,
    reportNumber(code.totalLines, 'code.totalLines')
    - reportNumber(json.total, 'code.byLang.JSON.total')
    - reportNumber(markdown.total, 'code.byLang.Markdown.total')
    - reportNumber(yaml.total, 'code.byLang.YAML.total')
  );
}

function languageRows(code) {
  const totalLines = languageTotalLines(code);
  return Object.entries(reportRecord(code.byLang, 'code.byLang'))
    .map(([lang, value]) => {
      const stats = reportRecord(value, `code.byLang.${lang}`);
      const lines = reportNumber(stats.code, `code.byLang.${lang}.code`);
      return { name: lang, lines, share_pct: pct(lines, totalLines) };
    })
    .filter((entry) => entry.lines > 0);
}


export function buildMarkdown(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents) {
  ({ code, pipeline, tests, unitCensus, apiCensus, reviews, agents } = normalizeFormatterInput({ code, pipeline, tests, unitCensus, apiCensus, reviews, agents }));
  const cs = buildCaseStudyBase(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents);
  const pythonTests = pythonUnitFunctions(unitCensus);
  const frontendTests = frontendUnitFunctions(unitCensus);
  const apiTestSpecs = apiSpecs(apiCensus);
  const gateStats = reportArray(pipeline.gateStats, 'pipeline.gateStats');
  const moduleStats = reportArray(pipeline.moduleStats, 'pipeline.moduleStats');
  const reviewsRun = reportArray(reviews.reviews, 'reviews.reviews').length;
  const suiteAgg = reportRecord(tests.suiteAgg, 'tests.suiteAgg');
  const hardestModules = reportArray(pipeline.hardestModules, 'pipeline.hardestModules');
  const failPatterns = reportArray(pipeline.failPatterns, 'pipeline.failPatterns');
  const perModule = reportArray(tests.perModule, 'tests.perModule');
  const codeLines = reportNumber(code.codeLines, 'code.codeLines');
  const totalLines = reportNumber(code.totalLines, 'code.totalLines');
  const displayCodeLines = codeLines > 0 ? codeLines : totalLines;
  const L = [];
  L.push(`# Project Summary: ${project}`);
  L.push(`Generated: ${new Date().toISOString()}`);
  L.push('');
  L.push('## Executive Summary');
  L.push('');
  L.push(`- **Final Status:** ${cs.quality_outcome.final_status}`);
  L.push(`- **Delivery Outcome:** ${cs.modules.passed}/${cs.modules.total} modules passed, ${cs.gates.passed}/${cs.gates.total} gates passed`);
  const blockedLine = blockedOutcomeLine(moduleStats);
  if (blockedLine) L.push(blockedLine);
  L.push(`- **Wall Clock Time:** ${cs.delivery.wall_clock_hours > 0 ? cs.delivery.wall_clock_hours : DISPLAY_ABSENT}h`);
  L.push(`- **Agent Runtime:** ${pipeline.agentHours ? pipeline.agentHours + 'h' : '—'}`);
  L.push(`- **Test Surface:** ${cs.tests.unit_test_functions_total} total tests/checkable cases (${cs.tests.python_unit_tests} Python, ${cs.tests.frontend_unit_tests} frontend, ${cs.tests.api_test_cases} API)`);
  L.push(`- **Review Outcome:** ${cs.gates.critical_issues_found} critical and ${cs.gates.deferred_issues_found} deferred issues identified across ${reviewsRun} review cycle(s)`);
  L.push('');
  L.push('## Scope Delivered');
  L.push('');
  const groups = reportRecord(cs.scope.delivered_scope_groups, 'case_study.scope.delivered_scope_groups');
  const sectionMap = [
    ['Platform / Backend', reportArray(groups.platform_backend, 'scope.platform_backend')],
    ['Frontend / UI', reportArray(groups.frontend_ui, 'scope.frontend_ui')],
    ['Delivery / Ops', reportArray(groups.delivery_ops, 'scope.delivery_ops')],
    ['Data / Security', reportArray(groups.data_security, 'scope.data_security')],
    ['Other', reportArray(groups.other, 'scope.other')],
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
  L.push(`| Gates | ${cs.gates.total} (${passGateCount(gateStats)} passed) |`);
  L.push(`| Total Pipeline Attempts | ${pipeline.totalAttempts} |`);
  L.push(`| First-Pass Rate | ${pipeline.firstPassRate}% (${pipeline.passedFirstTry}/${pipeline.moduleCount}) |`);
  L.push(`| Avg Attempts per Module | ${pipeline.avgAttempts} |`);
  L.push(`| Wall Clock Time | ${pipeline.elapsedHours}h |`);
  L.push(`| Total Agent Time | ${formatDuration(cs.delivery.agent_runtime_hours * 3600)} |`);
  L.push(`| Started | ${cs.delivery.started_at.length > 0 ? cs.delivery.started_at.slice(0, 10) : DISPLAY_ABSENT} |`);
  L.push(`| Completed | ${cs.delivery.completed_at.length > 0 ? cs.delivery.completed_at.slice(0, 10) : DISPLAY_ABSENT} |`);
  L.push('');
  L.push('## Code');
  L.push('');
  L.push('| Metric | Value |');
  L.push('|---|---|');
  L.push(`| Total Code Lines | ${formatNum(displayCodeLines)} |`);
  L.push(`| Code Files | ${code.codeFiles} |`);
  L.push(`| Pipeline Artifact Files | ${cs.code.pipeline_config_files} |`);
  L.push(`| Commits | ${cs.code.commits} |`);
  L.push(`| Contributors | ${displayList(code.authors)} |`);
  L.push('');
  L.push('### Lines by Language (code only)');
  L.push('');
  L.push('| Language | Lines | Share |');
  L.push('|---|---|---|');
  for (const stats of languageRows(code)) {
    L.push(`| ${stats.name} | ${formatNum(stats.lines)} | ${stats.share_pct}% |`);
  }
  L.push('');
  L.push('## Quality Outcome');
  L.push('');
  L.push('| Metric | Value |');
  L.push('|---|---|');
  L.push(`| All Modules Passed | ${cs.quality_outcome.all_modules_passed ? 'Yes' : 'No'} |`);
  L.push(`| All Gates Passed | ${cs.quality_outcome.all_gates_passed ? 'Yes' : 'No'} |`);
  L.push(`| Reviews Run | ${reviewsRun} |`);
  L.push(`| Critical Issues Found | ${cs.gates.critical_issues_found} |`);
  L.push(`| Deferred Issues Found | ${cs.gates.deferred_issues_found} |`);
  L.push(`| Suite Runs | ${cs.tests.suite_runs} |`);
  L.push(`| Total Checks Executed | ${cs.tests.checks_executed} |`);
  L.push(`| Total Findings | ${cs.tests.findings_total} |`);
  L.push('');
  L.push('## Tests');
  L.push('');
  L.push('| Metric | Value |');
  L.push('|---|---|');
  L.push(`| Unit Tests (Python/pytest) | ${pythonTests} functions in ${pythonUnitFiles(unitCensus)} files |`);
  L.push(`| Unit Tests (Frontend/Vitest) | ${frontendTests} test blocks in ${frontendUnitFiles(unitCensus)} files |`);
  L.push(`| API Test Specs | ${apiTotalCases(apiCensus)} cases in ${apiTestSpecs.length} specs |`);
  L.push(`| Total Test Functions | ${totalTestSurface(unitCensus, apiCensus)} |`);
  L.push(`| Suite Runs (Buster pre-checks) | ${cs.tests.suite_runs} |`);
  L.push(`| Total Checks Executed | ${cs.tests.checks_executed} |`);
  L.push(`| Total Findings | ${cs.tests.findings_total} |`);
  L.push(`| Test Duration (cumulative) | ${formatDuration(reportNumber(tests.totalDuration, 'tests.totalDuration') / 1000)} |`);
  L.push('');
  if (Object.keys(suiteAgg).length) {
    L.push('### Suite Breakdown');
    L.push('');
    L.push('| Suite | Runs | Pass | Fail | Skip | Checks | Findings | Avg Duration |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const [suite, s] of Object.entries(suiteAgg)) {
      const runs = reportNumber(s.runs, `tests.suiteAgg.${suite}.runs`);
      const avg = runs > 0 ? Math.round(reportNumber(s.durationMs, `tests.suiteAgg.${suite}.durationMs`) / runs) : 0;
      L.push(`| ${suite} | ${s.runs} | ${s.pass} | ${s.fail} | ${s.skip} | ${s.checks} | ${s.findings} | ${avg}ms |`);
    }
    L.push('');
  }
  L.push('## Agent Invocations');
  L.push('');
  L.push('| Agent | Spawns |');
  L.push('|---|---|');
  L.push(`| Forge (code writer) | ${cs.agents.forge_spawns} |`);
  L.push(`| Buster (tester) | ${cs.agents.buster_spawns} |`);
  L.push(`| Echo (reviewer) | ${cs.agents.echo_spawns} |`);
  L.push(`| Gate Fixes | ${cs.agents.gate_fix_spawns} |`);
  L.push(`| **Total** | **${cs.agents.total_spawns}** |`);
  L.push('');
  L.push('## Complexity Highlights');
  L.push('');
  if (hardestModules.length) {
    L.push('| Module | Fails | Attempts | Status |');
    L.push('|---|---|---|---|');
    for (const m of hardestModules) {
      L.push(`| ${moduleDisplayName(m)} | ${moduleFailCount(m)} | ${reportNumber(m.attempts, 'pipeline.hardestModules.attempts')} | ${reportDisplay(m.status)} |`);
    }
    L.push('');
  }
  if (failPatterns.length) {
    L.push('### Top Failure Patterns');
    L.push('');
    L.push('| Pattern | Count |');
    L.push('|---|---|');
    for (const [pattern, count] of failPatterns) {
      L.push(`| ${pattern} | ${count} |`);
    }
    L.push('');
  }
  L.push('## Module Detail');
  L.push('');
  L.push('| # | Module | Status | Fails | Duration | Suites |');
  L.push('|---|---|---|---|---|---|');
  for (const m of moduleStats) {
    const suitesRecord = perModule.find(x => x.id === m.id);
    const suites = suitesRecord ? reportArray(suitesRecord.suites, 'tests.perModule.suites') : [];
    const dur = m.cost?.total_duration_seconds ? formatDuration(m.cost.total_duration_seconds) : '—';
    L.push(`| ${reportDisplay(m.id)} | ${reportDisplay(m.title)} | ${reportDisplay(m.status)} | ${moduleFailCount(m)} | ${dur} | ${displayList(suites)} |`);
  }
  L.push('');
  L.push('## Timeline');
  L.push('');
  L.push('| Module | Started | Completed | Duration |');
  L.push('|---|---|---|---|');
  for (const m of moduleStats) {
    const dur = m.cost?.total_duration_seconds ? formatDuration(m.cost.total_duration_seconds) : '—';
    L.push(`| ${reportDisplay(m.id)}. ${reportDisplay(m.title)} | ${reportDisplay(m.startedAt).replace('T', ' ').slice(0, 16)} | ${reportDisplay(m.completedAt).replace('T', ' ').slice(0, 16)} | ${dur} |`);
  }
  L.push('');
  L.push('---');
  L.push(`*Generated by project-summary.ts — KubeClaw Pipeline*`);
  return L.join('\n');
}

// ── Discord Embeds ──────────────────────────────────────────────

const DISCORD_FIELD_VALUE_LIMIT = 1024;

function truncateDiscordFieldValue(value) {
  const s = reportDisplay(value);
  if (s.length <= DISCORD_FIELD_VALUE_LIMIT) return s;
  return s.slice(0, DISCORD_FIELD_VALUE_LIMIT - 1) + '…';
}

function withDiscordSafeFields(embed) {
  return {
    ...embed,
    fields: reportArray(embed.fields, 'discord.embed.fields').map(field => ({
      ...field,
      value: truncateDiscordFieldValue(field.value),
    })),
  };
}

export function buildDiscordEmbeds(project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents) {
  ({ code, pipeline, tests, unitCensus, apiCensus, reviews, agents } = normalizeFormatterInput({ code, pipeline, tests, unitCensus, apiCensus, reviews, agents }));
  const gateStats = reportArray(pipeline.gateStats, 'pipeline.gateStats');
  const moduleStats = reportArray(pipeline.moduleStats, 'pipeline.moduleStats');
  const reviewCritical = reportNumber(reviews.totalCritical, 'reviews.totalCritical');
  const reviewDeferred = reportNumber(reviews.totalDeferred, 'reviews.totalDeferred');
  const langsText = Object.entries(reportRecord(code.byLang, 'code.byLang'))
    .filter(([l]) => !['JSON','Markdown','YAML','Other'].includes(l))
    .map(([l, v]) => [l, reportNumber(reportRecord(v, `code.byLang.${l}`).code, `code.byLang.${l}.code`)])
    .filter(([,v]) => v > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([l, n]) => `${l}: ${formatNum(n)}`).join(', ');
  const langs = langsText.length > 0 ? langsText : DISPLAY_ABSENT;

  const hardestText = reportArray(pipeline.hardestModules, 'pipeline.hardestModules').slice(0, 3)
    .map(m => `${m.id}. ${m.title} (${moduleFailCount(m)} fails)`)
    .join('\n');
  const hardest = hardestText.length > 0 ? hardestText : 'All passed first try!';

  const gateText = gateStats
    .map(g => `${PASS_STATUSES.has(g.status) ? 'PASS' : FAIL_STATUSES.has(g.status) ? 'FAIL' : 'PENDING'} ${g.title}`)
    .join('\n');
  const gateStr = gateText.length > 0 ? gateText : DISPLAY_ABSENT;

  const totalTests = totalTestSurface(unitCensus, apiCensus);
  const pythonTests = pythonUnitFunctions(unitCensus);
  const frontendTests = frontendUnitFunctions(unitCensus);
  const passedGates = passGateCount(gateStats);
  const scope = groupDeliveredScope(moduleStats.filter(m => m.status === 'PASS'));
  const scopeSummaryText = [
    ...reportArray(scope.platform_backend, 'scope.platform_backend').slice(0, 2),
    ...reportArray(scope.frontend_ui, 'scope.frontend_ui').slice(0, 2),
    ...reportArray(scope.delivery_ops, 'scope.delivery_ops').slice(0, 2),
  ].slice(0, 5).join('\n');
  const scopeSummary = scopeSummaryText.length > 0 ? scopeSummaryText : 'See project summary markdown';
  const quality = [
    `Modules: ${pipeline.totalCompleted}/${pipeline.moduleCount} passed`,
    `Gates: ${passedGates}/${pipeline.gateCount} passed`,
    `Reviews: ${reviewCritical} critical, ${reviewDeferred} deferred`,
    `Tests: ${totalTests} total surface`,
  ].join('\n');

  const operational = {
    title: `📊 Project Summary: ${project}`,
    color: pipeline.totalBlocked > 0 ? 15548997 : pipeline.totalPending > 0 ? 16776960 : 5763719,
    fields: [
      { name: '📦 Modules', value: `${pipeline.totalCompleted}/${pipeline.moduleCount}`, inline: true },
      { name: '🎯 First-Pass', value: `${pipeline.firstPassRate}%`, inline: true },
      { name: '🔄 Attempts', value: `${pipeline.totalAttempts}`, inline: true },
      { name: '📝 Code Lines', value: formatNum(reportNumber(code.codeLines, 'code.codeLines') > 0 ? reportNumber(code.codeLines, 'code.codeLines') : reportNumber(code.totalLines, 'code.totalLines')), inline: true },
      { name: '📁 Code Files', value: `${code.codeFiles}`, inline: true },
      { name: '🔀 Commits', value: `${reportNumber(code.commitCount, 'code.commitCount')}`, inline: true },
      { name: '🧪 Tests Written', value: `${totalTests} (${pythonTests} py + ${frontendTests} tsx + ${apiTotalCases(apiCensus)} api)`, inline: false },
      { name: '🤖 Agent Spawns', value: `${agents.total} (${agents.forge} Forge, ${agents.buster} Buster, ${agents.echo} Echo)`, inline: false },
      { name: '🔤 Languages', value: langs, inline: false },
      { name: '🏔️ Hardest', value: hardest, inline: false },
      { name: '🚦 Gates', value: gateStr, inline: false },
      ...(pipeline.elapsedHours ? [{ name: '⏱️ Duration', value: `${pipeline.elapsedHours}h wall clock`, inline: true }] : []),
      ...(reviewCritical > 0 ? [{ name: '🔍 Review Issues', value: `${reviewCritical} critical, ${reviewDeferred} deferred`, inline: true }] : []),
    ],
    footer: { text: `KubeClaw • ${new Date().toISOString().split('T')[0]}` },
  };

  const executive = {
    title: `🧾 Case Study Summary: ${project}`,
    color: (pipeline.totalCompleted === pipeline.moduleCount && passedGates === pipeline.gateCount) ? 5763719 : 16776960,
    fields: [
      { name: '✅ Final Status', value: (pipeline.totalCompleted === pipeline.moduleCount && passedGates === pipeline.gateCount) ? 'PASS / COMPLETE' : (reportNumber(pipeline.totalBlocked, 'pipeline.totalBlocked') > 0 ? 'BLOCKED' : 'INCOMPLETE'), inline: true },
      { name: '⏱️ Delivery', value: `${reportNumber(pipeline.elapsedHours, 'pipeline.elapsedHours') > 0 ? pipeline.elapsedHours : DISPLAY_ABSENT}h wall clock`, inline: true },
      { name: '🔄 Attempts', value: `${pipeline.totalAttempts}`, inline: true },
      { name: '📦 Scope', value: scopeSummary, inline: false },
      { name: '🧪 Quality Outcome', value: quality, inline: false },
      { name: '🤖 Agent Spawns', value: `${agents.total} total (${agents.forge} Forge, ${agents.buster} Buster, ${agents.echo} Echo)`, inline: false },
    ],
    footer: { text: `KubeClaw • ${new Date().toISOString().split('T')[0]}` },
  };

  return [operational, executive].map(withDiscordSafeFields);
}
