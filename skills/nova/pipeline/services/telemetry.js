// services/telemetry.js — Structured event emission to Redis stream
// Fire-and-forget: never throws, never blocks pipeline execution.

import { log } from '../core/logger.js';
import { getRunId, getRunStats } from '../core/runtime.js';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../../../common/pipeline/noncritical-reporting.js';
import { appendStructuredEvent } from './observability.js';
import { dispatchNotificationHook } from './notification-dispatch.js';
import { observeDiscordNotification } from './notification-contract.js';
import {
  closeTelemetryStreamRedis,
  emitTelemetryStreamEvent,
  getTelemetryStreamKeyForRun,
  isTelemetryEnabled,
} from './telemetry-stream.js';

const _telemetryHealth = new Map();

function computePercentUsed(current, limit) {
  if (typeof current !== 'number' || typeof limit !== 'number' || !Number.isFinite(current) || !Number.isFinite(limit) || limit === 0) {
    return null;
  }
  return Number(((current / limit) * 100).toFixed(2));
}

function normalizeApprovalTimeoutPolicy(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'CONTINUE' ? 'CONTINUE' : 'BLOCK';
}

function telemetryHealthKey(config, runId) {
  return `${config?.project || 'unknown'}:${runId || 'unknown'}`;
}

function reportTelemetryWrapperFailure(ctx, eventType, error) {
  const config = ctx?.config || {};
  const runId = getRunId(config) || ctx?.runId || config?.run_id || config?._runId || 'unknown';
  reportClassifiedNonBlockingError({
    log,
    reporter: 'telemetry',
    classification: 'event_emit_failed',
    incidentKey: buildNonBlockingIncidentKey('telemetry', config?.project || 'unknown', runId, eventType, 'event_emit_failed'),
    message: `non-blocking telemetry emission failed for '${eventType}'`,
    error,
    level: 'DEBUG',
  });
}

function emitEventNonBlocking(ctx, eventType, payload = {}) {
  return emitEvent(ctx, eventType, payload).catch((error) => {
    reportTelemetryWrapperFailure(ctx, eventType, error);
  });
}

async function emitLegacyEventDirect(ctx, eventType, payload = {}) {
  const config = ctx?.config;
  if (!isTelemetryEnabled(config)) return;

  const runId = getRunId(config) || ctx?.runId || config?.run_id || '';
  const streamKey = getTelemetryStreamKeyForRun(config, runId);
  const result = await emitTelemetryStreamEvent(config, eventType, payload, {
    runId,
    emitter: 'nova/pipeline/services/telemetry',
  });

  if (result?.ok) {
    appendStructuredEvent(config, eventType, result.event);
    await emitTelemetryRestoredIfNeeded(config, runId, streamKey);
    return;
  }

  if (!result?.skipped) {
    markTelemetryDegraded(config, runId, streamKey, eventType, result?.error);
    log('DEBUG', `[telemetry] emit failed for event '${eventType}' — skipping`);
  }
}

function markTelemetryDegraded(config, runId, streamKey, eventType, err) {
  const key = telemetryHealthKey(config, runId);
  const prev = _telemetryHealth.get(key);
  if (prev?.degraded) return;

  const startedAt = new Date().toISOString();
  _telemetryHealth.set(key, {
    degraded: true,
    startedAt,
    streamKey,
    reason: 'redis_emit_failed',
  });

  appendStructuredEvent(config, 'observability.degraded', {
    component: 'telemetry',
    surface: 'redis_stream',
    reason: 'redis_emit_failed',
    detail: err?.message || 'redis telemetry emission failed',
    impacted_event_type: eventType || null,
    stream_key: streamKey || null,
    degraded_at: startedAt,
  });
}

