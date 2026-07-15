import { getRunId, getRunStats } from '../../core/runtime.ts';
import { recordObservabilityDegraded, recordObservabilityRestored } from '../observability.ts';
import { emitEvent, emitEventNonBlocking } from './dispatch.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
const PIPELINE_COMPLETED_STATUS = 'succeeded';
const PIPELINE_HALTED_REASON_MISSING = 'reason_missing';
const GATE_FAILURE_OPERATOR_ACTION = 'stop';
const RATE_LIMIT_PROVIDER_MISSING = 'provider_missing';
const GATEWAY_UNREACHABLE_DETAIL = 'session status unreachable';
const TRANSCRIPT_UNREADABLE_DETAIL = 'transcript unreadable';
const REDIS_COMPLETION_UNAVAILABLE_DETAIL = 'redis completion stream unavailable';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function selectPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function sumModuleTotals(modulesPassed, modulesFailed, modulesBlocked) {
  if (typeof modulesPassed === 'number' && typeof modulesFailed === 'number' && typeof modulesBlocked === 'number') {
    return modulesPassed + modulesFailed + modulesBlocked;
  }
  return null;
}

function elapsedSecondsSince(startedAt) {
  if (!startedAt) return null;
  return Math.max(0, Math.round((Date.now() - startedAt) / 1000));
}

function rateLimitRetryAfterSeconds(data) {
  if (data.retry_after_seconds !== undefined && data.retry_after_seconds !== null) return data.retry_after_seconds;
  return typeof data.cooldown_ms === 'number' ? Math.round(data.cooldown_ms / 1000) : null;
}

function observabilityIsDegraded(data) {
  return selectTruthyValue(() => (data.gateway_unreachable === true), () => (data.session_state === 'unreachable'));
}

function normalizedUpperText(value) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  return String(value).trim().toUpperCase();
}

function computePercentUsed(current, limit) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (typeof current !== 'number'), () => (typeof limit !== 'number'))), () => (!Number.isFinite(current)))), () => (!Number.isFinite(limit)))), () => (limit === 0))) {
    return null;
  }
  return Number(((current / limit) * 100).toFixed(2));
}

