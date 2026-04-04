// services/cost.js — Usage aggregation, cost artifacts, and budget threshold policy
//
// Design principles:
// - Non-blocking: all writes and gateway calls degrade safely on failure
// - Honest reporting: unavailable cost data is marked as such, never fabricated
// - Operator-readable artifacts under .swarm/logs/cost/
// - Budget thresholds emit observable events; hard-stop only if policy says so

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { costLogDir } from '../core/paths.js';
import { getRunId, getRunStats } from '../core/runtime.js';
import { onBudgetWarning, onBudgetExceeded, emitCostUpdate } from './telemetry.js';

// ── Cost config defaults ──────────────────────────────────────────────────────

const DEFAULT_WARNING_TOKENS  = 500_000;
const DEFAULT_STOP_TOKENS     = 1_000_000;

function getBudgetConfig(config) {
  return config?.budget || {};
}

// ── Session snapshot capture (non-blocking) ──────────────────────────────────

/**
 * Capture a live session usage snapshot via the Gateway Tool API.
 * Persists the snapshot to .swarm/logs/cost/<scope>/<scopeId>-snapshot-<ts>.json
 * Non-blocking: silently returns null on any failure.
 *
 * @param {object} config
 * @param {string} sessionKey - ACP session key to query
 * @param {string} scope      - 'module' | 'gate' | 'pipeline'
 * @param {string} scopeId    - module dir, gate id, or 'run'
 * @param {object} [extra]    - extra metadata to include in the artifact (agent, phase, etc.)
 * @returns {Promise<object|null>} raw session status result or null
 */
export async function captureSessionSnapshot(config, sessionKey, scope, scopeId, extra = {}) {
  if (!config?._logDir || !sessionKey) return null;
  try {
    const { gatewayInvoke } = await import('../integrations/gateway.js');
    const raw = await gatewayInvoke('session_status', { sessionKey }, 10000);
    const result = raw?.result || raw;
    const snapshot = {
      captured_at: new Date().toISOString(),
      run_id: getRunId(config),
      scope,
      scope_id: scopeId,
      session_key: sessionKey,
      status: result?.status || null,
      usage: result?.usage || null,
      cost: result?.cost || null,
      partial: !result?.usage,
      ...extra,
    };
    const dir = path.join(costLogDir(config), scope);
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(dir, `${String(scopeId).replace(/[^a-zA-Z0-9._-]/g, '-')}-snapshot-${ts}.json`);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2) + '\n');
    log('DEBUG', `[cost] Session snapshot saved: ${path.relative(config.repo_root || '', filePath)}`);
    return snapshot;
  } catch (e) {
    log('DEBUG', `[cost] Session snapshot failed (non-critical): ${e.message}`);
    return null;
  }
}

// ── Per-scope usage artifact ──────────────────────────────────────────────────

/**
 * Write a usage/cost artifact for a specific scope (module attempt, gate, etc.).
 * Non-blocking.
 *
 * @param {object} config
 * @param {string} scope      - 'module' | 'gate' | 'agent'
 * @param {string} scopeId    - stable identifier
 * @param {object} usageData  - { inputTokens, outputTokens, durationSeconds, model, agent, costUsd, partial }
 */
export function writeUsageArtifact(config, scope, scopeId, usageData) {
  if (!config?._logDir) return;
  try {
    const dir = path.join(costLogDir(config), scope);
    fs.mkdirSync(dir, { recursive: true });
    const artifact = {
      written_at: new Date().toISOString(),
      run_id: getRunId(config),
      scope,
      scope_id: scopeId,
      input_tokens: usageData.inputTokens ?? null,
      output_tokens: usageData.outputTokens ?? null,
      total_tokens: usageData.inputTokens != null && usageData.outputTokens != null
        ? (usageData.inputTokens + usageData.outputTokens)
        : null,
      duration_seconds: usageData.durationSeconds ?? null,
      model: usageData.model || null,
      agent: usageData.agent || null,
      cost_usd: usageData.costUsd ?? null,
      partial: usageData.partial ?? (usageData.costUsd == null),
      note: (usageData.partial ?? (usageData.costUsd == null))
        ? 'Cost data unavailable for this provider/auth mode — token counts only'
        : null,
    };
    const safeId = String(scopeId).replace(/[^a-zA-Z0-9._-]/g, '-');
    fs.writeFileSync(
      path.join(dir, `${safeId}-usage.json`),
      JSON.stringify(artifact, null, 2) + '\n',
    );
    log('DEBUG', `[cost] Usage artifact saved: ${scope}/${safeId}`);
  } catch (e) {
    log('DEBUG', `[cost] Usage artifact write failed (non-critical): ${e.message}`);
  }
}

