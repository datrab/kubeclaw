// services/telemetry.js — Structured event emission to Redis stream
// Fire-and-forget: never throws, never blocks pipeline execution.

import { createRequire } from 'module';
import { log } from '../core/logger.js';
import { getRunId } from '../core/runtime.js';

const require = createRequire(import.meta.url);

let _redis = null;
let _seq = 0;

function getRedisClient(config) {
  if (_redis) return _redis;
  try {
    let Redis;
    try {
      Redis = require('ioredis');
    } catch {
      Redis = require('/home/node/.openclaw/workspace/git-repo/Projects/clawdeck/src/backend/node_modules/ioredis');
    }
    _redis = new Redis({
      host: process.env.REDIS_HOST || 'redis-master.kubeclaw.svc.cluster.local',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableReadyCheck: false,
    });
    _redis.on('error', () => {}); // swallow all Redis errors silently
    return _redis;
  } catch {
    return null;
  }
}

function getStreamKey(config) {
  const runId = getRunId(config);
  const project = config?.project;
  if (project && runId) {
    return `pipeline:telemetry:${project}:${runId}`;
  }
  return 'pipeline:events';
}

function isEnabled(config) {
  return !!(config?.telemetry?.stream_key || config?.telemetry?.enabled);
}

/**
 * Emit a structured pipeline event to Redis stream.
 * Fire-and-forget — never throws, never blocks pipeline execution.
 * Silently skips if telemetry is not configured or Redis unavailable.
 */
export async function emitEvent(ctx, eventType, payload = {}) {
  const config = ctx?.config;
  if (!isEnabled(config)) return;

  const seq = ++_seq;
  const streamKey = getStreamKey(config);
  const event = {
    v: 1,
    type: eventType,
    ts: new Date().toISOString(),
    run_id: getRunId(config) || ctx?.runId || config?.run_id || '',
    project: config?.project || '',
    seq,
    ...payload,
  };

  try {
    const redis = getRedisClient(config);
    if (!redis) return;
    await redis.xadd(streamKey, 'MAXLEN', '~', '10000', '*', 'data', JSON.stringify(event));
  } catch {
    log('DEBUG', `[telemetry] emit failed for event '${eventType}' — skipping`);
  }
}

// ── Convenience wrappers ────────────────────────────────────────────────────

/**
 * Emit pipeline.started. Resets the sequence counter.
 * @param {object} ctx
 * @param {object|string} progress - progress object (new) or project name string (legacy)
 */
export function onPipelineStarted(ctx, progress = null) {
  _seq = 0; // Reset sequence counter at pipeline start
  const config = ctx?.config;

  const payload = {};
  if (progress && typeof progress === 'object') {
    payload.modules = Object.entries(progress.modules || {}).map(([id, m]) => ({
      id,
      title: m.title,
      dir: m.dir,
      depends_on: m.depends_on || [],
    }));
    payload.gates = Object.entries(progress.gates || {}).map(([id, g]) => ({
      id,
      type: g.type,
      title: g.title,
    }));
    payload.execution_order = progress.execution_order || [];
    payload.models = progress.models || null;
    payload.resume = !!(config?.resume);
    payload.nova_prompt = config?.nova_prompt || null;
  } else if (typeof progress === 'string') {
    // Legacy: onPipelineStarted(ctx, 'project-name')
    payload.projectName = progress;
  }

  emitEvent(ctx, 'pipeline.started', payload).catch(() => {});
}

/**
 * @param {object} ctx
 * @param {number} exitCode
 * @param {string} [exitReason]
 * @param {object} [summary] - { duration_seconds, modules_passed, modules_failed, cost_usd }
 */
export function onPipelineCompleted(ctx, exitCode, exitReason, summary = {}) {
  emitEvent(ctx, 'pipeline.completed', {
    exit_code: exitCode,
    exit_reason: exitReason || null,
    duration_seconds: summary?.duration_seconds || null,
    modules_passed: summary?.modules_passed ?? null,
    modules_failed: summary?.modules_failed ?? null,
    cost_usd: summary?.cost_usd || null,
  }).catch(() => {});
}

