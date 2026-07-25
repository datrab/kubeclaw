import fs from 'fs';
import path from 'path';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { sanitizeJsonEgress, sanitizeMarkdownText } from '../egress.ts';
import { addDiagnostic, discoverLatestLifecycleReadModels, extToLang, readJsonData, readJsonRecord } from './project-summary-lifecycle.ts';
import { normalizeLifecycleStatus } from '../lifecycle-state.ts';
import { buildCaseStudyBase, buildDiscordEmbeds, buildMarkdown, pct } from './project-summary-formatters.ts';
import * as Core from './project-summary-core.ts';
const { firstDefined, recordOrEmpty, arrayOrEmpty, entriesOf, keysOf, countMatches, numberOrZero, integerTextOrZero, firstNonEmptyLine, requiredNonEmptyConfigString, optionalEnvString, envFlag, projectSummaryDiscordMuted, resolveRepoDir, git, gitText, validateProjectSelector, resolveProjectPaths } = Core;
type PipelineTotals = {
  totalAttempts: number; totalDuration: number;
  totalForgeIn: number; totalForgeOut: number; totalBusterIn: number; totalBusterOut: number;
  passedFirstTry: number; totalCompleted: number; totalBlocked: number; totalPending: number;
  earliestStart: Date | null; latestComplete: Date | null;
};

function initialPipelineTotals(): PipelineTotals {
  return {
    totalAttempts: 0, totalDuration: 0,
    totalForgeIn: 0, totalForgeOut: 0, totalBusterIn: 0, totalBusterOut: 0,
    passedFirstTry: 0, totalCompleted: 0, totalBlocked: 0, totalPending: 0,
    earliestStart: null, latestComplete: null,
  };
}

function buildModuleStat(id: string, moduleConfig: any, lifecycleModule: any) {
  const status = normalizeLifecycleStatus(recordOrEmpty(lifecycleModule));
  const failCount = numberOrZero(status.fail_count);
  const currentAttempt = numberOrZero(status.current_attempt);
  const cost = recordOrEmpty(status.cost);
  return {
    id, title: moduleConfig.title, dir: moduleConfig.dir,
    scope_group: selectDefinedValue(() => moduleConfig.scope_group, () => null),
    status: selectDefinedValue(() => status.status, () => 'PENDING'),
    failCount,
    attempts: currentAttempt > 0 ? currentAttempt : failCount + (status.status === 'PASS' ? 1 : 0),
    startedAt: selectDefinedValue(() => status.started_at, () => status.attempt_started_at, () => null),
    completedAt: selectDefinedValue(() => status.completed_at, () => null),
    blockedPhase: selectDefinedValue(() => status.blockedPhase, () => status.blocked_phase, () => null),
    blockedReason: selectDefinedValue(() => status.reason, () => status.completion_summary, () => null),
    completionSummary: selectDefinedValue(() => status.completion_summary, () => null),
    failSummaries: arrayOrEmpty(status.fail_summaries),
    forgeDiffStat: selectDefinedValue(() => status.forge_diff_stat, () => null),
    historyEntries: arrayOrEmpty(status.history).length,
    cost,
  };
}

function updatePipelineTotals(totals: PipelineTotals, stat: any): void {
  if (stat.status === 'PASS') {
    totals.totalCompleted++;
    if (stat.failCount === 0) totals.passedFirstTry++;
  } else if (stat.status === 'BLOCKED') totals.totalBlocked++;
  else totals.totalPending++;
  totals.totalAttempts += stat.attempts;
  totals.totalDuration += numberOrZero(stat.cost.total_duration_seconds);
  totals.totalForgeIn += numberOrZero(stat.cost.forge_tokens_in);
  totals.totalForgeOut += numberOrZero(stat.cost.forge_tokens_out);
  totals.totalBusterIn += numberOrZero(stat.cost.buster_tokens_in);
  totals.totalBusterOut += numberOrZero(stat.cost.buster_tokens_out);
  if (stat.startedAt) {
    const started = new Date(stat.startedAt);
    if (totals.earliestStart === null || started < totals.earliestStart) totals.earliestStart = started;
  }
  if (stat.completedAt) {
    const completed = new Date(stat.completedAt);
    if (totals.latestComplete === null || completed > totals.latestComplete) totals.latestComplete = completed;
  }
}

function collectFailurePatterns(moduleStats: any[]) {
  const patterns: Record<string, number> = {};
  for (const module of moduleStats) {
    for (const failure of module.failSummaries) {
      const summary = typeof failure?.summary === 'string' && failure.summary.trim()
        ? failure.summary : 'failure_summary_missing';
      const pattern = summary.slice(0, 80).replace(/Module \d+[a-z]?:?\s*/i, '').trim();
      patterns[pattern] = numberOrZero(patterns[pattern]) + 1;
    }
  }
  return Object.entries(patterns).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5);
}

