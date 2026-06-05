import { getActiveContext } from '../core/logger.ts';
import {
  loadStatus,
  getAuthoritativeModuleState,
  projectGateSchedulerState,
  projectModuleSchedulerState,
} from '../services/status-store.ts';
import { STATUS, EXIT_BLOCKED } from '../core/constants.ts';
import {
  buildPipelineStepResult,
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  PIPELINE_STEP_TYPES,
} from '../services/contracts/pipeline-step-result.ts';
import {
  resolveResultAttempt,
  resolveResultSessionKey,
  resolveResultGatewayLabel,
  resolveResultDispatchId,
  resolveStatusCorrelationProvenance,
} from '../services/correlation.ts';

export function _telemetryCtx(config) {
  return getActiveContext() || { config, runId: config?.run_id || config?._runId || '' };
}

function resolveProjectedAttempt(result) {
  return result?.attempt ?? result?.rate_limit_status?.attempt ?? null;
}

function resolveProjectedDispatchId(result) {
  return result?.dispatch_id ?? result?.rate_limit_status?.dispatch_id ?? null;
}

function resolveProjectedGatewayLabel(result) {
  return result?.gateway_label ?? result?.rate_limit_status?.gateway_label ?? null;
}

function resolveProjectedSessionKey(result) {
  return result?.session_key ?? result?.rate_limit_status?.session_key ?? null;
}

export function getResultGateType(result) {
  return result?.gate_type
    ?? result?.status?.gate_type
    ?? result?.gate?.type
    ?? null;
}

export function getProgressGateType(progress, gateId) {
  return progress?.gates?.[gateId]?.type || null;
}

export function resolvePipelineGateType(progress, stepType, stepId, result = null) {
  if (stepType !== 'gate') return null;
  return getResultGateType(result)
    ?? getProgressGateType(progress, stepId)
    ?? null;
}

export function buildEscalationPayload(stepType, stepId, result, action, gateType = null) {
  return {
    action: action || null,
    fail_count: result?.fail_count ?? null,
    last_failure: result?.reason || action || null,
    session_key: resolveResultSessionKey(result),
    attempt: resolveResultAttempt(result),
    dispatch_id: resolveResultDispatchId(result),
    gateway_label: resolveResultGatewayLabel(result),
    ...(stepType === 'module' ? { module_id: stepId } : {}),
    ...(stepType === 'gate' ? { gate_id: stepId, gate_type: gateType ?? getResultGateType(result) ?? null } : {}),
    ...(stepType === 'validator' ? { validator_id: stepId, validator_stage_id: result?.validator_stage_id || result?.validator || null } : {}),
  };
}

export function buildPipelineHaltPayload(stepType, stepId, result, reason, gateType = null) {
  const maxRateLimitPauses = result?.max_rate_limit_pauses ?? result?.rate_limit_status?.max_rate_limit_pauses ?? null;
  const rateLimitExhausted = result?.rate_limit_exhausted === true || result?.rate_limit_status?.rate_limit_exhausted === true;
  return {
    step_type: stepType || null,
    step_id: stepId || null,
    reason: reason || 'UNKNOWN',
    exit_code: result?.exit,
    session_key: resolveResultSessionKey(result),
    attempt: resolveResultAttempt(result),
    dispatch_id: resolveResultDispatchId(result),
    gateway_label: resolveResultGatewayLabel(result),
    ...(reason === 'RATE_LIMITED' ? {
      rate_limit_exhausted: rateLimitExhausted,
      max_rate_limit_pauses: maxRateLimitPauses,
    } : {}),
    ...(stepType === 'module' ? { module_id: stepId } : {}),
    ...(stepType === 'gate' ? { gate_id: stepId, gate_type: gateType ?? getResultGateType(result) ?? null } : {}),
    ...(stepType === 'validator' ? { validator_id: stepId, validator_stage_id: result?.validator_stage_id || result?.validator || null } : {}),
  };
}

export function projectPipelineGateState(config, gateId, gate, deps = {}) {
  return projectGateSchedulerState(config, gateId, gate, deps);
}

