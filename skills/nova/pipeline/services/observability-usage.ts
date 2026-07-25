import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { costLogDir } from '../core/paths.ts';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../noncritical-reporting.ts';
import { buildRunFacts } from './run-facts.ts';
import { objectRecord, selectPresentValue } from '../value-boundary.ts';
import { observabilityRunId } from './observability-identity.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

const USAGE_COUNT_MISSING = 0;
const ESTIMATED_COST_MISSING = null;
const OBSERVABILITY_PROJECT_MISSING = 'missing_project';
const numericCount = (value: any) => Number.isFinite(Number(value)) ? Number(value) : USAGE_COUNT_MISSING;
const budgetThresholdConfig = (config: any) => objectRecord(config?.observability?.budget);

const EMPTY_USAGE = (): any => ({
  run: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: null, partial: false },
  by_module: {},
  by_gate: {},
  by_agent: {},
});

function computePercentUsed(current: any, limit: any) {
  if (current == null || limit == null || !Number.isFinite(Number(current)) || !Number.isFinite(Number(limit)) || Number(limit) === 0) return null;
  return Math.round((Number(current) / Number(limit)) * 1000) / 10;
}

function addToSlice(slice: any, inp: any, out: any, cost: any, partial: any) {
  slice.input_tokens += inp;
  slice.output_tokens += out;
  if (cost !== null) {
    slice.estimated_cost_usd = numericCount(slice.estimated_cost_usd) + cost;
  }
  if (partial) slice.partial = true;
}

function usageSlice(result: any, bucket: 'by_module' | 'by_gate' | 'by_agent', key: any) {
  if (!key) return null;
  result[bucket][key] ??= { input_tokens: 0, output_tokens: 0, estimated_cost_usd: null, partial: false };
  return result[bucket][key];
}

function applyUsageSnapshot(result: any, snapshot: any) {
  const values = [numericCount(snapshot.input_tokens), numericCount(snapshot.output_tokens),
    snapshot.estimated_cost_usd ?? ESTIMATED_COST_MISSING, Boolean(snapshot.partial)] as const;
  addToSlice(result.run, ...values);
  for (const [bucket, key] of [['by_module', snapshot.module_id], ['by_gate', snapshot.gate_id], ['by_agent', snapshot.agent_type]] as const) {
    const slice = usageSlice(result, bucket, key);
    if (slice) addToSlice(slice, ...values);
  }
}

function parseUsageSnapshot(line: string, index: number, result: any, strict: boolean) {
  try {
    return JSON.parse(line);
  } catch (error: any) {
    if (strict) throw error;
    result.run.partial = true;
    result.corrupt = true;
    log('DEBUG', `[observability] aggregateUsage skipped corrupt snapshot line ${index + 1} (non-critical): ${error.message}`);
    return null;
  }
}

function isDuplicateUsageSnapshot(snapshot: any, seen: Set<string>): boolean {
  if (!snapshot.event_id) return false;
  if (seen.has(snapshot.event_id)) return true;
  seen.add(snapshot.event_id);
  return false;
}

/**
 * Aggregate usage snapshots into run/module/gate/agent buckets.
 * Returns an empty aggregate if no snapshots exist — never throws unless strict is set.
 */
export function aggregateUsage(config: any, options: any = {}) {
  const logDir = costLogDir(config), snapshotsPath = logDir ? path.join(logDir, 'usage-snapshots.jsonl') : null;
  if (!snapshotsPath) return EMPTY_USAGE();
  if (!fs.existsSync(snapshotsPath)) return EMPTY_USAGE();

  try {
    const raw = fs.readFileSync(snapshotsPath, 'utf8').trim();
    if (!raw) return EMPTY_USAGE();

    const result = EMPTY_USAGE();
    const seenEventIds = new Set<string>();

    for (const [index, line] of raw.split('\n').entries()) {
      if (!line) continue;

      const s = parseUsageSnapshot(line, index, result, options.strict === true);
      if (!s) continue;

      if (isDuplicateUsageSnapshot(s, seenEventIds)) continue;

      applyUsageSnapshot(result, s);
    }

    return result;
  } catch (e: any) {
    if (options.strict) throw e;
    log('DEBUG', `[observability] aggregateUsage failed (non-critical): ${e.message}`);
    return EMPTY_USAGE();
  }
}

function usageAvailability(usage: any) {
  if (usage.run.estimated_cost_usd !== null) return usage.run.partial
    ? { status: 'partial', note: 'Some usage snapshots marked partial — totals may be incomplete.' }
    : { status: 'full', note: 'Complete cost and token data available.' };
  if (usage.run.input_tokens > 0 || usage.run.output_tokens > 0) {
    return { status: 'tokens_only', note: 'Dollar cost unavailable for this provider/auth mode. Token counts recorded.' };
  }
  return { status: 'unavailable', note: 'No usage data captured. Provider may not expose token/cost information.' };
}

// ── Budget threshold checking ─────────────────────────────────────────────────

/**
 * Check current usage against configured thresholds.
 * Returns an array of warning objects — empty if nothing is crossed.
 * Never throws.
 *
 * Supported threshold keys (under config.observability.budget or passed directly):
 *   warn_cost_usd       — emit budget.warning when estimated cost >= this
 *   hard_limit_cost_usd — emit budget.exceeded when estimated cost >= this
 *   warn_tokens         — emit budget.warning when total tokens >= this
 *
 * @param {object} usage - result of aggregateUsage()
 * @param {object} [thresholds] - { warn_cost_usd, hard_limit_cost_usd, warn_tokens }
 * @returns {Array<{type, threshold, current, limit, unit, current_cost_usd, budget_usd, percent_used, message}>}
 */