function normalizeApprovalTimeoutPolicy(value) {
  const normalized = normalizedUpperText(value);
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

    payload.modules = Object.entries(selectDefinedValue(() => (objectRecord(progress.modules)), () => ({}))).map(([id, m]) => ({
      id,
      title: m.title,
      dir: m.dir,
      depends_on: arrayValue(m.depends_on),
    }));
    payload.gates = Object.entries(selectDefinedValue(() => (objectRecord(progress.gates)), () => ({}))).map(([id, g]) => ({
      id,
      type: g.type,
      title: g.title,
    }));
    payload.execution_order = arrayValue(progress.execution_order);
    payload.models = effectiveModels;
    payload.resume = !!(config?.resume);
    payload.nova_prompt = selectTruthyValue(() => (config?.nova_prompt), () => (null));
  }

  return emitEvent(ctx, 'pipeline.started', payload, {
    stateSnapshot: { status: 'IN_PROGRESS' },
    presentation: selectDefinedValue(() => (objectRecord(options.presentation)), () => ({})),
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
  const modulesPassed = summary?.modules_passed
  const modulesFailed = summary?.modules_failed
  const modulesBlocked = summary?.modules_blocked
  const modulesTotal = selectDefinedValue(() => (summary?.modules_total), () => (sumModuleTotals(modulesPassed, modulesFailed, modulesBlocked)));
  const durationSeconds = selectDefinedValue(() => (summary?.duration_seconds), () => (elapsedSecondsSince(startedAt)));
  const totalCostUsd = selectDefinedValue(() => (summary?.total_cost_usd), () => (null));

  const payload = {
    terminal_status: selectDefinedValue(() => (terminalStatus), () => (PIPELINE_COMPLETED_STATUS)),
    reason_code: selectTruthyValue(() => (reasonCode), () => (null)),
    duration_seconds: durationSeconds,
    modules_passed: modulesPassed,
    modules_failed: modulesFailed,
    modules_total: modulesTotal,
    total_cost_usd: totalCostUsd,
  };

  return emitEvent(ctx, 'pipeline.completed', payload, {
    stateSnapshot: { status: mapPipelineTerminalSnapshotStatus(payload.terminal_status) },
    presentation: selectDefinedValue(() => (objectRecord(options.presentation)), () => ({})),
  });
}

export function onPipelineHalted(ctx, data = {}) {
  data = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const stepId = selectDefinedValue(() => (selectDefinedValue(() => (data.step_id), () => (data.stepId))), () => (null));
  const stepType = selectDefinedValue(() => (selectDefinedValue(() => (data.step_type), () => (data.stepType))), () => (null));
  const isGate = selectTruthyValue(() => (data.gate_id != null), () => (stepType === 'gate'));
  const isModule = selectTruthyValue(() => (data.module_id != null), () => (stepType === 'module'));
  const event = {
    reason: selectDefinedValue(() => (data.reason), () => (PIPELINE_HALTED_REASON_MISSING)),
    module_id: selectDefinedValue(() => (data.module_id), () => ((isModule ? (selectTruthyValue(() => (stepId), () => (null))) : null))),
    gate_id: selectDefinedValue(() => (data.gate_id), () => ((isGate ? (selectTruthyValue(() => (stepId), () => (null))) : null))),
    gate_type: isGate ? (selectDefinedValue(() => (data.gate_type), () => (null))) : undefined,
    session_key: selectDefinedValue(() => (data.session_key), () => (null)),
    attempt: selectDefinedValue(() => (data.attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (data.dispatch_id), () => (null)),
    gateway_label: selectDefinedValue(() => (data.gateway_label), () => (null)),
    terminal_status: selectDefinedValue(() => (data.terminal_status), () => (null)),
    terminal_decision: selectDefinedValue(() => (data.terminal_decision), () => (null)),
    ...(data.reason === 'RATE_LIMITED' ? {
      rate_limit_exhausted: data.rate_limit_exhausted === true,
      max_rate_limit_pauses: selectDefinedValue(() => (data.max_rate_limit_pauses), () => (null)),
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
    presentation: selectDefinedValue(() => (objectRecord(options.presentation)), () => ({})),
  });
}

export function onModuleStatusChanged(ctx, moduleId, data = {}) {
  const payload = {
    module_id: moduleId,
    title: selectTruthyValue(() => (data.title), () => (null)),
    old_status: selectTruthyValue(() => (data.old_status), () => (null)),
    new_status: selectTruthyValue(() => (data.new_status), () => (null)),
    attempt: selectDefinedValue(() => (data.attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (data.dispatch_id), () => (null)),
    gateway_label: selectDefinedValue(() => (data.gateway_label), () => (null)),
    phase: selectTruthyValue(() => (data.phase), () => (null)),
    model: selectTruthyValue(() => (data.model), () => (null)),
    session_key: selectDefinedValue(() => (data.session_key), () => (null)),
    duration_seconds: selectDefinedValue(() => (data.duration_seconds), () => (null)),
    cost_estimate_usd: selectDefinedValue(() => (data.cost_estimate_usd), () => (null)),
    commit_hash: selectTruthyValue(() => (data.commit_hash), () => (null)),
    reason: selectTruthyValue(() => (data.reason), () => (null)),
  };

  if (selectTruthyValue(() => (selectTruthyValue(() => (payload.new_status === 'PASS'), () => (payload.new_status === 'FAIL'))), () => (payload.new_status === 'BLOCKED'))) {
    return emitEvent(ctx, 'module.status_changed', payload, {
      moduleId,
      attempt: payload.attempt,
      stateSnapshot: { status: payload.new_status },
      presentation: selectDefinedValue(() => (objectRecord(data.presentation)), () => ({})),
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
    gate_type: selectTruthyValue(() => (gate.type), () => (null)),
    title: selectTruthyValue(() => (gate.title), () => (null)),
    reviewers: selectTruthyValue(() => (gate.reviewers), () => (null)),
  };
  return emitEvent(ctx, 'gate.started', payload, {
    gateId,
    gateType: selectTruthyValue(() => (payload.gate_type), () => (null)),
    stateSnapshot: { status: 'IN_PROGRESS' },
    presentation: selectDefinedValue(() => (objectRecord(options.presentation)), () => ({})),
  });
}

/**
 * Emit gate.verdict with verdict="PASS".
 * @param {object} ctx
 * @param {string} gateId
 * @param {object} [data] - { gate_type, issues_count, blockers_count, fix_cycle, duration_seconds }
 */
export function onGatePass(ctx, gateId, data = {}) {
  const payload = {
    run_id: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (data.run_id), () => (getRunId(selectTruthyValue(() => (ctx?.config), () => ({})))))), () => (ctx?.runId))), () => (null)),
    gate_id: gateId,
    gate_type: selectTruthyValue(() => (data.gate_type), () => (null)),
    verdict: 'PASS',
    issues_count: selectDefinedValue(() => (data.issues_count), () => (null)),
    blockers_count: selectDefinedValue(() => (data.blockers_count), () => (null)),
    fix_cycle: selectDefinedValue(() => (data.fix_cycle), () => (null)),
    duration_seconds: selectDefinedValue(() => (data.duration_seconds), () => (null)),
    dispatch_id: selectDefinedValue(() => (data.dispatch_id), () => (null)),
    gateway_label: selectDefinedValue(() => (data.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (data.session_key), () => (null)),
  };

  return emitEvent(ctx, 'gate.verdict', payload, {
    gateId,
    gateType: selectTruthyValue(() => (payload.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (data.attempt), () => (null)),
    stateSnapshot: { verdict: 'PASS', status: 'PASS' },
    presentation: selectDefinedValue(() => (objectRecord(data.presentation)), () => ({})),
  });
}

/**
 * Emit gate.verdict with verdict="FAIL".
 * @param {object} ctx
 * @param {string} gateId
 * @param {object} data - enriched telemetry payload
 */
export function onGateFail(ctx, gateId, data = {}) {
  const gatewayLabel = selectDefinedValue(() => (data.gateway_label), () => (null));
  const presentation = data.presentation && typeof data.presentation === 'object' && !Array.isArray(data.presentation)
    ? { ...data.presentation }
    : {};
  if (presentation.discord && typeof presentation.discord === 'object' && !Array.isArray(presentation.discord)) {
    const discordPresentation = presentation.discord;
    const action = selectPresentValue(
      discordPresentation.action,
      discordPresentation.next_action,
      discordPresentation.nextAction,
      data.action,
      data.next_action,
      data.nextAction,
      data.operator_action,
      GATE_FAILURE_OPERATOR_ACTION,
    );
    presentation.discord = {
      ...discordPresentation,
      action,
      next_action: selectPresentValue(discordPresentation.next_action, discordPresentation.nextAction, action),
    };
  }
  const payload = {
    run_id: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (data.run_id), () => (getRunId(selectTruthyValue(() => (ctx?.config), () => ({})))))), () => (ctx?.runId))), () => (null)),
    gate_id: gateId,
    gate_type: selectTruthyValue(() => (data.gate_type), () => (null)),
    verdict: 'FAIL',
    issues_count: selectDefinedValue(() => (data.issues_count), () => (null)),
    blockers_count: selectDefinedValue(() => (data.blockers_count), () => (null)),
    fix_cycle: selectDefinedValue(() => (data.fix_cycle), () => (null)),
    duration_seconds: selectDefinedValue(() => (data.duration_seconds), () => (null)),
    attempt: selectDefinedValue(() => (data.attempt), () => (null)),
    reason: selectTruthyValue(() => (data.reason), () => (null)),
    dispatch_id: selectDefinedValue(() => (data.dispatch_id), () => (null)),
    gateway_label: gatewayLabel,
    session_key: selectTruthyValue(() => (data.session_key), () => (null)),
  };

  return emitEvent(ctx, 'gate.verdict', payload, {
    gateId,
    gateType: selectTruthyValue(() => (payload.gate_type), () => (null)),
    attempt: payload.attempt,
    stateSnapshot: { verdict: 'FAIL', status: 'FAIL' },
    presentation,
  });
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
    attempt: selectDefinedValue(() => (data.attempt), () => (null)),
    max_attempts: selectDefinedValue(() => (selectDefinedValue(() => (data.max_attempts), () => (data.max_fails))), () => (null)),
    delay_seconds: selectDefinedValue(() => (data.delay_seconds), () => (null)),
    reason: selectTruthyValue(() => (data.reason), () => (null)),
    dispatch_id: selectDefinedValue(() => (data.dispatch_id), () => (null)),
    gateway_label: selectDefinedValue(() => (data.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (data.session_key), () => (null)),
    max_fails: selectDefinedValue(() => (data.max_fails), () => (null)),
  });
}