async function emitTelemetryRestoredIfNeeded(config, runId, streamKey) {
  const key = telemetryHealthKey(config, runId);
  const prev = _telemetryHealth.get(key);
  if (!prev?.degraded) return;

  const restoredAt = new Date().toISOString();
  const restoredAfterMs = prev.startedAt ? Math.max(0, Date.now() - new Date(prev.startedAt).getTime()) : null;
  _telemetryHealth.set(key, { degraded: false, restoredAt, streamKey });

  const payload = {
    component: 'telemetry',
    surface: 'redis_stream',
    reason: prev.reason || 'redis_emit_failed',
    detail: 'redis telemetry emission restored',
    stream_key: streamKey || prev.streamKey || null,
    degraded_at: prev.startedAt || null,
    restored_at: restoredAt,
    restored_after_ms: restoredAfterMs,
  };

  appendStructuredEvent(config, 'observability.restored', payload);

  const result = await emitTelemetryStreamEvent(config, 'observability.restored', payload, {
    emittedAt: restoredAt,
    runId,
    emitter: 'nova/pipeline/services/telemetry',
  });
  if (!result?.ok) {
    // If restore backfill fails, keep the artifact signal and avoid recursive noise.
  }
}

/**
 * Emit a structured pipeline event to Redis stream.
 * Fire-and-forget, never throws, never blocks pipeline execution.
 * seq is allocated per run via Redis so restarts do not reuse sequence numbers.
 */
export async function emitEvent(ctx, eventType, payload = {}) {
  await emitLegacyEventDirect(ctx, eventType, payload);
}

function buildNotificationEnvelope(ctx, hookId, eventType, payload = {}, options = {}) {
  const config = ctx?.config || {};
  return {
    ids: {
      runId: getRunId(config) || ctx?.runId || config?.run_id || null,
      moduleId: options.moduleId || payload.module_id || null,
      gateId: options.gateId || payload.gate_id || null,
      gateType: options.gateType || payload.gate_type || null,
      attempt: options.attempt ?? payload.attempt ?? null,
      stageId: hookId,
    },
    snapshot: options.snapshot || {},
    stateSnapshot: options.stateSnapshot || {},
    executionContext: options.executionContext || {},
    event: {
      type: eventType,
      payload,
      emitter: 'nova/pipeline/services/telemetry',
    },
    presentation: options.presentation || {},
  };
}

async function dispatchOperatorPresentationFromEnvelope(ctx, envelope, eventType) {
  if (!envelope?.presentation?.discord) {
    return { ok: true, skipped: true };
  }

  try {
    await observeDiscordNotification(envelope, { config: ctx?.config || {} });
    return { ok: true, envelope };
  } catch (error) {
    log('WARN', `[notification] operator alert dispatch failed for '${eventType}': ${error.message}`);
    return { ok: false, error: error.message, envelope };
  }
}

async function emitNotificationCompatibilityEvent(ctx, hookId, eventType, payload = {}, options = {}) {
  const envelope = buildNotificationEnvelope(ctx, hookId, eventType, payload, options);

  let result;
  try {
    result = await dispatchNotificationHook(ctx, hookId, envelope);
  } catch (error) {
    log('WARN', `[notification] dispatch failed for hook '${hookId}' event '${eventType}': ${error.message}`);
    result = {
      input: envelope,
      listeners: [],
      results: [],
      listenerMissing: false,
      dispatchError: error.message,
    };
  }

  if (result?.listenerMissing || result?.dispatchError) {
    const legacyFallback = await emitLegacyEventDirect(ctx, eventType, payload)
      .then(() => ({ ok: true }))
      .catch((error) => ({ ok: false, error: error.message }));
    const operatorFallback = envelope.presentation?.discord
      ? await dispatchOperatorPresentationFromEnvelope(ctx, envelope, eventType)
      : null;
    return { ...result, legacyFallback, operatorFallback };
  }

  return result;
}

export function emitOperatorAlert(ctx, eventType, payload = {}, options = {}) {
  return dispatchOperatorPresentationFromEnvelope(
    ctx,
    buildNotificationEnvelope(ctx, options.hookId || 'pipeline.completed', eventType, payload, options),
    eventType,
  );
}

function mapPipelineExitStatus(exitCode) {
  if (exitCode === 0) return 'PASS';
  if (exitCode === 20) return 'BLOCKED';
  if (exitCode === 30) return 'TIMEOUT';
  if (exitCode === 40) return 'RATE_LIMITED';
  return 'FAIL';
}

// ── Convenience wrappers ────────────────────────────────────────────────────

/**
 * Emit pipeline.started.
 * @param {object} ctx
 * @param {object|string} progress - progress object (new) or project name string (legacy)
 */