export function checkBudgetThresholds(usage: any, thresholds: any = {}) {
  const warnings: any[] = [];
  const totalCost = selectDefinedValue(() => (usage?.run?.estimated_cost_usd), () => (null));
  const totalTokens = (usage?.run?.input_tokens) + (usage?.run?.output_tokens);

  if (thresholds.warn_cost_usd != null && totalCost !== null && totalCost >= thresholds.warn_cost_usd) {
    warnings.push({
      type: 'budget.warning',
      threshold: 'warn_cost_usd',
      current: totalCost,
      limit: thresholds.warn_cost_usd,
      unit: 'usd',
      current_cost_usd: totalCost,
      budget_usd: thresholds.warn_cost_usd,
      percent_used: computePercentUsed(totalCost, thresholds.warn_cost_usd),
      message: `Cost $${totalCost.toFixed(4)} exceeds warning threshold $${thresholds.warn_cost_usd}`,
    });
  }

  if (thresholds.hard_limit_cost_usd != null && totalCost !== null && totalCost >= thresholds.hard_limit_cost_usd) {
    warnings.push({
      type: 'budget.exceeded',
      threshold: 'hard_limit_cost_usd',
      current: totalCost,
      limit: thresholds.hard_limit_cost_usd,
      unit: 'usd',
      current_cost_usd: totalCost,
      budget_usd: thresholds.hard_limit_cost_usd,
      percent_used: computePercentUsed(totalCost, thresholds.hard_limit_cost_usd),
      message: `Cost $${totalCost.toFixed(4)} exceeds hard limit $${thresholds.hard_limit_cost_usd}`,
    });
  }

  if (thresholds.warn_tokens != null && totalTokens >= thresholds.warn_tokens) {
    warnings.push({
      type: 'budget.warning',
      threshold: 'warn_tokens',
      current: totalTokens,
      limit: thresholds.warn_tokens,
      unit: 'tokens',
      current_cost_usd: null,
      budget_usd: null,
      percent_used: computePercentUsed(totalTokens, thresholds.warn_tokens),
      message: `Token count ${totalTokens} exceeds warning threshold ${thresholds.warn_tokens}`,
    });
  }

  return warnings;
}

/**
 * Returns true if a hard budget limit has been crossed.
 * Fail-closed: budget evidence read/check errors are treated as exceeded so
 * operators must inspect the typed incident before continuing.
 */
export function isBudgetExceeded(config: any) {
  try {
    const usage = aggregateUsage(config, { strict: true });
    const thresholds = budgetThresholdConfig(config);
    const warnings = checkBudgetThresholds(usage, thresholds);
    return warnings.some((w: any) => w.type === 'budget.exceeded');
  } catch (error: any) {
    reportClassifiedNonBlockingError({
      log,
      reporter: 'observability',
      classification: 'budget_limit_check_failed',
      incidentKey: buildNonBlockingIncidentKey('observability', selectDefinedValue(() => (config?.project), () => ('missing_project')), selectDefinedValue(() => (observabilityRunId(config)), () => ('missing_run_id')), 'budget_limit_check_failed'),
      message: 'budget limit check failed; treating hard budget state as exceeded pending operator review',
      error,
      level: 'DEBUG',
    });
    return true;
  }
}

/**
 * Append budget warning/exceeded events to cost/budget-events.jsonl and emit WARN logs.
 * Non-blocking.
 */
export function emitBudgetWarnings(config: any, warnings: any[] = []) {
  const logDir = costLogDir(config);
  if (!logDir) return;
  if (selectTruthyValue(() => (!Array.isArray(warnings)), () => (warnings.length === 0))) return;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    for (const w of warnings) {
      fs.appendFileSync(
        path.join(logDir, 'budget-events.jsonl'),
        JSON.stringify({ ts: new Date().toISOString(), run_id: observabilityRunId(config), ...w }) + '\n',
      );
      log('WARN', `[budget] ${w.message}`);
    }
  } catch (e: any) {
    log('DEBUG', `[observability] emitBudgetWarnings failed (non-critical): ${e.message}`);
  }
}

// ── Operator-facing cost report ───────────────────────────────────────────────

/**
 * Write a machine-readable cost report to .swarm/logs/cost/cost-report.json.
 * Includes aggregated usage, threshold warnings, and a data-availability note.
 * Non-blocking: logs WARN on failure, returns null.
 *
 * @returns {object|null} the report object, or null on failure
 */
export function writeCostReport(config: any, options: any = {}) {
  const logDir = costLogDir(config); if (!logDir) return null;
  try {
    const usage = aggregateUsage(config);
    const runFacts = buildRunFacts(config, options.progress);
    const thresholds = budgetThresholdConfig(config);
    const warnings = checkBudgetThresholds(usage, thresholds);

    const report = {
      generated_at: new Date().toISOString(),
      run_id: observabilityRunId(config),
      project: selectPresentValue(config.project, OBSERVABILITY_PROJECT_MISSING),
      run_facts: runFacts,
      usage,
      warnings,
      availability: usageAvailability(usage),
    };

    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'cost-report.json'), JSON.stringify(report, null, 2));

    const modulesStr = Number.isFinite(Number(runFacts?.modules?.total)) ? Number(runFacts.modules.total) : Object.keys(usage.by_module).length;
    const gatesStr = Number.isFinite(Number(runFacts?.gates?.total)) ? Number(runFacts.gates.total) : Object.keys(usage.by_gate).length;
    const costStr = usage.run.estimated_cost_usd !== null
      ? `, $${usage.run.estimated_cost_usd.toFixed(4)} total`
      : ', cost unavailable';
    log('OK', `Cost report written: ${modulesStr} module(s), ${gatesStr} gate(s)${costStr}`);
    return report;
  } catch (e: any) {
    log('WARN', `[observability] writeCostReport failed (non-critical): ${e.message}`);
    return null;
  }
}