function collectGateStats(gates: any, lifecycleGates: any, swarmRoot: string, diagnostics: any) {
  return entriesOf(gates).map(([gateId, gate]) => {
    const lifecycleGate = normalizeLifecycleStatus(recordOrEmpty(lifecycleGates[gateId]));
    const outputPath = gate.output_file ? path.join(swarmRoot, gate.output_file) : null;
    const result = outputPath ? readJsonData(outputPath, diagnostics) : null;
    return {
      id: gateId, type: gate.type, title: gate.title,
      status: selectDefinedValue(() => lifecycleGate.status, () => result?.status, () => result?.verdict, () => 'PENDING'),
      note: selectDefinedValue(() => lifecycleGate.note, () => lifecycleGate.reason, () => result?.note, () => result?.summary, () => null),
      startedAt: selectDefinedValue(() => lifecycleGate.started_at, () => null),
      completedAt: selectDefinedValue(() => lifecycleGate.completed_at, () => null),
      outputPath,
    };
  });
}

export function collectPipelineStats(progress: any, swarmRoot: any, diagnostics: any = null) {
  const modules = recordOrEmpty(progress.modules);
  const gates = recordOrEmpty(progress.gates);
  const lifecycle = discoverLatestLifecycleReadModels(swarmRoot, readJsonData, diagnostics);
  const lifecycleModules = recordOrEmpty(lifecycle.data?.modules);
  const lifecycleGates = recordOrEmpty(lifecycle.data?.gates);
  const totals = initialPipelineTotals();
  const moduleStats = entriesOf(modules).map(([id, moduleConfig]) => {
    const stat = buildModuleStat(id, recordOrEmpty(moduleConfig), lifecycleModules[id]);
    updatePipelineTotals(totals, stat);
    return stat;
  });
  const gateStats = collectGateStats(gates, lifecycleGates, swarmRoot, diagnostics);
  const elapsedHours = totals.earliestStart && totals.latestComplete
    ? Math.round((totals.latestComplete.getTime() - totals.earliestStart.getTime()) / 360000) / 10
    : null;
  return {
    lifecycleSource: lifecycle.source, lifecycleReadModelsPath: lifecycle.path,
    moduleCount: keysOf(modules).length, gateCount: keysOf(gates).length,
    totalCompleted: totals.totalCompleted, totalBlocked: totals.totalBlocked, totalPending: totals.totalPending,
    totalAttempts: totals.totalAttempts, passedFirstTry: totals.passedFirstTry,
    firstPassRate: pct(totals.passedFirstTry, totals.totalCompleted),
    avgAttempts: totals.totalCompleted > 0 ? Math.round((totals.totalAttempts / totals.totalCompleted) * 10) / 10 : 0,
    totalDuration: totals.totalDuration, elapsedHours,
    earliestStart: totals.earliestStart?.toISOString() ?? null,
    latestComplete: totals.latestComplete?.toISOString() ?? null,
    tokens: {
      forgeIn: totals.totalForgeIn, forgeOut: totals.totalForgeOut,
      busterIn: totals.totalBusterIn, busterOut: totals.totalBusterOut,
      total: totals.totalForgeIn + totals.totalForgeOut + totals.totalBusterIn + totals.totalBusterOut,
    },
    hardestModules: [...moduleStats].filter((module: any) => module.failCount > 0)
      .sort((a: any, b: any) => b.failCount - a.failCount).slice(0, 5),
    failPatterns: collectFailurePatterns(moduleStats),
    gateStats, moduleStats,
  };
}

// ── 5. Test Suite Results (runner-verdict.json) ─────────────────

export function collectTestResults(swarmRoot: any, modules: any, diagnostics: any = null) {
  const suiteAgg: any = {};  // suite name → { runs, pass, fail, skip, error, checks, checksPassed, findings, durationMs }
  let totalRuns = 0, totalChecks = 0, totalChecksPassed = 0, totalFindings = 0, totalDuration = 0;
  const perModule: any[] = [];

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

export function collectReviewStats(swarmRoot: any, diagnostics: any = null) {
  const reviewDir = path.join(swarmRoot, 'echo-review');
  if (!fs.existsSync(reviewDir)) return { reviews: [], totalCritical: 0, totalDeferred: 0 };

  const reviews: any[] = [];
  let totalCritical = 0, totalDeferred = 0;

  for (const file of fs.readdirSync(reviewDir)) {
    if (isSummaryReviewFile(file)) {
      collectSummaryReview(reviewDir, file, diagnostics, reviews);
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

function isSummaryReviewFile(file: string): boolean {
  return !file.endsWith('.json') || ['EARLY-REVIEW.json', 'MIDPOINT-REVIEW.json', 'FINAL-REVIEW.json'].includes(file);
}

function collectSummaryReview(reviewDir: string, file: string, diagnostics: any, reviews: any[]): void {
  if (!file.endsWith('-REVIEW.json') || file.startsWith('echo-')) return;
  const data = readJsonData(path.join(reviewDir, file), diagnostics);
  if (data?.status) reviews.push({ file, type: 'summary', status: data.status, note: selectDefinedValue(() => (data.note), () => (null)) });
}

// ── 7. Agent Invocations (structured telemetry) ─────────────────