export function onPipelineStarted(ctx, progress = null, options = {}) {
  const config = ctx?.config;

  const payload = {};
  if (progress && typeof progress === 'object') {
    const legacyModels = progress.models && typeof progress.models === 'object' ? progress.models : null;
    const defaultModels = progress.defaults?.models && typeof progress.defaults.models === 'object'
      ? progress.defaults.models
      : null;
    const effectiveModels = legacyModels || defaultModels
      ? { ...(legacyModels || {}), ...(defaultModels || {}) }
      : null;

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
    payload.models = effectiveModels;
    payload.resume = !!(config?.resume);
    payload.nova_prompt = config?.nova_prompt || null;
  } else if (typeof progress === 'string') {
    // Legacy: onPipelineStarted(ctx, 'project-name')
    payload.projectName = progress;
  }

  return emitNotificationCompatibilityEvent(ctx, 'pipeline.started', 'pipeline.started', payload, {
    snapshot: { status: 'IN_PROGRESS' },
    presentation: options.presentation || {},
  });
}

/**
 * @param {object} ctx
 * @param {number} exitCode
 * @param {string} [exitReason]
 * @param {object} [summary] - { duration_seconds, modules_passed, modules_failed, cost_usd }
 */
export function onPipelineCompleted(ctx, exitCode, exitReason, summary = {}, options = {}) {
  const stats = getRunStats(ctx?.config);
  const startedAt = stats?.started_at ? new Date(stats.started_at).getTime() : null;
  const modulesPassed = summary?.modules_passed ?? (Array.isArray(stats?.modules_completed) ? stats.modules_completed.length : null);
  const modulesFailed = summary?.modules_failed ?? (Array.isArray(stats?.modules_failed) ? stats.modules_failed.length : null);
  const modulesBlocked = summary?.modules_blocked ?? (Array.isArray(stats?.modules_blocked) ? stats.modules_blocked.length : null);
  const modulesTotal = summary?.modules_total
    ?? (typeof modulesPassed === 'number' && typeof modulesFailed === 'number' && typeof modulesBlocked === 'number'
      ? modulesPassed + modulesFailed + modulesBlocked
      : null);
  const durationSeconds = summary?.duration_seconds
    ?? (startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : null);
  const totalCostUsd = summary?.total_cost_usd ?? summary?.cost_usd ?? null;

  const payload = {
    exit_code: exitCode,
    exit_reason: exitReason || null,
    duration_seconds: durationSeconds,
    modules_passed: modulesPassed,
    modules_failed: modulesFailed,
    modules_total: modulesTotal,
    total_cost_usd: totalCostUsd,
  };

  return emitNotificationCompatibilityEvent(ctx, 'pipeline.completed', 'pipeline.completed', payload, {
    snapshot: { status: mapPipelineExitStatus(exitCode) },
    presentation: options.presentation || {},
  });
}

export function onPipelineHalted(ctx, stepOrData, exitCode, reason) {
  const data = stepOrData && typeof stepOrData === 'object' && !Array.isArray(stepOrData)
    ? stepOrData
    : { step_id: stepOrData, exit_code: exitCode, reason };
  const stepId = data.step_id ?? data.stepId ?? null;
  const stepType = data.step_type ?? data.stepType ?? null;
  const isGate = data.gate_id != null
    ? true
    : data.module_id != null
      ? false
      : stepType === 'gate'
        ? true
        : stepType === 'module'
          ? false
          : String(stepId || '').startsWith('gate:') || ctx?.config?.gates?.[stepId];
  const event = {
    reason: data.reason || reason || 'UNKNOWN',
    module_id: data.module_id ?? ((stepType && stepType !== 'module') || isGate ? null : (stepId || null)),
    gate_id: data.gate_id ?? ((stepType === 'gate' || isGate) ? (stepId || null) : null),
    gate_type: (data.gate_id != null || stepType === 'gate' || isGate) ? (data.gate_type ?? null) : undefined,
    session_key: data.session_key ?? null,
    attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id ?? null,
    gateway_label: data.gateway_label || data.label || null,
    exit_code: data.exit_code ?? exitCode,
  };
  if (stepType && stepType !== 'module' && stepType !== 'gate') event.step_type = stepType;
  if (stepId && stepType && stepType !== 'module' && stepType !== 'gate') event.step_id = stepId;
  emitEventNonBlocking(ctx, 'pipeline.halted', event);
}

