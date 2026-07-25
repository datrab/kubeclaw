import { formatDuration, formatNum, pct, DISPLAY_ABSENT, PASS_STATUSES, FAIL_STATUSES, reportRecord, reportArray, reportNumber, reportString, reportDisplay, displayList, passGateCount, failedGateCount, finalStatusLabel, blockedOutcomeLine, hasPassedAllGates, normalizeFormatterInput, pythonUnitFunctions, frontendUnitFunctions, pythonUnitFiles, frontendUnitFiles, apiSpecs, apiTotalCases, totalTestSurface, moduleFailCount, moduleDisplayName, groupDeliveredScope, languageRows } from './project-summary-formatters-core.ts';
import { buildCaseStudyBase } from './project-summary-case-study.ts';

function appendExecutive(ctx: any) {
  const { L, project, cs, moduleStats, pipeline, reviewsRun } = ctx;
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
}
function appendScope(ctx: any) {
  const { L, cs } = ctx;
  L.push('## Scope Delivered');
  L.push('');
  const groups = reportRecord(cs.scope.delivered_scope_groups, 'case_study.scope.delivered_scope_groups');
  const sectionMap: Array<[string, any[]]> = [
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
}

function appendDelivery(ctx: any) {
  const { L, pipeline, cs, gateStats } = ctx;
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
}

function appendCode(ctx: any) {
  const { L, code, cs, displayCodeLines } = ctx;
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
}

function appendQuality(ctx: any) {
  const { L, cs, reviewsRun } = ctx;
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
}

function appendTests(ctx: any) {
  const { L, pythonTests, unitCensus, frontendTests, apiCensus, apiTestSpecs, cs, tests, suiteAgg } = ctx;
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
    for (const [suite, value] of Object.entries(suiteAgg)) {
      const stats = reportRecord(value, `tests.suiteAgg.${suite}`);
      const runs = reportNumber(stats.runs, `tests.suiteAgg.${suite}.runs`);
      const avg = runs > 0 ? Math.round(reportNumber(stats.durationMs, `tests.suiteAgg.${suite}.durationMs`) / runs) : 0;
      L.push(`| ${suite} | ${stats.runs} | ${stats.pass} | ${stats.fail} | ${stats.skip} | ${stats.checks} | ${stats.findings} | ${avg}ms |`);
    }
    L.push('');
  }
}

function appendAgents(ctx: any) {
  const { L, cs } = ctx;
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
}

function appendComplexity(ctx: any) {
  const { L, hardestModules, failPatterns } = ctx;
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
}

function appendModuleDetails(ctx: any) {
  const { L, moduleStats, perModule } = ctx;
  L.push('## Module Detail');
  L.push('');
  L.push('| # | Module | Status | Fails | Duration | Suites |');
  L.push('|---|---|---|---|---|---|');
  for (const m of moduleStats) {
    const suitesRecord = perModule.find((x: any) => x.id === m.id);
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
}

export function buildMarkdown({ project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents }: any) {
  ({ code, pipeline, tests, unitCensus, apiCensus, reviews, agents } = normalizeFormatterInput({ code, pipeline, tests, unitCensus, apiCensus, reviews, agents }));
  const ctx = {
    project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents,
    cs: buildCaseStudyBase({ project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents }),
    pythonTests: pythonUnitFunctions(unitCensus),
    frontendTests: frontendUnitFunctions(unitCensus),
    apiTestSpecs: apiSpecs(apiCensus),
    gateStats: reportArray(pipeline.gateStats, 'pipeline.gateStats'),
    moduleStats: reportArray(pipeline.moduleStats, 'pipeline.moduleStats'),
    reviewsRun: reportArray(reviews.reviews, 'reviews.reviews').length,
    suiteAgg: reportRecord(tests.suiteAgg, 'tests.suiteAgg'),
    hardestModules: reportArray(pipeline.hardestModules, 'pipeline.hardestModules'),
    failPatterns: reportArray(pipeline.failPatterns, 'pipeline.failPatterns'),
    perModule: reportArray(tests.perModule, 'tests.perModule'),
    displayCodeLines: reportNumber(code.codeLines, 'code.codeLines') > 0
      ? reportNumber(code.codeLines, 'code.codeLines')
      : reportNumber(code.totalLines, 'code.totalLines'),
    L: [] as any[],
  };
  appendExecutive(ctx);
  appendScope(ctx);
  appendDelivery(ctx);
  appendCode(ctx);
  appendQuality(ctx);
  appendTests(ctx);
  appendAgents(ctx);
  appendComplexity(ctx);
  appendModuleDetails(ctx);
  return ctx.L.join('\n');
}