export function loadModuleStatus(config, progress, moduleId, deps = {}) {
  const moduleDir = progress?.modules?.[moduleId]?.dir;
  const loadStatusFn = deps.loadStatus || loadStatus;
  return moduleDir ? loadStatusFn(config, moduleDir) : null;
}

export function loadAuthoritativeModuleState(config, progress, moduleId, {
  status = undefined,
  loadStatusFn = loadStatus,
} = {}) {
  const moduleConfig = progress?.modules?.[moduleId] || null;
  const moduleDir = moduleConfig?.dir || moduleId || null;
  const compatibilityStatus = status === undefined && moduleDir
    ? loadStatusFn(config, moduleDir)
    : status;

  return projectModuleSchedulerState(config, moduleId, moduleConfig, {
    status: compatibilityStatus,
  }) || getAuthoritativeModuleState(config, moduleId, {
    dir: moduleDir,
    status: compatibilityStatus,
  });
}

export function hasModuleStarted(status) {
  if (!status || typeof status !== 'object') return false;
  if (status.started_at || status.current_phase) return true;
  if (status.current_attempt != null) return true;
  if (Array.isArray(status.history) && status.history.length > 0) return true;
  return status.status && status.status !== STATUS.PENDING;
}

export function hasAnyStartedModules(config, progress, deps = {}) {
  return progress.execution_order.some(stepId => {
    if (stepId.startsWith('gate:') || stepId.startsWith('validator:')) return false;
    const moduleId = stepId.startsWith('module:') ? stepId.slice('module:'.length) : stepId;
    const mod = progress.modules[moduleId];
    if (!mod) return false;
    const authoritative = loadAuthoritativeModuleState(config, progress, moduleId, {
      loadStatusFn: deps.loadStatus || loadStatus,
    });
    return hasModuleStarted(authoritative);
  });
}

export function buildBlockedModuleResult(config, progress, moduleId, deps = {}) {
  const status = loadModuleStatus(config, progress, moduleId, deps);
  const authoritative = loadAuthoritativeModuleState(config, progress, moduleId, {
    status,
    loadStatusFn: deps.loadStatus || loadStatus,
  }) || status;
  const reason = authoritative?.blocked_reason || status?.blockedReason || status?.note || 'BLOCKED';
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.MODULE,
    stepId: moduleId,
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: PIPELINE_STEP_OUTCOMES.BLOCKED,
    issueType: 'policy',
    reason,
    diagnostics: {
      summary: reason,
      metadata: {
        blocked_source: 'module_scheduler_projection',
        fail_count: authoritative?.blocked_fail_count ?? authoritative?.fail_count ?? status?.blockedFailCount ?? status?.fail_count ?? null,
        module_status: authoritative,
        scheduler_status: status,
      },
    },
    correlation: {
      module_id: moduleId,
      attempt: null,
      dispatch_id: null,
      gateway_label: null,
      session_key: null,
      correlation_provenance: resolveStatusCorrelationProvenance(authoritative || status || null),
    },
  });
}

// Pipeline halt correlation boundary only.
// Canonical ownership stays with typed step-result correlation. If a terminal
// module result is intentionally narrow, the pipeline runner may backfill from
// the named module scheduler read model. It must not mine arbitrary nested
// compatibility shapes such as result.status/result.module_status as authority.
export function buildResultWithStepCorrelation(config, progress, stepType, stepId, result, deps = {}) {
  if (stepType === 'gate') {
    return {
      ...result,
      gate_type: getResultGateType(result) ?? getProgressGateType(progress, stepId),
    };
  }
  if (stepType !== 'module') return { ...result };

  const rawStatus = loadModuleStatus(config, progress, stepId, deps);
  const exposeIdentity = result?.exit !== EXIT_BLOCKED || result?.attempt != null || result?.dispatch_id != null;
  return {
    ...result,
    attempt: exposeIdentity ? resolveProjectedAttempt(result) : null,
    dispatch_id: exposeIdentity ? resolveProjectedDispatchId(result) : null,
    gateway_label: exposeIdentity ? resolveProjectedGatewayLabel(result) : null,
    session_key: exposeIdentity ? resolveProjectedSessionKey(result) : null,
    correlation_provenance: resolveStatusCorrelationProvenance(rawStatus || null),
  };
}
