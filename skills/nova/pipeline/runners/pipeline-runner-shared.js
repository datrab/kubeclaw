import { getActiveContext } from '../core/logger.js';
import {
  loadStatus,
  getAuthoritativeModuleState,
  projectGateCompatibilityState,
  readBusterGateCompletion,
  readGateOutput,
  readGateStatusJson,
} from '../services/status-store.js';
import { STATUS, EXIT_BLOCKED } from '../core/constants.js';
import {
  resolveResultAttempt,
  resolveResultSessionKey,
  resolveResultGatewayLabel,
  resolveResultDispatchId,
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
  resolveStatusDispatchId,
} from '../services/correlation.js';
import { buildDiscordIdentityFields, DISCORD_FIELD_SPECS } from '../services/discord-fields.js';

export function _telemetryCtx(config) {
  return getActiveContext() || { config, runId: config?.run_id || config?._runId || '' };
}

export function buildPipelineDiscordFields(identity = {}, extra = []) {
  return buildDiscordIdentityFields(identity, [
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.MODULE_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
    DISCORD_FIELD_SPECS.STEP_TYPE,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
  ], extra);
}

export function getModuleAttempt(status) {
  if (!status || typeof status !== 'object') return null;
  return status?.current_attempt ?? status?.active_agent?.attempt ?? ((status?.fail_count || 0) + 1);
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
  };
}

export function buildPipelineHaltPayload(stepType, stepId, result, reason, gateType = null) {
  return {
    reason: reason || 'UNKNOWN',
    exit_code: result?.exit,
    session_key: resolveResultSessionKey(result),
    attempt: resolveResultAttempt(result),
    dispatch_id: resolveResultDispatchId(result),
    gateway_label: resolveResultGatewayLabel(result),
    ...(stepType === 'module' ? { module_id: stepId } : {}),
    ...(stepType === 'gate' ? { gate_id: stepId, gate_type: gateType ?? getResultGateType(result) ?? null } : {}),
  };
}

export function projectPipelineGateState(config, gateId, gate, deps = {}) {
  const readGateOutputFn = deps.readGateOutput || readGateOutput;
  const readGateStatusJsonFn = deps.readGateStatusJson || readGateStatusJson;
  const readBusterGateCompletionFn = deps.readBusterGateCompletion || readBusterGateCompletion;

  return projectGateCompatibilityState(config, gateId, gate, {
    output: readGateOutputFn(config, gate),
    gateStatus: readGateStatusJsonFn(config, gateId),
    busterCompletion: gate?.type === 'buster'
      ? readBusterGateCompletionFn(config, gateId, gate)
      : null,
  });
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
  const moduleDir = progress?.modules?.[moduleId]?.dir || moduleId || null;
  const compatibilityStatus = status === undefined && moduleDir
    ? loadStatusFn(config, moduleDir)
    : status;

  return getAuthoritativeModuleState(config, moduleId, {
    dir: moduleDir,
    status: compatibilityStatus,
  });
}

export function hasModuleStarted(status) {
  if (!status || typeof status !== 'object') return false;
  if (status.started_at || status.attempt_started_at || status.phase_started_at || status.current_phase) return true;
  if (status.current_attempt != null || status.latest_event_type) return true;
  if (Array.isArray(status.history) && status.history.length > 0) return true;
  return status.status && status.status !== STATUS.PENDING;
}

export function hasAnyStartedModules(config, progress, deps = {}) {
  return progress.execution_order.some(stepId => {
    if (stepId.startsWith('gate:')) return false;
    const mod = progress.modules[stepId];
    if (!mod) return false;
    const authoritative = loadAuthoritativeModuleState(config, progress, stepId, {
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
  return {
    exit: EXIT_BLOCKED,
    module: moduleId,
    reason: authoritative?.blocked_reason || status?.blockedReason || status?.note || 'BLOCKED',
    fail_count: authoritative?.blocked_fail_count ?? authoritative?.fail_count ?? status?.blockedFailCount ?? status?.fail_count ?? null,
    module_status: authoritative,
    compatibility_status: status,
    attempt: getModuleAttempt(authoritative),
    dispatch_id: authoritative?.dispatch_id ?? status?.dispatch_id ?? status?.active_agent?.dispatch_id ?? null,
    gateway_label: authoritative?.gateway_label ?? resolveStatusGatewayLabel(status),
    session_key: authoritative?.session_key ?? resolveStatusSessionKey(status),
  };
}

// Thin fallback glue only.
// Canonical ownership stays with the shared result/status correlation helpers plus
// the underlying module/gate runners. The pipeline runner only backfills missing
// halt/handoff correlation when a terminal step result is narrower than the
// persisted module status or gate registry context already on disk.
export function buildResultWithStepCorrelation(config, progress, stepType, stepId, result, deps = {}) {
  if (stepType === 'gate') {
    return {
      ...result,
      gate_type: getResultGateType(result) ?? getProgressGateType(progress, stepId),
    };
  }
  if (stepType !== 'module') return { ...result };

  const moduleStatus = loadAuthoritativeModuleState(config, progress, stepId, {
    loadStatusFn: deps.loadStatus || loadStatus,
  });
  return {
    ...result,
    attempt: resolveResultAttempt(result) ?? getModuleAttempt(moduleStatus),
    dispatch_id: resolveResultDispatchId(result) ?? moduleStatus?.dispatch_id ?? resolveStatusDispatchId(moduleStatus),
    gateway_label: resolveResultGatewayLabel(result) || moduleStatus?.gateway_label || resolveStatusGatewayLabel(moduleStatus),
    session_key: resolveResultSessionKey(result) || moduleStatus?.session_key || resolveStatusSessionKey(moduleStatus),
  };
}
