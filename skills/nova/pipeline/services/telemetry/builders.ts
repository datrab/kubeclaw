import { getRunStats } from '../../core/runtime.ts';
import { recordObservabilityDegraded, recordObservabilityRestored } from '../observability.ts';
import { emitEvent, emitEventNonBlocking } from './dispatch.ts';

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

function mapPipelineTerminalSnapshotStatus(terminalStatus) {
  if (terminalStatus === 'succeeded') return 'PASS';
  if (terminalStatus === 'blocked') return 'BLOCKED';
  if (terminalStatus === 'timed_out') return 'TIMEOUT';
  if (terminalStatus === 'rate_limited') return 'RATE_LIMITED';
  return 'FAIL';
}

// ── Convenience wrappers ────────────────────────────────────────────────────

/**
 * Emit pipeline.started.
 * @param {object} ctx
 * @param {object} progress - progress object
 */
export function onPipelineStarted(ctx: any, progress: any = null, options: any = {}) {
  const config = ctx?.config;

  const payload = {};
  if (progress && typeof progress === 'object') {
    const effectiveModels = progress.defaults?.models && typeof progress.defaults.models === 'object'
      ? { ...progress.defaults.models }
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
  }

  return emitEvent(ctx, 'pipeline.started', payload, {
    stateSnapshot: { status: 'IN_PROGRESS' },
    presentation: options.presentation || {},
  });
}

/**
 * @param {object} ctx
 * @param {string} terminalStatus
 * @param {string} [reasonCode]
 * @param {object} [summary] - { duration_seconds, modules_passed, modules_failed, cost_usd }
 */
export function onPipelineCompleted(ctx, terminalStatus, reasonCode, summary = {}, options = {}) {
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
    terminal_status: terminalStatus || 'succeeded',
    reason_code: reasonCode || null,
    duration_seconds: durationSeconds,
    modules_passed: modulesPassed,
    modules_failed: modulesFailed,
    modules_total: modulesTotal,
    total_cost_usd: totalCostUsd,
  };

  return emitEvent(ctx, 'pipeline.completed', payload, {
    stateSnapshot: { status: mapPipelineTerminalSnapshotStatus(payload.terminal_status) },
    presentation: options.presentation || {},
  });
}

export function onPipelineHalted(ctx, data = {}) {
  data = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const stepId = data.step_id ?? data.stepId ?? null;
  const stepType = data.step_type ?? data.stepType ?? null;
  const isGate = data.gate_id != null || stepType === 'gate';
  const isModule = data.module_id != null || stepType === 'module';
  const event = {
    reason: data.reason || 'UNKNOWN',
    module_id: data.module_id ?? (isModule ? (stepId || null) : null),
    gate_id: data.gate_id ?? (isGate ? (stepId || null) : null),
    gate_type: isGate ? (data.gate_type ?? null) : undefined,
    session_key: data.session_key ?? null,
    attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id ?? null,
    gateway_label: data.gateway_label ?? null,
    terminal_status: data.terminal_status ?? null,
    terminal_decision: data.terminal_decision ?? null,
    ...(data.reason === 'RATE_LIMITED' ? {
      rate_limit_exhausted: data.rate_limit_exhausted === true,
      max_rate_limit_pauses: data.max_rate_limit_pauses ?? null,
    } : {}),
  };
  if (stepType && stepType !== 'module' && stepType !== 'gate') event.step_type = stepType;
  if (stepId && stepType && stepType !== 'module' && stepType !== 'gate') event.step_id = stepId;
  emitEventNonBlocking(ctx, 'pipeline.halted', event);
}