export function onModuleStarted(ctx, moduleId, model, attempt, options = {}) {
  return emitNotificationCompatibilityEvent(ctx, 'module.started', 'module.started', { module_id: moduleId, model, attempt }, {
    moduleId,
    attempt,
    snapshot: { status: 'IN_PROGRESS' },
    presentation: options.presentation || {},
  });
}

export function onModuleStatusChanged(ctx, moduleId, data = {}) {
  const payload = {
    module_id: moduleId,
    title: data.title || null,
    old_status: data.old_status || null,
    new_status: data.new_status || null,
    attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id ?? null,
    gateway_label: data.gateway_label || data.label || null,
    phase: data.phase || null,
    model: data.model || null,
    session_key: data.session_key ?? null,
    duration_seconds: data.duration_seconds ?? null,
    cost_estimate_usd: data.cost_estimate_usd ?? null,
    commit_hash: data.commit_hash || null,
    reason: data.reason || null,
  };

  if (payload.new_status === 'PASS' || payload.new_status === 'FAIL' || payload.new_status === 'BLOCKED') {
    return emitNotificationCompatibilityEvent(ctx, 'module.completed', 'module.status_changed', payload, {
      moduleId,
      attempt: payload.attempt,
      snapshot: { status: payload.new_status },
      presentation: data.presentation || {},
    });
  }

  return emitEventNonBlocking(ctx, 'module.status_changed', payload);
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

  return onModuleStatusChanged(ctx, moduleId, {
    ...data,
    new_status: 'PASS',
  });
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

  return onModuleStatusChanged(ctx, moduleId, {
    ...data,
    new_status: 'FAIL',
  });
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

  return onModuleStatusChanged(ctx, moduleId, {
    ...data,
    new_status: 'BLOCKED',
  });
}

/**
 * Emit gate.started.
 * @param {object} ctx
 * @param {string} gateId
 * @param {string|object} gateOrType - legacy: gate type string; new: gate config object
 */
export function onGateStarted(ctx, gateId, gateOrType, options = {}) {
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
  return emitNotificationCompatibilityEvent(ctx, 'gate.started', 'gate.started', payload, {
    gateId,
    gateType: payload.gate_type || null,
    snapshot: { status: 'IN_PROGRESS' },
    presentation: options.presentation || {},
  });
}

/**
 * Emit gate.verdict with verdict="GO".
 * @param {object} ctx
 * @param {string} gateId
 * @param {object} [data] - { gate_type, issues_count, blockers_count, fix_cycle, duration_seconds }
 */
export function onGatePass(ctx, gateId, data = {}) {
  const payload = {
    gate_id: gateId,
    gate_type: data.gate_type || null,
    verdict: 'GO',
    issues_count: data.issues_count ?? null,
    blockers_count: data.blockers_count ?? null,
    fix_cycle: data.fix_cycle ?? null,
    duration_seconds: data.duration_seconds ?? null,
    dispatch_id: data.dispatch_id ?? null,
    session_key: data.session_key || null,
  };

  return emitNotificationCompatibilityEvent(ctx, 'gate.completed', 'gate.verdict', payload, {
    gateId,
    gateType: payload.gate_type || null,
    attempt: data.attempt ?? null,
    snapshot: { verdict: 'GO', status: 'PASS' },
    presentation: data.presentation || {},
  });
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

  const payload = {
    gate_id: gateId,
    gate_type: data.gate_type || null,
    verdict: 'NO-GO',
    issues_count: data.issues_count ?? null,
    blockers_count: data.blockers_count ?? null,
    fix_cycle: data.fix_cycle ?? null,
    duration_seconds: data.duration_seconds ?? null,
    attempt: data.attempt ?? null,
    reason: data.reason || null,
    dispatch_id: data.dispatch_id ?? null,
    gateway_label: data.gateway_label || data.label || null,
    session_key: data.session_key || null,
  };

  return emitNotificationCompatibilityEvent(ctx, 'gate.completed', 'gate.verdict', payload, {
    gateId,
    gateType: payload.gate_type || null,
    attempt: payload.attempt,
    snapshot: { verdict: 'NO-GO', status: 'FAIL' },
    presentation: data.presentation || {},
  });
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

  emitEventNonBlocking(ctx, 'agent.spawned', {
    agent_type: data.agent_type || agentType || null,
    label: data.label || null,
    model: data.model || model || null,
    dispatch: data.dispatch || null,
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    gate_type: data.gate_type || null,
    substep: data.substep || null,
    attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id || null,
    timeout_minutes: data.timeout_minutes ?? null,
    session_key: data.session_key || sessionKey || null,
    thinking_level: data.thinking_level || null,
  });
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

  emitEventNonBlocking(ctx, 'agent.killed', {
    agent_type: agentType || data.agent_type || null,
    label: label || data.label || null,
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    gate_type: data.gate_type || null,
    session_key: data.session_key || null,
    attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id || null,
    has_changes: data.has_changes ?? (typeof graceful === 'boolean' ? graceful : null),
    duration_seconds: data.duration_seconds ?? null,
    files_changed: data.files_changed || null,
    reason: data.reason || null,
  });

  // Accumulate into ctx.stats for module-level summary
  if (ctx?.stats) {
    ctx.stats.inputTokens = (ctx.stats.inputTokens ?? 0) + (metaTokens.inputTokens ?? 0);
    ctx.stats.outputTokens = (ctx.stats.outputTokens ?? 0) + (metaTokens.outputTokens ?? 0);
  }
}

