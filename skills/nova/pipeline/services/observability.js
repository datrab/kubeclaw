// services/observability.js — Artifact logging, usage/cost tracking, budget thresholds
// All operations are non-blocking: never throws, never delays pipeline execution.

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { getRunId } from '../core/runtime.js';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../../../common/pipeline/noncritical-reporting.js';
import { emitTelemetryStreamEvent } from './telemetry-stream.js';

const _structuredEventHealth = new Map();

function structuredEventHealthKey(config = {}) {
  return `${config?.project || 'unknown'}:${config?._runId || config?.run_id || getRunId(config) || 'unknown'}`;
}

async function markStructuredEventMirrorDegraded(config, eventType, err) {
  const key = structuredEventHealthKey(config);
  const prev = _structuredEventHealth.get(key);
  if (prev?.degraded) return;

  const startedAt = new Date().toISOString();
  _structuredEventHealth.set(key, {
    degraded: true,
    startedAt,
    reason: 'structured_event_append_failed',
  });

  await emitTelemetryStreamEvent(config, 'observability.degraded', {
    component: 'observability',
    surface: 'pipeline_jsonl',
    reason: 'structured_event_append_failed',
    detail: err?.message || 'structured event append failed',
    impacted_event_type: eventType || null,
    degraded_at: startedAt,
  }, {
    emitter: 'nova/pipeline/services/observability',
  });
}

async function emitStructuredEventMirrorRestoredIfNeeded(config) {
  const key = structuredEventHealthKey(config);
  const prev = _structuredEventHealth.get(key);
  if (!prev?.degraded) return;

  const restoredAt = new Date().toISOString();
  _structuredEventHealth.set(key, {
    degraded: false,
    restoredAt,
    reason: prev.reason || 'structured_event_append_failed',
  });

  await emitTelemetryStreamEvent(config, 'observability.restored', {
    component: 'observability',
    surface: 'pipeline_jsonl',
    reason: prev.reason || 'structured_event_append_failed',
    detail: 'structured event append restored',
    degraded_at: prev.startedAt || null,
    restored_at: restoredAt,
    restored_after_ms: prev.startedAt ? Math.max(0, Date.now() - new Date(prev.startedAt).getTime()) : null,
  }, {
    emitter: 'nova/pipeline/services/observability',
  });
}

// ── Structured event appending to pipeline.jsonl ─────────────────────────────

/**
 * Append a structured lifecycle event to pipeline.jsonl.
 * Distinct from log() entries: these are explicitly typed pipeline events
 * (event schema, not free-text log messages) for post-run inspection tools.
 */
export function appendStructuredEvent(config, eventType, payload = {}) {
  if (!config?._runLogDir && !config?._logDir) return { ok: true, skipped: true, event: null };
  try {
    const event = {
      v: 1,
      type: eventType,
      ts: new Date().toISOString(),
      run_id: getRunId(config),
      project: config.project || '',
      source: 'pipeline',
      emitter: 'nova/pipeline/services/observability',
      ...payload,
    };
    const targets = [];
    if (config?._logDir) targets.push(path.join(config._logDir, 'pipeline', 'pipeline.jsonl'));
    if (config?._runLogDir) targets.push(path.join(config._runLogDir, 'pipeline.jsonl'));
    for (const pipelineJsonl of targets) {
      fs.mkdirSync(path.dirname(pipelineJsonl), { recursive: true });
      fs.appendFileSync(pipelineJsonl, JSON.stringify(event) + '\n');
    }
    return { ok: true, skipped: false, event };
  } catch (e) {
    log('DEBUG', `[observability] appendStructuredEvent failed (non-critical): ${e.message}`);
    return { ok: false, skipped: false, error: e };
  }
}

export async function appendStructuredEventMirror(config, eventType, payload = {}) {
  const result = appendStructuredEvent(config, eventType, payload);
  if (result?.ok) {
    await emitStructuredEventMirrorRestoredIfNeeded(config);
    return true;
  }
  await markStructuredEventMirrorDegraded(config, eventType, result?.error);
  return false;
}

// ── Usage snapshot recording ──────────────────────────────────────────────────