// ── Run-level cost report ─────────────────────────────────────────────────────

/**
 * Aggregate usage from run stats and write the operator-facing cost report.
 * Writes two files:
 *   .swarm/logs/cost/run-usage.json    — machine-readable totals
 *   .swarm/logs/cost/run-cost-summary.txt — human-readable one-pager
 * Non-blocking.
 *
 * @param {object} config
 * @param {object} [extra]   - extra metadata to merge (threshold warnings, etc.)
 */
export function writeCostReport(config, extra = {}) {
  if (!config?._logDir) return;
  try {
    const stats = getRunStats(config);
    const runId = getRunId(config);

    // Accumulate tokens from stats if they exist
    const totalInput  = stats?.inputTokens  ?? null;
    const totalOutput = stats?.outputTokens ?? null;
    const totalTokens = totalInput != null && totalOutput != null
      ? totalInput + totalOutput
      : null;

    const budgetConfig = getBudgetConfig(config);
    const warningLimit = budgetConfig.warning_tokens ?? DEFAULT_WARNING_TOKENS;
    const stopLimit    = budgetConfig.stop_tokens    ?? DEFAULT_STOP_TOKENS;

    const thresholdStatus = totalTokens == null
      ? 'unknown'
      : totalTokens >= stopLimit
        ? 'exceeded_stop'
        : totalTokens >= warningLimit
          ? 'warning'
          : 'ok';

    const report = {
      generated_at: new Date().toISOString(),
      run_id: runId,
      project: config.project || null,
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      total_tokens: totalTokens,
      cost_usd: null,             // dollar cost: unavailable without provider billing data
      cost_availability: 'unavailable — use provider billing dashboard for USD totals',
      modules_completed: stats?.modules_completed?.length ?? 0,
      modules_failed:    stats?.modules_failed?.length    ?? 0,
      gates_completed:   stats?.gates_completed?.length   ?? 0,
      total_forge_attempts: stats?.total_forge_attempts   ?? 0,
      total_buster_attempts: stats?.total_buster_attempts ?? 0,
      budget: {
        warning_tokens: warningLimit,
        stop_tokens: stopLimit,
        threshold_status: thresholdStatus,
      },
      ...extra,
    };

    const dir = costLogDir(config);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'run-usage.json'), JSON.stringify(report, null, 2) + '\n');

    // Human-readable summary
    const lines = [
      `Run Cost Summary — ${runId}`,
      `Generated: ${report.generated_at}`,
      `Project:   ${config.project || 'unknown'}`,
      '',
      `Tokens:`,
      `  Input:   ${totalInput  != null ? totalInput.toLocaleString()  : 'N/A'}`,
      `  Output:  ${totalOutput != null ? totalOutput.toLocaleString() : 'N/A'}`,
      `  Total:   ${totalTokens != null ? totalTokens.toLocaleString() : 'N/A'}`,
      '',
      `Budget thresholds:`,
      `  Warning at: ${warningLimit.toLocaleString()} tokens`,
      `  Stop at:    ${stopLimit.toLocaleString()} tokens`,
      `  Status:     ${thresholdStatus.toUpperCase()}`,
      '',
      `Cost (USD): Not available — check provider billing dashboard`,
      '',
      `Modules completed: ${report.modules_completed}`,
      `Modules failed:    ${report.modules_failed}`,
      `Gates completed:   ${report.gates_completed}`,
      `Forge attempts:    ${report.total_forge_attempts}`,
      `Buster attempts:   ${report.total_buster_attempts}`,
    ];
    fs.writeFileSync(path.join(dir, 'run-cost-summary.txt'), lines.join('\n') + '\n');
    log('OK', `[cost] Cost report written (status: ${thresholdStatus})`);
    return report;
  } catch (e) {
    log('WARN', `[cost] Cost report write failed (non-critical): ${e.message}`);
    return null;
  }
}