export function onPipelineHalted(ctx, stepId, exitCode, reason) {
  const isGate = String(stepId || '').startsWith('gate:') || ctx?.config?.gates?.[stepId];
  emitEvent(ctx, 'pipeline.halted', {
    exit_code: exitCode,
    exit_reason: reason,
    halted_at_module: isGate ? null : (stepId || null),
    halted_at_gate: isGate ? stepId : null,
  }).catch(() => {});
}

export function onModuleStarted(ctx, moduleId, model, attempt) {
  emitEvent(ctx, 'module.started', { module_id: moduleId, model, attempt }).catch(() => {});
}

/**
 * Emit module.status_changed with new_status="PASS".
 * @param {object} ctx
 * @param {string} moduleId
 * @param {number|object} dataOrDuration - legacy: duration seconds; new: enriched data object
 */
export function onModulePass(ctx, moduleId, dataOrDuration = {}) {
  const data = typeof dataOrDuration === 'number'
    ? { duration_seconds: dataOrDuration }
    : (dataOrDuration || {});

  emitEvent(ctx, 'module.status_changed', {
    module_id: moduleId,
    title: data.title || null,
    old_status: data.old_status || null,
    new_status: 'PASS',
    attempt: data.attempt ?? null,
    phase: data.phase || null,
    model: data.model || null,
    duration_seconds: data.duration_seconds ?? null,
    cost_estimate_usd: data.cost_estimate_usd ?? null,
    commit_hash: data.commit_hash || null,
  }).catch(() => {});
}

/**
 * Emit module.status_changed with new_status="FAIL".
 * @param {object} ctx
 * @param {string} moduleId
 * @param {string|object} phaseOrData - legacy: phase string; new: enriched data object
 * @param {string} [reason] - legacy reason when phaseOrData is a string
 */
export function onModuleFail(ctx, moduleId, phaseOrData, reason) {
  const data = typeof phaseOrData === 'string'
    ? { phase: phaseOrData, reason }
    : (phaseOrData || {});

  emitEvent(ctx, 'module.status_changed', {
    module_id: moduleId,
    title: data.title || null,
    old_status: data.old_status || null,
    new_status: 'FAIL',
    attempt: data.attempt ?? null,
    phase: data.phase || null,
    model: data.model || null,
    duration_seconds: data.duration_seconds ?? null,
    cost_estimate_usd: data.cost_estimate_usd ?? null,
    commit_hash: data.commit_hash || null,
    reason: data.reason || null,
  }).catch(() => {});
}

/**
 * Emit module.status_changed with new_status="BLOCKED".
 * @param {object} ctx
 * @param {string} moduleId
 * @param {string|object} reasonOrData - legacy: reason string; new: enriched data object
 */
export function onModuleBlocked(ctx, moduleId, reasonOrData) {
  const data = typeof reasonOrData === 'string'
    ? { reason: reasonOrData }
    : (reasonOrData || {});

  emitEvent(ctx, 'module.status_changed', {
    module_id: moduleId,
    title: data.title || null,
    old_status: data.old_status || null,
    new_status: 'BLOCKED',
    attempt: data.attempt ?? null,
    phase: data.phase || null,
    model: data.model || null,
    duration_seconds: data.duration_seconds ?? null,
    cost_estimate_usd: data.cost_estimate_usd ?? null,
    commit_hash: data.commit_hash || null,
    reason: data.reason || null,
  }).catch(() => {});
}

/**
 * Emit gate.started.
 * @param {object} ctx
 * @param {string} gateId
 * @param {string|object} gateOrType - legacy: gate type string; new: gate config object
 */
export function onGateStarted(ctx, gateId, gateOrType) {
  let payload;
  if (typeof gateOrType === 'string') {
    // Legacy: onGateStarted(ctx, gateId, gateType)
    payload = { gate_id: gateId, gate_type: gateOrType, title: null, reviewers: null };
  } else {
    const gate = gateOrType || {};
    payload = {
      gate_id: gateId,
      gate_type: gate.type || null,
      title: gate.title || null,
      reviewers: gate.reviewers || null,
    };
  }
  emitEvent(ctx, 'gate.started', payload).catch(() => {});
}

