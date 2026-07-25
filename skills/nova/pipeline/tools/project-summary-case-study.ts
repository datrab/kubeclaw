import { apiTotalCases, failedGateCount, finalStatusLabel, groupDeliveredScope, hasPassedAllGates, languageRows, moduleDisplayName, moduleFailCount, normalizeFormatterInput, passGateCount, pythonUnitFunctions, frontendUnitFunctions, reportArray, reportNumber, reportString } from './project-summary-formatters-core.ts';

type SummaryContext = Record<string, any>;

function prepareCaseStudy(input: SummaryContext): SummaryContext {
  const normalized = normalizeFormatterInput(input);
  const pipeline = normalized.pipeline;
  const moduleStats = reportArray(pipeline.moduleStats, 'pipeline.moduleStats');
  const gateStats = reportArray(pipeline.gateStats, 'pipeline.gateStats');
  const delivered = moduleStats.filter((module: any) => module.status === 'PASS');
  const completed = reportNumber(pipeline.totalCompleted, 'pipeline.totalCompleted');
  const total = reportNumber(pipeline.moduleCount, 'pipeline.moduleCount');
  const blocked = reportNumber(pipeline.totalBlocked, 'pipeline.totalBlocked');
  return {
    ...input,
    ...normalized,
    moduleStats,
    gateStats,
    delivered,
    completed,
    total,
    blocked,
    allModulesPassed: completed === total,
    allGatesPassed: hasPassedAllGates(gateStats),
  };
}
function deliverySection(ctx: SummaryContext) {
  return {
    started_at: reportString(ctx.pipeline.earliestStart, 'pipeline.earliestStart'),
    completed_at: reportString(ctx.pipeline.latestComplete, 'pipeline.latestComplete'),
    wall_clock_hours: reportNumber(ctx.pipeline.elapsedHours, 'pipeline.elapsedHours'),
    agent_runtime_hours: reportNumber(ctx.pipeline.agentHours, 'pipeline.agentHours'),
  };
}

function moduleSection(ctx: SummaryContext) {
  return {
    total: ctx.total,
    passed: ctx.completed,
    blocked: ctx.blocked,
    pending: reportNumber(ctx.pipeline.totalPending, 'pipeline.totalPending'),
    first_pass_rate_pct: reportNumber(ctx.pipeline.firstPassRate, 'pipeline.firstPassRate'),
    avg_attempts_per_module: reportNumber(ctx.pipeline.avgAttempts, 'pipeline.avgAttempts'),
    total_attempts: reportNumber(ctx.pipeline.totalAttempts, 'pipeline.totalAttempts'),
  };
}

function gateSection(ctx: SummaryContext) {
  const reviews = reportArray(ctx.reviews.reviews, 'reviews.reviews');
  return {
    total: reportNumber(ctx.pipeline.gateCount, 'pipeline.gateCount'),
    passed: passGateCount(ctx.gateStats),
    failed: failedGateCount(ctx.gateStats),
    reviews_total: reviews.length,
    critical_issues_found: reportNumber(ctx.reviews.totalCritical, 'reviews.totalCritical'),
    deferred_issues_found: reportNumber(ctx.reviews.totalDeferred, 'reviews.totalDeferred'),
  };
}

function codeSection(ctx: SummaryContext) {
  return {
    total_lines: reportNumber(ctx.code.codeLines, 'code.codeLines'),
    code_files: reportNumber(ctx.code.codeFiles, 'code.codeFiles'),
    pipeline_config_files: reportNumber(ctx.code.swarmFiles, 'code.swarmFiles'),
    commits: reportNumber(ctx.code.commitCount, 'code.commitCount'),
    contributors: reportArray(ctx.code.authors, 'code.authors'),
    languages: languageRows(ctx.code),
  };
}

function testSection(ctx: SummaryContext) {
  const python = pythonUnitFunctions(ctx.unitCensus);
  const frontend = frontendUnitFunctions(ctx.unitCensus);
  const duration = ctx.tests.totalDurationSec !== undefined && ctx.tests.totalDurationSec !== null
    ? reportNumber(ctx.tests.totalDurationSec, 'tests.totalDurationSec')
    : reportNumber(ctx.tests.totalDuration, 'tests.totalDuration') / 1000;
  return {
    unit_test_functions_total: python + frontend + apiTotalCases(ctx.apiCensus),
    python_unit_tests: python,
    frontend_unit_tests: frontend,
    api_test_cases: apiTotalCases(ctx.apiCensus),
    suite_runs: reportNumber(ctx.tests.totalRuns, 'tests.totalRuns'),
    checks_executed: reportNumber(ctx.tests.totalChecks, 'tests.totalChecks'),
    findings_total: reportNumber(ctx.tests.totalFindings, 'tests.totalFindings'),
    duration_seconds: duration,
  };
}

function agentSection(ctx: SummaryContext) {
  return {
    forge_spawns: reportNumber(ctx.agents.forge, 'agents.forge'),
    buster_spawns: reportNumber(ctx.agents.buster, 'agents.buster'),
    echo_spawns: reportNumber(ctx.agents.echo, 'agents.echo'),
    gate_fix_spawns: reportNumber(ctx.agents.gateFix, 'agents.gateFix') + reportNumber(ctx.agents.reviewFix, 'agents.reviewFix'),
    total_spawns: reportNumber(ctx.agents.total, 'agents.total'),
  };
}

function highlightsSection(ctx: SummaryContext) {
  const hardest = reportArray(ctx.pipeline.hardestModules, 'pipeline.hardestModules').slice(0, 5);
  return {
    hardest_modules: hardest.map((module: any) => ({
      module: moduleDisplayName(module),
      fails: moduleFailCount(module),
      attempts: reportNumber(module.attempts, 'pipeline.hardestModules.attempts'),
      status: reportString(module.status, 'pipeline.hardestModules.status'),
    })),
    top_failure_patterns: reportArray(ctx.pipeline.failPatterns, 'pipeline.failPatterns')
      .map(([pattern, count]: any) => ({ pattern, count })),
  };
}

export function buildCaseStudyBase(input: SummaryContext) {
  const ctx = prepareCaseStudy(input);
  const finalStatus = finalStatusLabel({
    allModulesPassed: ctx.allModulesPassed,
    allGatesPassed: ctx.allGatesPassed,
    blockedCount: ctx.blocked,
  });
  return {
    project: {
      id: ctx.project,
      name: reportString(ctx.project, 'project'),
      generated_at: new Date().toISOString(),
      status: finalStatus === 'PASS' ? 'complete' : finalStatus.toLowerCase(),
    },
    delivery: deliverySection(ctx),
    modules: moduleSection(ctx),
    gates: gateSection(ctx),
    code: codeSection(ctx),
    tests: testSection(ctx),
    agents: agentSection(ctx),
    scope: {
      delivered_modules: ctx.delivered.map(moduleDisplayName).filter(Boolean),
      delivered_scope_groups: groupDeliveredScope(ctx.delivered),
    },
    highlights: highlightsSection(ctx),
    quality_outcome: {
      all_modules_passed: ctx.allModulesPassed,
      all_gates_passed: ctx.allGatesPassed,
      final_status: finalStatus,
    },
    timeline: ctx.moduleStats,
  };
}
