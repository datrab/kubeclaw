import { getRunId, getRunStats } from '../../core/runtime.ts';
import { emitEvent, emitEventNonBlocking } from './dispatch.ts';
import { buildRunManifest } from '../evidence-plane.ts';
import { arrayValue, firstDefinedValue as firstDefined, objectRecord, selectPresent } from '../../value-boundary.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
const PIPELINE_COMPLETED_STATUS = 'succeeded';
const PIPELINE_HALTED_REASON_MISSING = 'reason_missing';
const GATE_FAILURE_OPERATOR_ACTION = 'stop';
export {
  emitCostUpdate, emitObservabilityDegraded, emitObservabilityRestored, emitRateLimitDetected,
  updateGatewayObservability, updateObservabilitySurface, updateRedisCompletionObservability,
  updateTranscriptObservability,
} from './observability-builders.ts';
export {
  onApprovalRequested, onApprovalResolved, onBudgetExceeded, onBudgetWarning,
  onEscalated, onPhaseCompleted, onPhaseStarted, onRetryExhausted, onRetryScheduled,
  onSummaryCompleted, onSummaryStarted,
} from './workflow-builders.ts';

function selectPresentValue(...values: any) {
  return selectPresent(...values);
}

function sumModuleTotals(modulesPassed: any, modulesFailed: any, modulesBlocked: any) {
  if (typeof modulesPassed === 'number' && typeof modulesFailed === 'number' && typeof modulesBlocked === 'number') {
    return modulesPassed + modulesFailed + modulesBlocked;
  }
  return null;
}

function elapsedSecondsSince(startedAt: any) {
  if (!startedAt) return null;
  return Math.max(0, Math.round((Date.now() - startedAt) / 1000));
}

function mapPipelineTerminalSnapshotStatus(terminalStatus: any) {
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
  const manifest = buildRunManifest(config, progress || {});

  const payload: any = {};
  if (progress && typeof progress === 'object') {
    const effectiveModels = progress.defaults?.models && typeof progress.defaults.models === 'object'
      ? { ...progress.defaults.models }
      : null;

    payload.modules = Object.entries<any>(objectRecord(progress.modules)).map(([id, m]: any) => ({
      id,
      title: m.title,
      dir: m.dir,
      depends_on: arrayValue(m.depends_on),
    }));
    payload.gates = Object.entries<any>(objectRecord(progress.gates)).map(([id, g]: any) => ({
      id,
      type: g.type,
      title: g.title,
    }));
    payload.execution_order = arrayValue(progress.execution_order);
    payload.models = effectiveModels;
    payload.resume = !!(config?.resume);
    payload.nova_prompt = selectTruthyValue(() => (config?.nova_prompt), () => (null));
  }
  payload.manifest_fingerprint = manifest.fingerprint;
  payload.manifest_reference = 'run-manifest.json';

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
export function onPipelineCompleted(ctx: any, terminalStatus: any, reasonCode: any, summary: any = {}, options: any = {}) {
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

export function onPipelineHalted(ctx: any, data: any = {}) {
  data = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const stepId = selectDefinedValue(() => (selectDefinedValue(() => (data.step_id), () => (data.stepId))), () => (null));
  const stepType = selectDefinedValue(() => (selectDefinedValue(() => (data.step_type), () => (data.stepType))), () => (null));
  const isGate = selectTruthyValue(() => (data.gate_id != null), () => (stepType === 'gate'));
  const isModule = selectTruthyValue(() => (data.module_id != null), () => (stepType === 'module'));
  const event: any = {
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

export function onModuleStarted(ctx: any, moduleId: any, model: any, attempt: any, options: any = {}) {
  return emitEvent(ctx, 'module.started', { module_id: moduleId, model, attempt }, {
    moduleId,
    attempt,
    stateSnapshot: { status: 'IN_PROGRESS' },
    presentation: selectDefinedValue(() => (objectRecord(options.presentation)), () => ({})),
  });
}

export function onModuleStatusChanged(ctx: any, moduleId: any, data: any = {}) {
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
export function onModulePass(ctx: any, moduleId: any, data: any = {}) {
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
export function onModuleFail(ctx: any, moduleId: any, data: any = {}) {
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
export function onModuleBlocked(ctx: any, moduleId: any, data: any = {}) {
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
export function onGateStarted(ctx: any, gateId: any, gate: any = {}, options: any = {}) {
  const payload = {
    gate_id: gateId,
    gate_type: selectTruthyValue(() => (gate.type), () => (null)),
    title: selectTruthyValue(() => (gate.title), () => (null)),
    ...(gate.reviewers ? { reviewers: gate.reviewers } : {}),
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
export function onGatePass(ctx: any, gateId: any, data: any = {}) {
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
export function onGateFail(ctx: any, gateId: any, data: any = {}) {
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