/**
 * Emit gate.verdict with verdict="GO".
 * @param {object} ctx
 * @param {string} gateId
 * @param {object} [data] - { gate_type, issues_count, blockers_count, fix_cycle, duration_seconds }
 */
export function onGatePass(ctx, gateId, data = {}) {
  emitEvent(ctx, 'gate.verdict', {
    gate_id: gateId,
    gate_type: data.gate_type || null,
    verdict: 'GO',
    issues_count: data.issues_count ?? null,
    blockers_count: data.blockers_count ?? null,
    fix_cycle: data.fix_cycle ?? null,
    duration_seconds: data.duration_seconds ?? null,
  }).catch(() => {});
}

/**
 * Emit gate.verdict with verdict="NO-GO".
 * @param {object} ctx
 * @param {string} gateId
 * @param {string|object} dataOrReason - legacy: reason string; new: enriched data object
 */
export function onGateFail(ctx, gateId, dataOrReason) {
  const data = typeof dataOrReason === 'string'
    ? { reason: dataOrReason }
    : (dataOrReason || {});

  emitEvent(ctx, 'gate.verdict', {
    gate_id: gateId,
    gate_type: data.gate_type || null,
    verdict: 'NO-GO',
    issues_count: data.issues_count ?? null,
    blockers_count: data.blockers_count ?? null,
    fix_cycle: data.fix_cycle ?? null,
    duration_seconds: data.duration_seconds ?? null,
    reason: data.reason || null,
  }).catch(() => {});
}

/**
 * Emit agent.spawned.
 * @param {object} ctx
 * @param {string} agentType
 * @param {string|object} targetIdOrData - legacy: target id string; new: enriched data object
 * @param {string} [model] - legacy model arg
 * @param {string} [sessionKey] - legacy session key arg
 */
export function onAgentSpawned(ctx, agentType, targetIdOrData, model, sessionKey) {
  let data;
  if (typeof targetIdOrData === 'string') {
    // Legacy: onAgentSpawned(ctx, agentType, targetId, model, sessionKey)
    data = {
      agent_type: agentType,
      label: targetIdOrData,
      model,
      session_key: sessionKey,
    };
  } else {
    data = targetIdOrData || {};
    if (agentType && !data.agent_type) data = { agent_type: agentType, ...data };
  }

  emitEvent(ctx, 'agent.spawned', {
    agent_type: data.agent_type || agentType || null,
    label: data.label || null,
    model: data.model || model || null,
    dispatch: data.dispatch || null,
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    substep: data.substep || null,
    attempt: data.attempt ?? null,
    timeout_minutes: data.timeout_minutes ?? null,
    session_key: data.session_key || sessionKey || null,
    thinking_level: data.thinking_level || null,
  }).catch(() => {});
}

/**
 * Emit agent.killed and accumulate tokens into ctx.stats.
 * @param {object} ctx
 * @param {string} agentType
 * @param {string|object} targetIdOrData - legacy: target id string; new: enriched data object
 * @param {boolean} [graceful] - legacy graceful flag
 * @param {object} [sessionMeta] - legacy session metadata with token counts
 */