export function onPhaseStarted(ctx, moduleId, phase, model) {
  emitEventNonBlocking(ctx, 'phase.started', { module_id: moduleId, phase, model });
}

export function onPhaseCompleted(ctx, moduleId, phase) {
  emitEventNonBlocking(ctx, 'phase.completed', { module_id: moduleId, phase });
}

export function onRetryScheduled(ctx, moduleId, attemptOrData, maxFails) {
  const data = typeof attemptOrData === 'object'
    ? (attemptOrData || {})
    : { attempt: attemptOrData, max_attempts: maxFails, max_fails: maxFails };
  emitEventNonBlocking(ctx, 'retry.scheduled', {
    module_id: moduleId,
    attempt: data.attempt ?? null,
    max_attempts: data.max_attempts ?? data.max_fails ?? maxFails ?? null,
    delay_seconds: data.delay_seconds ?? null,
    reason: data.reason || null,
    dispatch_id: data.dispatch_id ?? null,
    gateway_label: data.gateway_label || data.label || null,
    session_key: data.session_key || null,
    max_fails: data.max_fails ?? maxFails ?? null,
  });
}

export function onRetryExhausted(ctx, moduleId, attemptOrData, maxFails) {
  const data = typeof attemptOrData === 'object'
    ? (attemptOrData || {})
    : { attempt: attemptOrData, max_attempts: maxFails, max_fails: maxFails };
  const gateId = data.gate_id ?? data.gateId ?? null;
  return emitEventNonBlocking(ctx, 'retry.exhausted', {
    module_id: data.module_id ?? data.moduleId ?? (gateId ? null : moduleId),
    gate_id: gateId,
    gate_type: gateId ? (data.gate_type ?? data.gateType ?? null) : undefined,
    attempt: data.attempt ?? data.attempts ?? null,
    phase: data.phase || null,
    dispatch_id: data.dispatch_id ?? null,
    gateway_label: data.gateway_label || data.label || null,
    session_key: data.session_key || null,
    reason: data.reason || null,
    max_attempts: data.max_attempts ?? data.max_fails ?? maxFails ?? null,
    max_fails: data.max_fails ?? maxFails ?? null,
  });
}

/**
 * Emit error.escalation.
 * @param {object} ctx
 * @param {string} scope - usually 'module' or 'gate', optionally another pipeline-owned step type
 * @param {string} scopeId
 * @param {string|object} reasonOrData - legacy: reason string; new: { action, last_failure, fail_count, step_type, step_id }
 * @param {number} exitCode
 */