export function onRetryExhausted(ctx, moduleId, data = {}) {
  const gateId = selectDefinedValue(() => (selectDefinedValue(() => (data.gate_id), () => (data.gateId))), () => (null));
  return emitEventNonBlocking(ctx, 'retry.exhausted', {
    module_id: firstDefined(data.module_id, data.moduleId, gateId ? null : moduleId),
    gate_id: gateId,
    gate_type: gateId ? (selectDefinedValue(() => (selectDefinedValue(() => (data.gate_type), () => (data.gateType))), () => (null))) : undefined,
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (data.attempt), () => (data.attempts))), () => (null)),
    phase: selectTruthyValue(() => (data.phase), () => (null)),
    dispatch_id: selectDefinedValue(() => (data.dispatch_id), () => (null)),
    gateway_label: selectDefinedValue(() => (data.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (data.session_key), () => (null)),
    reason: selectTruthyValue(() => (data.reason), () => (null)),
    max_attempts: selectDefinedValue(() => (selectDefinedValue(() => (data.max_attempts), () => (data.max_fails))), () => (null)),
    max_fails: selectDefinedValue(() => (data.max_fails), () => (null)),
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
  const stepType = selectDefinedValue(() => (selectDefinedValue(() => (data.step_type), () => (data.stepType))), () => (null));
  const isGate = selectTruthyValue(() => (scope === 'gate'), () => (stepType === 'gate'));
  const isModule = selectTruthyValue(() => (scope === 'module'), () => (stepType === 'module'));
  const event = {
    terminal_status: selectDefinedValue(() => (data.terminal_status), () => (null)),
    terminal_decision: selectDefinedValue(() => (data.terminal_decision), () => (null)),
    module_id: selectDefinedValue(() => (data.module_id), () => ((isModule ? (selectTruthyValue(() => (scopeId), () => (null))) : null))),
    gate_id: selectDefinedValue(() => (data.gate_id), () => ((isGate ? (selectTruthyValue(() => (scopeId), () => (null))) : null))),
    gate_type: isGate ? (selectDefinedValue(() => (data.gate_type), () => (null))) : undefined,
    session_key: selectDefinedValue(() => (data.session_key), () => (null)),
    attempt: selectDefinedValue(() => (data.attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (data.dispatch_id), () => (null)),
    gateway_label: selectDefinedValue(() => (data.gateway_label), () => (null)),
    fail_count: selectDefinedValue(() => (data.fail_count), () => (null)),
    last_failure: selectTruthyValue(() => (selectTruthyValue(() => (data.last_failure), () => (data.reason))), () => (null)),
    action: selectTruthyValue(() => (data.action), () => (null)),
  };
  if (!isGate && !isModule) {
    const nonModuleStepType = selectTruthyValue(() => (selectTruthyValue(() => (stepType), () => (scope))), () => (null));
    const nonModuleStepId = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (data.step_id), () => (data.stepId))), () => (scopeId))), () => (null));
    if (nonModuleStepType) event.step_type = nonModuleStepType;
    if (nonModuleStepId) event.step_id = nonModuleStepId;
  }
  emitEventNonBlocking(ctx, 'error.escalation', event);
}

