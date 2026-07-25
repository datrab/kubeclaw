import { emitEventNonBlocking } from './dispatch.ts';
import { firstDefinedValue as firstDefined, objectRecord } from '../../value-boundary.ts';
import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';

function computePercentUsed(current: any, limit: any) {
  if (typeof current !== 'number' || typeof limit !== 'number' || !Number.isFinite(current) || !Number.isFinite(limit) || limit === 0) return null;
  return Number(((current / limit) * 100).toFixed(2));
}

function normalizeApprovalTimeoutPolicy(value: any) {
  return String(value ?? '').trim().toUpperCase() === 'CONTINUE' ? 'CONTINUE' : 'BLOCK';
}

export function onPhaseStarted(ctx: any, moduleId: any, phase: any, model: any) {
  emitEventNonBlocking(ctx, 'phase.started', { module_id: moduleId, phase, model });
}

export function onPhaseCompleted(ctx: any, moduleId: any, phase: any) {
  emitEventNonBlocking(ctx, 'phase.completed', { module_id: moduleId, phase });
}

export function onRetryScheduled(ctx: any, moduleId: any, data: any = {}) {
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

export function onRetryExhausted(ctx: any, moduleId: any, data: any = {}) {
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
export function onEscalated(ctx: any, scope: any, scopeId: any, data: any = {}) {
  const stepType = selectDefinedValue(() => (selectDefinedValue(() => (data.step_type), () => (data.stepType))), () => (null));
  const isGate = selectTruthyValue(() => (scope === 'gate'), () => (stepType === 'gate'));
  const isModule = selectTruthyValue(() => (scope === 'module'), () => (stepType === 'module'));
  const event: any = {
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

export function onSummaryStarted(ctx: any, summaryType: any, data: any = {}) {
  const payload: any = { ...objectRecord(data) };
  if (payload.gateway_label == null && payload.label != null) payload.gateway_label = payload.label;
  delete payload.label;
  emitEventNonBlocking(ctx, 'summary.started', { summary_type: summaryType, ...payload });
}

export function onSummaryCompleted(ctx: any, summaryType: any, data: any = {}) {
  const payload: any = { ...objectRecord(data) };
  if (payload.gateway_label == null && payload.label != null) payload.gateway_label = payload.label;
  delete payload.label;
  return emitEventNonBlocking(ctx, 'summary.completed', { summary_type: summaryType, ...payload });
}

export function onBudgetWarning(ctx: any, threshold: any, current: any, limit: any, unit: any) {
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

export function onBudgetExceeded(ctx: any, threshold: any, current: any, limit: any, unit: any) {
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

export function onApprovalRequested(ctx: any, gateId: any, gateTitle: any, timeoutMinutes: any, timeoutPolicy: any, identity: any = {}) {
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

export function onApprovalResolved(ctx: any, gateId: any, status: any, decisionBy: any, identity: any = {}) {
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
