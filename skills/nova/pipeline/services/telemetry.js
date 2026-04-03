// services/telemetry.js — Structured event emission to Redis stream
// Fire-and-forget: never throws, never blocks pipeline execution.

import { createRequire } from 'module';
import { log } from '../core/logger.js';

const require = createRequire(import.meta.url);

let _redis = null;

function getRedisClient(config) {
  if (_redis) return _redis;
  try {
    const Redis = require('ioredis');
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
  return config?.telemetry?.stream_key || 'pipeline:events';
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

  const streamKey = getStreamKey(config);
  const event = {
    event: eventType,
    runId: ctx?.runId || config?.run_id || '',
    project: config?.project || '',
    timestamp: new Date().toISOString(),
    ...payload,
  };

  try {
    const redis = getRedisClient(config);
    if (!redis) return;
    const fields = [];
    for (const [k, v] of Object.entries(event)) {
      fields.push(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
    }
    await redis.xadd(streamKey, '*', ...fields);
  } catch {
    log('DEBUG', `[telemetry] emit failed for event '${eventType}' — skipping`);
  }
}

// ── Convenience wrappers ────────────────────────────────────────────────────

export function onPipelineStarted(ctx, projectName) {
  emitEvent(ctx, 'pipeline.started', { projectName }).catch(() => {});
}

export function onPipelineCompleted(ctx, exitCode) {
  emitEvent(ctx, 'pipeline.completed', { exitCode }).catch(() => {});
}

export function onPipelineHalted(ctx, stepId, exitCode, reason) {
  emitEvent(ctx, 'pipeline.halted', { stepId, exitCode, reason }).catch(() => {});
}

export function onModuleStarted(ctx, moduleId, model, attempt) {
  emitEvent(ctx, 'module.started', { moduleId, model, attempt }).catch(() => {});
}

export function onModulePass(ctx, moduleId, durationSeconds) {
  emitEvent(ctx, 'module.pass', {
    moduleId,
    durationSeconds,
    tokens: {
      input: ctx?.stats?.inputTokens ?? 0,
      output: ctx?.stats?.outputTokens ?? 0,
    },
  }).catch(() => {});
}

export function onModuleFail(ctx, moduleId, phase, reason) {
  emitEvent(ctx, 'module.fail', { moduleId, phase, reason }).catch(() => {});
}

export function onModuleBlocked(ctx, moduleId, reason) {
  emitEvent(ctx, 'module.blocked', { moduleId, reason }).catch(() => {});
}

export function onGateStarted(ctx, gateId, gateType) {
  emitEvent(ctx, 'gate.started', { gateId, gateType }).catch(() => {});
}

export function onGatePass(ctx, gateId) {
  emitEvent(ctx, 'gate.pass', { gateId }).catch(() => {});
}

export function onGateFail(ctx, gateId, reason) {
  emitEvent(ctx, 'gate.fail', { gateId, reason }).catch(() => {});
}

export function onAgentSpawned(ctx, agentType, targetId, model, sessionKey) {
  emitEvent(ctx, 'agent.spawned', { agentType, targetId, model, sessionKey }).catch(() => {});
}

export function onAgentKilled(ctx, agentType, targetId, graceful, sessionMeta = {}) {
  emitEvent(ctx, 'agent.killed', {
    agentType,
    targetId,
    graceful,
    tokens: {
      input: sessionMeta.inputTokens ?? 0,
      output: sessionMeta.outputTokens ?? 0,
    },
    sessionKey: sessionMeta.sessionKey,
  }).catch(() => {});

  // Accumulate into ctx.stats for module-level summary
  if (ctx?.stats) {
    ctx.stats.inputTokens = (ctx.stats.inputTokens ?? 0) + (sessionMeta.inputTokens ?? 0);
    ctx.stats.outputTokens = (ctx.stats.outputTokens ?? 0) + (sessionMeta.outputTokens ?? 0);
  }
}

export function onPhaseStarted(ctx, moduleId, phase, model) {
  emitEvent(ctx, 'phase.started', { moduleId, phase, model }).catch(() => {});
}

export function onPhaseCompleted(ctx, moduleId, phase) {
  emitEvent(ctx, 'phase.completed', { moduleId, phase }).catch(() => {});
}

export function onRetryScheduled(ctx, moduleId, attempt, maxFails) {
  emitEvent(ctx, 'retry.scheduled', { moduleId, attempt, maxFails }).catch(() => {});
}

export function onRetryExhausted(ctx, moduleId, attempt, maxFails) {
  emitEvent(ctx, 'retry.exhausted', { moduleId, attempt, maxFails }).catch(() => {});
}

export function onEscalated(ctx, scope, scopeId, reason, exitCode) {
  emitEvent(ctx, 'escalation', { scope, scopeId, reason, exitCode }).catch(() => {});
}

export function onSummaryStarted(ctx, summaryType) {
  emitEvent(ctx, 'summary.started', { summaryType }).catch(() => {});
}

export function onSummaryCompleted(ctx, summaryType) {
  emitEvent(ctx, 'summary.completed', { summaryType }).catch(() => {});
}

export function onBudgetWarning(ctx, threshold, current, limit, unit) {
  emitEvent(ctx, 'budget.warning', { threshold, current, limit, unit }).catch(() => {});
}

export function onBudgetExceeded(ctx, threshold, current, limit, unit) {
  emitEvent(ctx, 'budget.exceeded', { threshold, current, limit, unit }).catch(() => {});
}

export function onRedisMessage(ctx, direction, type, scope, scopeId, payloadSize) {
  emitEvent(ctx, 'redis.message', { direction, type, scope, scopeId, payloadSize }).catch(() => {});
}

export function onApprovalRequested(ctx, gateId, gateTitle, timeoutMinutes, timeoutPolicy) {
  emitEvent(ctx, 'approval.requested', { gateId, gateTitle, timeoutMinutes, timeoutPolicy }).catch(() => {});
}

export function onApprovalResolved(ctx, gateId, status, decisionBy) {
  emitEvent(ctx, 'approval.resolved', { gateId, status, decisionBy: decisionBy || null }).catch(() => {});
}