export function onEscalated(ctx, scope, scopeId, reasonOrData, exitCode) {
  const data = typeof reasonOrData === 'string'
    ? { action: null, last_failure: reasonOrData, fail_count: null }
    : (reasonOrData || {});
  const stepType = data.step_type ?? data.stepType ?? null;
  const isGate = scope === 'gate' || stepType === 'gate';
  const isModule = scope === 'module' || stepType === 'module';
  const event = {
    exit_code: exitCode,
    module_id: data.module_id ?? (isModule ? (scopeId || null) : null),
    gate_id: data.gate_id ?? (isGate ? (scopeId || null) : null),
    gate_type: isGate ? (data.gate_type ?? null) : undefined,
    session_key: data.session_key ?? null,
    attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id ?? null,
    gateway_label: data.gateway_label || data.label || null,
    fail_count: data.fail_count ?? null,
    last_failure: data.last_failure || data.reason || null,
    action: data.action || null,
  };
  if (!isGate && !isModule) {
    const nonModuleStepType = stepType || scope || null;
    const nonModuleStepId = data.step_id ?? data.stepId ?? scopeId ?? null;
    if (nonModuleStepType) event.step_type = nonModuleStepType;
    if (nonModuleStepId) event.step_id = nonModuleStepId;
  }
  emitEventNonBlocking(ctx, 'error.escalation', event);
}

export function onSummaryStarted(ctx, summaryType, data = {}) {
  const payload = { ...(data || {}) };
  if (payload.gateway_label == null && payload.label != null) payload.gateway_label = payload.label;
  delete payload.label;
  emitEventNonBlocking(ctx, 'summary.started', { summary_type: summaryType, ...payload });
}

export function onSummaryCompleted(ctx, summaryType, data = {}) {
  const payload = { ...(data || {}) };
  if (payload.gateway_label == null && payload.label != null) payload.gateway_label = payload.label;
  delete payload.label;
  emitEventNonBlocking(ctx, 'summary.completed', { summary_type: summaryType, ...payload });
}

export function onBudgetWarning(ctx, threshold, current, limit, unit) {
  emitEventNonBlocking(ctx, 'budget.warning', {
    current_cost_usd: unit === 'usd' ? current : null,
    budget_usd: unit === 'usd' ? limit : null,
    percent_used: computePercentUsed(current, limit),
    threshold,
    current,
    limit,
    unit,
  });
}

export function onBudgetExceeded(ctx, threshold, current, limit, unit) {
  emitEventNonBlocking(ctx, 'budget.exceeded', {
    current_cost_usd: unit === 'usd' ? current : null,
    budget_usd: unit === 'usd' ? limit : null,
    percent_used: computePercentUsed(current, limit),
    threshold,
    current,
    limit,
    unit,
  });
}

export function onApprovalRequested(ctx, gateId, gateTitle, timeoutMinutes, timeoutPolicy, identity = {}) {
  emitEventNonBlocking(ctx, 'approval.requested', {
    approval_id: gateId,
    module_id: null,
    prompt: gateTitle
      ? `Approval required for gate ${gateTitle}`
      : `Approval required for gate ${gateId}`,
    options: ['APPROVE', 'REJECT'],
    gate_id: gateId,
    gate_type: identity.gate_type || identity.gateType || null,
    gate_title: gateTitle || null,
    timeout_minutes: timeoutMinutes ?? null,
    timeout_policy: normalizeApprovalTimeoutPolicy(timeoutPolicy),
  });
}

export function onApprovalResolved(ctx, gateId, status, decisionBy, identity = {}) {
  emitEventNonBlocking(ctx, 'approval.resolved', {
    approval_id: gateId,
    module_id: null,
    choice: status,
    resolved_by: decisionBy || null,
    gate_id: gateId,
    gate_type: identity.gate_type || identity.gateType || null,
    status,
    decision_by: decisionBy || null,
  });
}

// ── New event emitters ───────────────────────────────────────────────────────

/**
 * Emit cost.update after token accumulation.
 * @param {object} ctx
 * @param {object} data - { module_id, gate_id, tokens_in, tokens_out, model, estimated_cost_usd, cumulative_cost_usd }
 */