export function onModuleStarted(ctx, moduleId, model, attempt, options = {}) {
  return emitEvent(ctx, 'module.started', { module_id: moduleId, model, attempt }, {
    moduleId,
    attempt,
    stateSnapshot: { status: 'IN_PROGRESS' },
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
    gateway_label: data.gateway_label ?? null,
    phase: data.phase || null,
    model: data.model || null,
    session_key: data.session_key ?? null,
    duration_seconds: data.duration_seconds ?? null,
    cost_estimate_usd: data.cost_estimate_usd ?? null,
    commit_hash: data.commit_hash || null,
    reason: data.reason || null,
  };

  if (payload.new_status === 'PASS' || payload.new_status === 'FAIL' || payload.new_status === 'BLOCKED') {
    return emitEvent(ctx, 'module.status_changed', payload, {
      moduleId,
      attempt: payload.attempt,
      stateSnapshot: { status: payload.new_status },
      presentation: data.presentation || {},
    });
  }

  return emitEventNonBlocking(ctx, 'module.status_changed', payload);
}

/**
 * Emit module.status_changed with new_status="PASS".
 * @param {object} ctx
 * @param {string} moduleId
 * @param {object} data - enriched telemetry payload
 */
export function onModulePass(ctx, moduleId, data = {}) {
  return onModuleStatusChanged(ctx, moduleId, {
    ...data,
    new_status: 'PASS',
  });
}

/**
 * Emit module.status_changed with new_status="FAIL".
 * @param {object} ctx
 * @param {string} moduleId
 * @param {object} data - enriched telemetry payload
 */
export function onModuleFail(ctx, moduleId, data = {}) {
  return onModuleStatusChanged(ctx, moduleId, {
    ...data,
    new_status: 'FAIL',
  });
}

/**
 * Emit module.status_changed with new_status="BLOCKED".
 * @param {object} ctx
 * @param {string} moduleId
 * @param {object} data - enriched telemetry payload
 */
export function onModuleBlocked(ctx, moduleId, data = {}) {
  return onModuleStatusChanged(ctx, moduleId, {
    ...data,
    new_status: 'BLOCKED',
  });
}

/**
 * Emit gate.started.
 * @param {object} ctx
 * @param {string} gateId
 * @param {object} gate - gate config object
 */
export function onGateStarted(ctx, gateId, gate = {}, options = {}) {
  const payload = {
    gate_id: gateId,
    gate_type: gate.type || null,
    title: gate.title || null,
    reviewers: gate.reviewers || null,
  };
  return emitEvent(ctx, 'gate.started', payload, {
    gateId,
    gateType: payload.gate_type || null,
    stateSnapshot: { status: 'IN_PROGRESS' },
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

  return emitEvent(ctx, 'gate.verdict', payload, {
    gateId,
    gateType: payload.gate_type || null,
    attempt: data.attempt ?? null,
    stateSnapshot: { verdict: 'GO', status: 'PASS' },
    presentation: data.presentation || {},
  });
}

/**
 * Emit gate.verdict with verdict="NO-GO".
 * @param {object} ctx
 * @param {string} gateId
 * @param {object} data - enriched telemetry payload
 */
export function onGateFail(ctx, gateId, data = {}) {
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
    gateway_label: data.gateway_label ?? null,
    session_key: data.session_key || null,
  };

  return emitEvent(ctx, 'gate.verdict', payload, {
    gateId,
    gateType: payload.gate_type || null,
    attempt: payload.attempt,
    stateSnapshot: { verdict: 'NO-GO', status: 'FAIL' },
    presentation: data.presentation || {},
  });
}

/**
 * Emit agent.spawned.
 * @param {object} ctx
 * @param {string} agentType
 * @param {object} data - enriched telemetry payload
 */
export function onAgentSpawned(ctx, agentType, data = {}) {
  if (agentType && !data.agent_type) data = { agent_type: agentType, ...data };

  emitEventNonBlocking(ctx, 'agent.spawned', {
    agent_type: data.agent_type || agentType || null,
    label: data.label || null,
    model: data.model || null,
    dispatch: data.dispatch || null,
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    gate_type: data.gate_type || null,
    substep: data.substep || null,
    attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id || null,
    timeout_minutes: data.timeout_minutes ?? null,
    session_key: data.session_key || null,
    thinking_level: data.thinking_level || null,
  });
}

/**
 * Emit agent.killed and accumulate tokens into ctx.stats.
 * @param {object} ctx
 * @param {string} agentType
 * @param {object} data - enriched telemetry payload
 */
export function onAgentKilled(ctx, agentType, data = {}) {
  const metaTokens = data || {};

  emitEventNonBlocking(ctx, 'agent.killed', {
    agent_type: agentType || data.agent_type || null,
    label: data.label || null,
    module_id: data.module_id || null,
    gate_id: data.gate_id || null,
    gate_type: data.gate_type || null,
    session_key: data.session_key || null,
    attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id || null,
    has_changes: data.has_changes ?? null,
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

export function onRetryScheduled(ctx, moduleId, data = {}) {
  emitEventNonBlocking(ctx, 'retry.scheduled', {
    module_id: moduleId,
    attempt: data.attempt ?? null,
    max_attempts: data.max_attempts ?? data.max_fails ?? null,
    delay_seconds: data.delay_seconds ?? null,
    reason: data.reason || null,
    dispatch_id: data.dispatch_id ?? null,
    gateway_label: data.gateway_label ?? null,
    session_key: data.session_key || null,
    max_fails: data.max_fails ?? null,
  });
}

export function onRetryExhausted(ctx, moduleId, data = {}) {
  const gateId = data.gate_id ?? data.gateId ?? null;
  return emitEventNonBlocking(ctx, 'retry.exhausted', {
    module_id: data.module_id ?? data.moduleId ?? (gateId ? null : moduleId),
    gate_id: gateId,
    gate_type: gateId ? (data.gate_type ?? data.gateType ?? null) : undefined,
    attempt: data.attempt ?? data.attempts ?? null,
    phase: data.phase || null,
    dispatch_id: data.dispatch_id ?? null,
    gateway_label: data.gateway_label ?? null,
    session_key: data.session_key || null,
    reason: data.reason || null,
    max_attempts: data.max_attempts ?? data.max_fails ?? null,
    max_fails: data.max_fails ?? null,
  });
}

/**
 * Emit error.escalation.
 * @param {object} ctx
 * @param {string} scope - usually 'module' or 'gate', optionally another pipeline-owned step type
 * @param {string} scopeId
 * @param {object} data - { action, last_failure, fail_count, step_type, step_id, terminal_status }
 */
export function onEscalated(ctx, scope, scopeId, data = {}) {
  const stepType = data.step_type ?? data.stepType ?? null;
  const isGate = scope === 'gate' || stepType === 'gate';
  const isModule = scope === 'module' || stepType === 'module';
  const event = {
    terminal_status: data.terminal_status ?? null,
    terminal_decision: data.terminal_decision ?? null,
    module_id: data.module_id ?? (isModule ? (scopeId || null) : null),
    gate_id: data.gate_id ?? (isGate ? (scopeId || null) : null),
    gate_type: isGate ? (data.gate_type ?? null) : undefined,
    session_key: data.session_key ?? null,
    attempt: data.attempt ?? null,
    dispatch_id: data.dispatch_id ?? null,
    gateway_label: data.gateway_label ?? null,
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
  return emitEventNonBlocking(ctx, 'summary.completed', { summary_type: summaryType, ...payload });
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
    gateway_label: data.gateway_label ?? null,
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
  return recordObservabilityDegraded(ctx, data);
}

/**
 * Emit observability.restored after a prior degraded-visibility period ends.
 * @param {object} ctx
 * @param {object} data
 */
export function emitObservabilityRestored(ctx, data = {}) {
  return recordObservabilityRestored(ctx, data);
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
      gateway_label: data.gateway_label ?? null,
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
      gateway_label: data.gateway_label ?? null,
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
  return updateObservabilitySurface(ctx, state, data, {
    isDegraded: data.redis_unavailable === true,
    component: 'redis_completion',
    surface: 'completion_stream',
    reason: 'completion_stream_unavailable',
    degradedDetail: data.detail || 'redis completion stream unavailable',
    restoredDetail: 'redis completion stream available again',
  });
}