export function onAgentKilled(ctx, agentType, targetIdOrData, graceful, sessionMeta = {}) {
  let label, data, metaTokens;

  if (typeof targetIdOrData === 'string') {
    // Legacy: onAgentKilled(ctx, agentType, targetId, graceful, sessionMeta)
    label = targetIdOrData;
    data = {};
    metaTokens = sessionMeta;
  } else {
    // New: onAgentKilled(ctx, agentType, data)
    label = null;
    data = targetIdOrData || {};
    metaTokens = data;
  }

  emitEvent(ctx, 'agent.killed', {
    agent_type: agentType || data.agent_type || null,
    label: label || data.label || null,
    module_id: data.module_id || null,
    has_changes: data.has_changes ?? (typeof graceful === 'boolean' ? graceful : null),
    duration_seconds: data.duration_seconds ?? null,
    files_changed: data.files_changed || null,
    reason: data.reason || null,
  }).catch(() => {});

  // Accumulate into ctx.stats for module-level summary
  if (ctx?.stats) {
    ctx.stats.inputTokens = (ctx.stats.inputTokens ?? 0) + (metaTokens.inputTokens ?? 0);
    ctx.stats.outputTokens = (ctx.stats.outputTokens ?? 0) + (metaTokens.outputTokens ?? 0);
  }
}

export function onPhaseStarted(ctx, moduleId, phase, model) {
  emitEvent(ctx, 'phase.started', { module_id: moduleId, phase, model }).catch(() => {});
}

export function onPhaseCompleted(ctx, moduleId, phase) {
  emitEvent(ctx, 'phase.completed', { module_id: moduleId, phase }).catch(() => {});
}

export function onRetryScheduled(ctx, moduleId, attempt, maxFails) {
  emitEvent(ctx, 'retry.scheduled', { module_id: moduleId, attempt, max_fails: maxFails }).catch(() => {});
}

export function onRetryExhausted(ctx, moduleId, attempt, maxFails) {
  emitEvent(ctx, 'retry.exhausted', { module_id: moduleId, attempt, max_fails: maxFails }).catch(() => {});
}

/**
 * Emit error.escalation.
 * @param {object} ctx
 * @param {string} scope - 'module' or 'gate'
 * @param {string} scopeId
 * @param {string|object} reasonOrData - legacy: reason string; new: { action, last_failure, fail_count }
 * @param {number} exitCode
 */
export function onEscalated(ctx, scope, scopeId, reasonOrData, exitCode) {
  const isGate = scope === 'gate';
  const data = typeof reasonOrData === 'string'
    ? { action: null, last_failure: reasonOrData, fail_count: null }
    : (reasonOrData || {});
  emitEvent(ctx, 'error.escalation', {
    exit_code: exitCode,
    module_id: isGate ? null : (scopeId || null),
    gate_id: isGate ? (scopeId || null) : null,
    fail_count: data.fail_count ?? null,
    last_failure: data.last_failure || data.reason || null,
    action: data.action || null,
  }).catch(() => {});
}

export function onSummaryStarted(ctx, summaryType) {
  emitEvent(ctx, 'summary.started', { summary_type: summaryType }).catch(() => {});
}

export function onSummaryCompleted(ctx, summaryType) {
  emitEvent(ctx, 'summary.completed', { summary_type: summaryType }).catch(() => {});
}

export function onBudgetWarning(ctx, threshold, current, limit, unit) {
  emitEvent(ctx, 'budget.warning', { threshold, current, limit, unit }).catch(() => {});
}

export function onBudgetExceeded(ctx, threshold, current, limit, unit) {
  emitEvent(ctx, 'budget.exceeded', { threshold, current, limit, unit }).catch(() => {});
}

export function onRedisMessage(ctx, direction, msgType, scope, scopeId, payloadSize) {
  emitEvent(ctx, 'redis.message', { direction, msg_type: msgType, scope, scope_id: scopeId, payload_size: payloadSize }).catch(() => {});
}

export function onApprovalRequested(ctx, gateId, gateTitle, timeoutMinutes, timeoutPolicy) {
  emitEvent(ctx, 'approval.requested', { gate_id: gateId, gate_title: gateTitle, timeout_minutes: timeoutMinutes, timeout_policy: timeoutPolicy }).catch(() => {});
}

export function onApprovalResolved(ctx, gateId, status, decisionBy) {
  emitEvent(ctx, 'approval.resolved', { gate_id: gateId, status, decision_by: decisionBy || null }).catch(() => {});
}

// ── New event emitters ───────────────────────────────────────────────────────