export function emitCostUpdate(ctx, data = {}) {
  const costUsd = data.cost_usd ?? data.estimated_cost_usd ?? null;
  const totalCostUsd = data.total_cost_usd ?? data.cumulative_cost_usd ?? null;
  const inputTokens = data.input_tokens ?? data.tokens_in ?? null;
  const outputTokens = data.output_tokens ?? data.tokens_out ?? null;

  emitEventNonBlocking(ctx, 'cost.update', {
    module_id: data.module_id || null,
    agent_type: data.agent_type || null,
    label: data.label || null,
    cost_usd: costUsd,
    total_cost_usd: totalCostUsd,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    gate_id: data.gate_id || null,
    model: data.model || null,
    estimated_cost_usd: data.estimated_cost_usd ?? costUsd,
    cumulative_cost_usd: data.cumulative_cost_usd ?? totalCostUsd,
    tokens_in: data.tokens_in ?? inputTokens,
    tokens_out: data.tokens_out ?? outputTokens,
  });
}

/**
 * Emit rate_limit.detected when a rate limit pause is triggered.
 * @param {object} ctx
 * @param {object} data - { agent_type, module_id, provider, pause_count, max_pauses, cooldown_ms, resume_at, detail }
 */
export function emitRateLimitDetected(ctx, data = {}) {
  emitEventNonBlocking(ctx, 'rate_limit.detected', {
    agent_type: data.agent_type || null,
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    gate_type: data.gate_id != null ? (data.gate_type ?? null) : undefined,
    gateway_label: data.gateway_label || data.label || null,
    session_key: data.session_key || null,
    attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id ?? null,
    provider: data.provider || 'anthropic',
    retry_after_seconds: data.retry_after_seconds
      ?? (typeof data.cooldown_ms === 'number' ? Math.round(data.cooldown_ms / 1000) : null),
    pause_count: data.pause_count ?? data.pause_number ?? null,
    max_pauses: data.max_pauses ?? null,
    cooldown_ms: data.cooldown_ms ?? null,
    resume_at: data.resume_at || null,
    detail: data.detail || null,
  });
}

/**
 * Emit observability.degraded when delivery or visibility is impaired.
 * @param {object} ctx
 * @param {object} data
 */
export function emitObservabilityDegraded(ctx, data = {}) {
  emitEventNonBlocking(ctx, 'observability.degraded', {
    component: data.component || null,
    surface: data.surface || null,
    reason: data.reason || null,
    detail: data.detail || null,
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    gate_type: data.gate_id != null ? (data.gate_type ?? null) : undefined,
    gateway_label: data.gateway_label || data.label || null,
    session_key: data.session_key || null,
    attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id || null,
    agent_type: data.agent_type || null,
    impacted_event_type: data.impacted_event_type || null,
    stream_key: data.stream_key || null,
    degraded_at: data.degraded_at || null,
  });
}

/**
 * Emit observability.restored after a prior degraded-visibility period ends.
 * @param {object} ctx
 * @param {object} data
 */
export function emitObservabilityRestored(ctx, data = {}) {
  emitEventNonBlocking(ctx, 'observability.restored', {
    component: data.component || null,
    surface: data.surface || null,
    reason: data.reason || null,
    detail: data.detail || null,
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    gate_type: data.gate_id != null ? (data.gate_type ?? null) : undefined,
    gateway_label: data.gateway_label || data.label || null,
    session_key: data.session_key || null,
    attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id || null,
    agent_type: data.agent_type || null,
    stream_key: data.stream_key || null,
    degraded_at: data.degraded_at || null,
    restored_at: data.restored_at || null,
    restored_after_ms: data.restored_after_ms ?? null,
  });
}