export function onSummaryStarted(ctx, summaryType, data = {}) {
  const payload = { ...(selectDefinedValue(() => (objectRecord(data)), () => ({}))) };
  if (payload.gateway_label == null && payload.label != null) payload.gateway_label = payload.label;
  delete payload.label;
  emitEventNonBlocking(ctx, 'summary.started', { summary_type: summaryType, ...payload });
}

export function onSummaryCompleted(ctx, summaryType, data = {}) {
  const payload = { ...(selectDefinedValue(() => (objectRecord(data)), () => ({}))) };
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
    gate_type: selectTruthyValue(() => (selectTruthyValue(() => (identity.gate_type), () => (identity.gateType))), () => (null)),
    gate_title: selectTruthyValue(() => (gateTitle), () => (null)),
    timeout_minutes: selectDefinedValue(() => (timeoutMinutes), () => (null)),
    timeout_policy: normalizeApprovalTimeoutPolicy(timeoutPolicy),
  });
}

export function onApprovalResolved(ctx, gateId, status, decisionBy, identity = {}) {
  emitEventNonBlocking(ctx, 'approval.resolved', {
    approval_id: gateId,
    module_id: null,
    choice: status,
    resolved_by: selectTruthyValue(() => (decisionBy), () => (null)),
    gate_id: gateId,
    gate_type: selectTruthyValue(() => (selectTruthyValue(() => (identity.gate_type), () => (identity.gateType))), () => (null)),
    status,
    decision_by: selectTruthyValue(() => (decisionBy), () => (null)),
  });
}