/**
 * Record a usage/cost snapshot under .swarm/logs/cost/usage-snapshots.jsonl.
 * Each snapshot represents one agent session's contribution, scoped to module/gate.
 * Mark partial=true when the snapshot is known to be incomplete.
 *
 * @param {object} config
 * @param {object} opts
 * @param {string} opts.agentType - 'forge' | 'echo' | 'buster' | 'nova'
 * @param {string} [opts.moduleId]
 * @param {string} [opts.gateId]
 * @param {number} [opts.attempt]
 * @param {string} [opts.source] - where usage data came from, e.g. 'session_status' | 'transcript' | 'stub'
 * @param {number|null} [opts.inputTokens]
 * @param {number|null} [opts.outputTokens]
 * @param {number|null} [opts.estimatedCostUsd]
 * @param {boolean} [opts.partial] - true if snapshot is known to be incomplete
 * @param {string} [opts.sessionKey]
 */
export function recordUsageSnapshot(config, {
  agentType,
  moduleId,
  gateId,
  attempt,
  source,
  inputTokens,
  outputTokens,
  estimatedCostUsd,
  partial = false,
  sessionKey,
} = {}) {
  if (!config?._logDir) return;
  try {
    const snapshot = {
      ts: new Date().toISOString(),
      run_id: getRunId(config),
      agent_type: agentType,
      ...(moduleId && { module_id: moduleId }),
      ...(gateId && { gate_id: gateId }),
      ...(attempt != null && { attempt }),
      ...(sessionKey && { session_key: sessionKey }),
      source: source || 'unknown',
      input_tokens: inputTokens ?? null,
      output_tokens: outputTokens ?? null,
      estimated_cost_usd: estimatedCostUsd ?? null,
      partial,
    };
    const costDir = path.join(config._logDir, 'cost');
    fs.mkdirSync(costDir, { recursive: true });
    fs.appendFileSync(path.join(costDir, 'usage-snapshots.jsonl'), JSON.stringify(snapshot) + '\n');
  } catch (e) {
    log('DEBUG', `[observability] recordUsageSnapshot failed (non-critical): ${e.message}`);
  }
}

// ── Usage aggregation ─────────────────────────────────────────────────────────

const EMPTY_USAGE = () => ({
  run: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: null, partial: false },
  by_module: {},
  by_gate: {},
  by_agent: {},
});

function computePercentUsed(current, limit) {
  if (current == null || limit == null || !Number.isFinite(Number(current)) || !Number.isFinite(Number(limit)) || Number(limit) === 0) {
    return null;
  }
  return Math.round((Number(current) / Number(limit)) * 1000) / 10;
}

function addToSlice(slice, inp, out, cost, partial) {
  slice.input_tokens += inp;
  slice.output_tokens += out;
  if (cost !== null) {
    slice.estimated_cost_usd = (slice.estimated_cost_usd ?? 0) + cost;
  }
  if (partial) slice.partial = true;
}

/**
 * Aggregate usage snapshots into run/module/gate/agent buckets.
 * Returns an empty aggregate if no snapshots exist — never throws.
 */