// ── Budget threshold checking ─────────────────────────────────────────────────

/**
 * Check accumulated token usage against configured budget thresholds.
 * Emits 'budget.warning' or 'budget.exceeded' events via telemetry.
 * Returns { ok: boolean, exceeded: boolean, warned: boolean }.
 *
 * Hard-stop behavior (exceeded + hard_stop: true in config.budget) is returned
 * to the caller — the pipeline decides whether to halt; cost.js never silently
 * mutates execution.
 *
 * Non-blocking: errors return { ok: true } so they don't accidentally block.
 *
 * @param {object} config
 * @param {object} ctx      - pipeline context (for telemetry)
 * @returns {{ ok: boolean, exceeded: boolean, warned: boolean, totalTokens: number|null }}
 */
export function checkBudgetThresholds(config, ctx) {
  try {
    const stats = getRunStats(config);
    const inputTokens  = stats?.inputTokens  ?? 0;
    const outputTokens = stats?.outputTokens ?? 0;
    const totalTokens  = inputTokens + outputTokens;

    const budgetConfig = getBudgetConfig(config);
    const warningLimit = budgetConfig.warning_tokens ?? DEFAULT_WARNING_TOKENS;
    const stopLimit    = budgetConfig.stop_tokens    ?? DEFAULT_STOP_TOKENS;

    let warned   = false;
    let exceeded = false;

    if (totalTokens >= stopLimit) {
      exceeded = true;
      log('ERROR', `[cost] Budget EXCEEDED: ${totalTokens.toLocaleString()} tokens >= stop limit ${stopLimit.toLocaleString()}`);
      onBudgetExceeded(ctx, 'tokens', totalTokens, stopLimit, 'tokens');
    } else if (totalTokens >= warningLimit) {
      warned = true;
      log('WARN', `[cost] Budget WARNING: ${totalTokens.toLocaleString()} tokens >= warning limit ${warningLimit.toLocaleString()}`);
      onBudgetWarning(ctx, 'tokens', totalTokens, warningLimit, 'tokens');
    }

    const hardStop = exceeded && budgetConfig.hard_stop === true;
    return { ok: !hardStop, exceeded, warned, totalTokens };
  } catch (e) {
    log('DEBUG', `[cost] Budget check failed (non-critical): ${e.message}`);
    return { ok: true, exceeded: false, warned: false, totalTokens: null };
  }
}

// ── Token accumulation helpers ────────────────────────────────────────────────

/**
 * Accumulate token usage into run stats from a session meta object.
 * Safe to call with partial/missing data.
 */
export function accumulateTokens(config, sessionMeta = {}, ctx = null) {
  try {
    const stats = getRunStats(config);
    if (!stats) return;
    stats.inputTokens  = (stats.inputTokens  ?? 0) + (sessionMeta.inputTokens  ?? 0);
    stats.outputTokens = (stats.outputTokens ?? 0) + (sessionMeta.outputTokens ?? 0);

    // Emit cost.update telemetry event if context provided
    if (ctx && (sessionMeta.inputTokens || sessionMeta.outputTokens)) {
      emitCostUpdate(ctx, {
        module_id: sessionMeta.module_id || null,
        gate_id: sessionMeta.gate_id || null,
        tokens_in: sessionMeta.inputTokens ?? null,
        tokens_out: sessionMeta.outputTokens ?? null,
        model: sessionMeta.model || null,
        estimated_cost_usd: sessionMeta.costUsd ?? null,
        cumulative_cost_usd: null,
      });
    }
  } catch { /* non-critical */ }
}