// ── New event emitters ───────────────────────────────────────────────────────

/**
 * Emit cost.update after token accumulation.
 * @param {object} ctx
 * @param {object} data - { module_id, gate_id, tokens_in, tokens_out, model, estimated_cost_usd, cumulative_cost_usd }
 */
export function emitCostUpdate(ctx, data = {}) {
  const costUsd = selectDefinedValue(() => (data.cost_usd), () => (null));
  const totalCostUsd = selectDefinedValue(() => (data.total_cost_usd), () => (null));
  const inputTokens = selectDefinedValue(() => (data.input_tokens), () => (null));
  const outputTokens = selectDefinedValue(() => (data.output_tokens), () => (null));

  emitEventNonBlocking(ctx, 'cost.update', {
    module_id: selectTruthyValue(() => (data.module_id), () => (null)),
    agent_type: selectTruthyValue(() => (data.agent_type), () => (null)),
    label: selectTruthyValue(() => (data.label), () => (null)),
    cost_usd: costUsd,
    total_cost_usd: totalCostUsd,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    gate_id: selectTruthyValue(() => (data.gate_id), () => (null)),
    model: selectTruthyValue(() => (data.model), () => (null)),
    estimated_cost_usd: firstDefined(data.estimated_cost_usd, costUsd),
    cumulative_cost_usd: firstDefined(data.cumulative_cost_usd, totalCostUsd),
    tokens_in: firstDefined(data.tokens_in, inputTokens),
    tokens_out: firstDefined(data.tokens_out, outputTokens),
  });
}

/**
 * Emit rate_limit.detected when a rate limit pause is triggered.
 * @param {object} ctx
 * @param {object} data - { agent_type, module_id, provider, pause_count, max_pauses, cooldown_ms, resume_at, detail }
 */