export function aggregateUsage(config) {
  const snapshotsPath = config?._logDir
    ? path.join(config._logDir, 'cost', 'usage-snapshots.jsonl')
    : null;

  if (!snapshotsPath || !fs.existsSync(snapshotsPath)) return EMPTY_USAGE();

  try {
    const raw = fs.readFileSync(snapshotsPath, 'utf8').trim();
    if (!raw) return EMPTY_USAGE();
    const snapshots = raw.split('\n').filter(Boolean).map(l => JSON.parse(l));

    const result = EMPTY_USAGE();

    for (const s of snapshots) {
      const inp = s.input_tokens ?? 0;
      const out = s.output_tokens ?? 0;
      const cost = s.estimated_cost_usd ?? null;
      const partial = !!s.partial;

      addToSlice(result.run, inp, out, cost, partial);

      if (s.module_id) {
        if (!result.by_module[s.module_id]) {
          result.by_module[s.module_id] = { input_tokens: 0, output_tokens: 0, estimated_cost_usd: null, partial: false };
        }
        addToSlice(result.by_module[s.module_id], inp, out, cost, partial);
      }

      if (s.gate_id) {
        if (!result.by_gate[s.gate_id]) {
          result.by_gate[s.gate_id] = { input_tokens: 0, output_tokens: 0, estimated_cost_usd: null, partial: false };
        }
        addToSlice(result.by_gate[s.gate_id], inp, out, cost, partial);
      }

      if (s.agent_type) {
        if (!result.by_agent[s.agent_type]) {
          result.by_agent[s.agent_type] = { input_tokens: 0, output_tokens: 0, estimated_cost_usd: null, partial: false };
        }
        addToSlice(result.by_agent[s.agent_type], inp, out, cost, partial);
      }
    }

    return result;
  } catch (e) {
    log('DEBUG', `[observability] aggregateUsage failed (non-critical): ${e.message}`);
    return EMPTY_USAGE();
  }
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
export function checkBudgetThresholds(usage, thresholds = {}) {
  const warnings = [];
  const totalCost = usage?.run?.estimated_cost_usd ?? null;
  const totalTokens = (usage?.run?.input_tokens ?? 0) + (usage?.run?.output_tokens ?? 0);

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
 * Non-blocking: returns false on any error.
 */
export function isBudgetExceeded(config) {
  try {
    const usage = aggregateUsage(config);
    const thresholds = config?.observability?.budget || {};
    const warnings = checkBudgetThresholds(usage, thresholds);
    return warnings.some(w => w.type === 'budget.exceeded');
  } catch (error) {
    reportClassifiedNonBlockingError({
      log,
      reporter: 'observability',
      classification: 'budget_limit_check_failed',
      incidentKey: buildNonBlockingIncidentKey('observability', config?.project || 'unknown', getRunId(config) || config?.run_id || config?._runId || 'unknown', 'budget_limit_check_failed'),
      message: 'budget limit check failed; treating the limit as not exceeded',
      error,
      level: 'DEBUG',
    });
    return false;
  }
}

/**
 * Append budget warning/exceeded events to cost/budget-events.jsonl and emit WARN logs.
 * Non-blocking.
 */
export function emitBudgetWarnings(config, warnings = []) {
  if (!config?._logDir || !warnings.length) return;
  try {
    const costDir = path.join(config._logDir, 'cost');
    fs.mkdirSync(costDir, { recursive: true });
    for (const w of warnings) {
      fs.appendFileSync(
        path.join(costDir, 'budget-events.jsonl'),
        JSON.stringify({ ts: new Date().toISOString(), run_id: getRunId(config), ...w }) + '\n',
      );
      log('WARN', `[budget] ${w.message}`);
    }
  } catch (e) {
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
export function writeCostReport(config) {
  if (!config?._logDir) return null;
  try {
    const usage = aggregateUsage(config);
    const thresholds = config?.observability?.budget || {};
    const warnings = checkBudgetThresholds(usage, thresholds);

    let availabilityStatus;
    let availabilityNote;
    if (usage.run.estimated_cost_usd !== null && !usage.run.partial) {
      availabilityStatus = 'full';
      availabilityNote = 'Complete cost and token data available.';
    } else if (usage.run.estimated_cost_usd !== null && usage.run.partial) {
      availabilityStatus = 'partial';
      availabilityNote = 'Some usage snapshots marked partial — totals may be incomplete.';
    } else if (usage.run.input_tokens > 0 || usage.run.output_tokens > 0) {
      availabilityStatus = 'tokens_only';
      availabilityNote = 'Dollar cost unavailable for this provider/auth mode. Token counts recorded.';
    } else {
      availabilityStatus = 'unavailable';
      availabilityNote = 'No usage data captured. Provider may not expose token/cost information.';
    }

    const report = {
      generated_at: new Date().toISOString(),
      run_id: getRunId(config),
      project: config.project || '',
      usage,
      warnings,
      availability: {
        status: availabilityStatus,
        note: availabilityNote,
      },
    };

    const costDir = path.join(config._logDir, 'cost');
    fs.mkdirSync(costDir, { recursive: true });
    fs.writeFileSync(path.join(costDir, 'cost-report.json'), JSON.stringify(report, null, 2));

    const modulesStr = Object.keys(usage.by_module).length;
    const gatesStr = Object.keys(usage.by_gate).length;
    const costStr = usage.run.estimated_cost_usd !== null
      ? `, $${usage.run.estimated_cost_usd.toFixed(4)} total`
      : ', cost unavailable';
    log('OK', `Cost report written: ${modulesStr} module(s), ${gatesStr} gate(s)${costStr}`);
    return report;
  } catch (e) {
    log('WARN', `[observability] writeCostReport failed (non-critical): ${e.message}`);
    return null;
  }
}