/**
 * Emit cost.update after token accumulation.
 * @param {object} ctx
 * @param {object} data - { module_id, gate_id, tokens_in, tokens_out, model, estimated_cost_usd, cumulative_cost_usd }
 */
export function emitCostUpdate(ctx, data = {}) {
  emitEvent(ctx, 'cost.update', {
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    tokens_in: data.tokens_in ?? null,
    tokens_out: data.tokens_out ?? null,
    model: data.model || null,
    estimated_cost_usd: data.estimated_cost_usd ?? null,
    cumulative_cost_usd: data.cumulative_cost_usd ?? null,
  }).catch(() => {});
}

/**
 * Emit rate_limit.detected when a rate limit pause is triggered.
 * @param {object} ctx
 * @param {object} data - { agent_type, module_id, provider, pause_count, max_pauses, cooldown_ms, resume_at, detail }
 */
export function emitRateLimitDetected(ctx, data = {}) {
  emitEvent(ctx, 'rate_limit.detected', {
    agent_type: data.agent_type || null,
    module_id: data.module_id || null,
    provider: data.provider || 'anthropic',
    pause_count: data.pause_count ?? null,
    max_pauses: data.max_pauses ?? null,
    cooldown_ms: data.cooldown_ms ?? null,
    resume_at: data.resume_at || null,
    detail: data.detail || null,
  }).catch(() => {});
}

/**
 * Emit buster.result after a Buster run completes.
 * @param {object} ctx
 * @param {object} data - { module_id, gate_id, attempt, overall, suites, duration_seconds }
 */
export function emitBusterResult(ctx, data = {}) {
  emitEvent(ctx, 'buster.result', {
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    attempt: data.attempt ?? null,
    overall: data.overall || null,
    suites: data.suites || null,
    duration_seconds: data.duration_seconds ?? null,
  }).catch(() => {});
}

/**
 * Emit agent.transcript for a live transcript line or batch.
 * @param {object} ctx
 * @param {object} data - { agent_type, label, module_id, line_kind, text, transcript_offset, line_count }
 */
export function emitTranscriptLine(ctx, data = {}) {
  emitEvent(ctx, 'agent.transcript', {
    agent_type: data.agent_type || null,
    label: data.label || null,
    module_id: data.module_id || null,
    line_kind: data.line_kind || 'info',
    text: data.text || '',
    transcript_offset: data.transcript_offset ?? null,
    line_count: data.line_count ?? null,
  }).catch(() => {});
}

/**
 * Emit agent.progress summary during a long-running session.
 * @param {object} ctx
 * @param {object} data - { agent_type, label, module_id, elapsed_seconds, transcript_events, files_touched, last_activity, status }
 */
export function emitAgentProgress(ctx, data = {}) {
  emitEvent(ctx, 'agent.progress', {
    agent_type: data.agent_type || null,
    label: data.label || null,
    module_id: data.module_id || null,
    elapsed_seconds: data.elapsed_seconds ?? null,
    transcript_events: data.transcript_events ?? null,
    files_touched: data.files_touched || null,
    last_activity: data.last_activity || null,
    status: data.status || 'active',
  }).catch(() => {});
}

/**
 * DEPRECATED: Memory recall via Qdrant/memory.js — disabled pending improvement.
 * Kept as export for backward compat but is a no-op.
 * @param {object} ctx
 * @param {string} moduleId
 * @param {Array<{text: string, confidence?: number, tags?: string[]}>} memories
 */
export function emitMemoryRecalled(ctx, moduleId, memories = []) {
  // DEPRECATED: disabled pending memory system improvement
  return;
}

/**
 * Close the telemetry Redis connection gracefully.
 * Non-blocking — logs but does not throw on failure.
 * Safe to call even if Redis was never connected.
 */
export async function closeTelemetryRedis() {
  if (!_redis) return;
  try {
    await _redis.quit();
    log('DEBUG', '[telemetry] Redis connection closed');
  } catch (e) {
    log('DEBUG', `[telemetry] Redis close failed (non-critical): ${e.message}`);
  } finally {
    _redis = null;
  }
}