export function emitRateLimitDetected(ctx, data = {}) {
  emitEventNonBlocking(ctx, 'rate_limit.detected', {
    agent_type: selectTruthyValue(() => (data.agent_type), () => (null)),
    module_id: selectTruthyValue(() => (data.module_id), () => (null)),
    gate_id: selectTruthyValue(() => (data.gate_id), () => (null)),
    gate_type: data.gate_id != null ? (selectDefinedValue(() => (data.gate_type), () => (null))) : undefined,
    gateway_label: selectDefinedValue(() => (data.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (data.session_key), () => (null)),
    attempt: selectDefinedValue(() => (data.attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (data.dispatch_id), () => (null)),
    provider: selectDefinedValue(() => (data.provider), () => (RATE_LIMIT_PROVIDER_MISSING)),
    retry_after_seconds: rateLimitRetryAfterSeconds(data),
    pause_count: selectDefinedValue(() => (selectDefinedValue(() => (data.pause_count), () => (data.pause_number))), () => (null)),
    max_pauses: selectDefinedValue(() => (data.max_pauses), () => (null)),
    cooldown_ms: selectDefinedValue(() => (data.cooldown_ms), () => (null)),
    resume_at: selectTruthyValue(() => (data.resume_at), () => (null)),
    detail: selectTruthyValue(() => (data.detail), () => (null)),
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
      gateway_label: selectDefinedValue(() => (data.gateway_label), () => (null)),
      module_id: selectTruthyValue(() => (data.module_id), () => (null)),
      gate_id: selectTruthyValue(() => (data.gate_id), () => (null)),
      gate_type: selectTruthyValue(() => (data.gate_type), () => (null)),
      session_key: selectTruthyValue(() => (data.session_key), () => (null)),
      attempt: selectDefinedValue(() => (data.attempt), () => (null)),
      dispatch_id: selectTruthyValue(() => (data.dispatch_id), () => (null)),
      agent_type: selectTruthyValue(() => (data.agent_type), () => (null)),
      impacted_event_type: impactedEventType,
      stream_key: selectTruthyValue(() => (data.stream_key), () => (null)),
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
      gateway_label: selectDefinedValue(() => (data.gateway_label), () => (null)),
      module_id: selectTruthyValue(() => (data.module_id), () => (null)),
      gate_id: selectTruthyValue(() => (data.gate_id), () => (null)),
      gate_type: selectTruthyValue(() => (data.gate_type), () => (null)),
      session_key: selectTruthyValue(() => (data.session_key), () => (null)),
      attempt: selectDefinedValue(() => (data.attempt), () => (null)),
      dispatch_id: selectTruthyValue(() => (data.dispatch_id), () => (null)),
      agent_type: selectTruthyValue(() => (data.agent_type), () => (null)),
      stream_key: selectTruthyValue(() => (data.stream_key), () => (null)),
      degraded_at: selectTruthyValue(() => (state.degradedAt), () => (null)),
      restored_at: restoredAt,
      restored_after_ms: state.degradedAt ? Math.max(0, Date.now() - new Date(state.degradedAt).getTime()) : null,
    });
    state.active = false;
    state.degradedAt = null;
  }
}

export function updateGatewayObservability(ctx, state, data = {}) {
  return updateObservabilitySurface(ctx, state, data, {
    isDegraded: observabilityIsDegraded(data),
    surface: 'gateway',
    reason: 'gateway_unreachable',
    degradedDetail: selectPresentValue(data.gateway_detail, data.detail, GATEWAY_UNREACHABLE_DETAIL),
    restoredDetail: 'session status reachable again',
  });
}

export function updateTranscriptObservability(ctx, state, data = {}) {
  const transcriptDetail = selectTruthyValue(() => (selectTruthyValue(() => (data.transcript_detail), () => (data.detail))), () => (null));
  const isDegraded = typeof transcriptDetail === 'string' && transcriptDetail.startsWith('transcript-read-failed:');
  return updateObservabilitySurface(ctx, state, data, {
    isDegraded,
    surface: 'transcript',
    reason: 'transcript_read_failed',
    degradedDetail: selectPresentValue(transcriptDetail, TRANSCRIPT_UNREADABLE_DETAIL),
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
    degradedDetail: selectPresentValue(data.detail, REDIS_COMPLETION_UNAVAILABLE_DETAIL),
    restoredDetail: 'redis completion stream available again',
  });
}