export function updateObservabilitySurface(ctx, state, data = {}, spec = {}) {
  const {
    isDegraded = false,
    component = 'acp_monitor',
    surface = null,
    reason = null,
    degradedDetail = null,
    restoredDetail = null,
    impactedEventType = null,
  } = spec;

  if (isDegraded && !state.active) {
    state.active = true;
    state.degradedAt = new Date().toISOString();
    emitObservabilityDegraded(ctx, {
      component,
      surface,
      reason,
      detail: degradedDetail,
      gateway_label: data.gateway_label || data.label || null,
      module_id: data.module_id || null,
      gate_id: data.gate_id || null,
      gate_type: data.gate_type || null,
      session_key: data.session_key || null,
      attempt: data.attempt ?? null,
      dispatch_id: data.dispatch_id || null,
      agent_type: data.agent_type || null,
      impacted_event_type: impactedEventType,
      stream_key: data.stream_key || null,
      degraded_at: state.degradedAt,
    });
    return;
  }

  if (!isDegraded && state.active) {
    const restoredAt = new Date().toISOString();
    emitObservabilityRestored(ctx, {
      component,
      surface,
      reason,
      detail: restoredDetail,
      gateway_label: data.gateway_label || data.label || null,
      module_id: data.module_id || null,
      gate_id: data.gate_id || null,
      gate_type: data.gate_type || null,
      session_key: data.session_key || null,
      attempt: data.attempt ?? null,
      dispatch_id: data.dispatch_id || null,
      agent_type: data.agent_type || null,
      stream_key: data.stream_key || null,
      degraded_at: state.degradedAt || null,
      restored_at: restoredAt,
      restored_after_ms: state.degradedAt ? Math.max(0, Date.now() - new Date(state.degradedAt).getTime()) : null,
    });
    state.active = false;
    state.degradedAt = null;
  }
}

export function updateGatewayObservability(ctx, state, data = {}) {
  return updateObservabilitySurface(ctx, state, data, {
    isDegraded: data.gateway_unreachable === true || data.session_state === 'unreachable',
    surface: 'gateway',
    reason: 'gateway_unreachable',
    degradedDetail: data.gateway_detail || data.detail || 'session status unreachable',
    restoredDetail: 'session status reachable again',
  });
}

export function updateTranscriptObservability(ctx, state, data = {}) {
  const transcriptDetail = data.transcript_detail || data.detail || null;
  const isDegraded = typeof transcriptDetail === 'string' && transcriptDetail.startsWith('transcript-read-failed:');
  return updateObservabilitySurface(ctx, state, data, {
    isDegraded,
    surface: 'transcript',
    reason: 'transcript_read_failed',
    degradedDetail: transcriptDetail || 'transcript unreadable',
    restoredDetail: 'transcript readable again',
    impactedEventType: 'agent.transcript',
  });
}

export function updateRedisCompletionObservability(ctx, state, data = {}) {
  const isDegraded = data.redis_unavailable === true || data.completion_read_failed === true;
  return updateObservabilitySurface(ctx, state, data, {
    isDegraded,
    component: 'redis_completion',
    surface: 'completion_stream',
    reason: 'completion_read_failed',
    degradedDetail: data.detail || 'redis completion stream unreadable',
    restoredDetail: 'redis completion stream readable again',
  });
}

/**
 * Emit agent.transcript for a live transcript line or batch.
 * @param {object} ctx
 * @param {object} data - { agent_type, label, module_id, line_kind, text, transcript_offset, line_count }
 */
export function emitTranscriptLine(ctx, data = {}) {
  emitEventNonBlocking(ctx, 'agent.transcript', {
    agent_type: data.agent_type || null,
    label: data.label || null,
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    gate_type: data.gate_id != null ? (data.gate_type ?? null) : undefined,
    session_key: data.session_key || null,
    dispatch_id: data.dispatch_id ?? null,
    line_kind: data.line_kind || 'info',
    text: data.text || '',
    transcript_offset: data.transcript_offset ?? null,
    line_count: data.line_count ?? null,
  });
}

/**
 * Emit agent.progress summary during a long-running session.
 * @param {object} ctx
 * @param {object} data - { agent_type, label, module_id, elapsed_seconds, transcript_events, files_touched, last_activity, status }
 */
export function emitAgentProgress(ctx, data = {}) {
  emitEventNonBlocking(ctx, 'agent.progress', {
    agent_type: data.agent_type || null,
    label: data.label || null,
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    gate_type: data.gate_id != null ? (data.gate_type ?? null) : undefined,
    session_key: data.session_key || null,
    dispatch_id: data.dispatch_id ?? null,
    elapsed_seconds: data.elapsed_seconds ?? null,
    transcript_events: data.transcript_events ?? null,
    files_touched: data.files_touched || null,
    last_activity: data.last_activity || null,
    status: data.status || 'active',
  });
}

/**
 * Close the telemetry Redis connection gracefully.
 * Non-blocking — logs but does not throw on failure.
 * Safe to call even if Redis was never connected.
 */
export async function closeTelemetryRedis() {
  await closeTelemetryStreamRedis();
}
