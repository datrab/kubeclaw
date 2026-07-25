import { getActiveContext } from '../core/logger.ts';
import {
  projectGateSchedulerState,
  projectModuleSchedulerState,
} from '../services/status-store.ts';
import { STATUS } from '../core/constants.ts';
import {
  buildPipelineStepResult,
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  PIPELINE_STEP_TYPES,
} from '../services/contracts/pipeline-step-result.ts';
import {
  PIPELINE_TERMINAL_ACTIONS,
  PIPELINE_TERMINAL_SCOPES,
} from '../services/contracts/terminal-decision.ts';
import {
  resolveResultAttempt,
  resolveResultSessionKey,
  resolveResultGatewayLabel,
  resolveResultDispatchId,
  resolveStatusCorrelationProvenance,
} from '../services/correlation.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
export function _telemetryCtx(config: any) {
  return selectDefinedValue(() => (getActiveContext()), () => ({ config, runId: selectDefinedValue(() => (selectDefinedValue(() => (config?.run_id), () => (config?._runId))), () => ('')), stats: { errors: [] } }));
}

function firstDefined(...values: any) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function resolveProjectedAttempt(result: any) {
  return selectDefinedValue(() => (selectDefinedValue(() => (result?.attempt), () => (result?.rate_limit_status?.attempt))), () => (null));
}

function resolveProjectedDispatchId(result: any) {
  return selectDefinedValue(() => (selectDefinedValue(() => (result?.dispatch_id), () => (result?.rate_limit_status?.dispatch_id))), () => (null));
}

function resolveProjectedGatewayLabel(result: any) {
  return selectDefinedValue(() => (selectDefinedValue(() => (result?.gateway_label), () => (result?.rate_limit_status?.gateway_label))), () => (null));
}

function resolveProjectedSessionKey(result: any) {
  return selectDefinedValue(() => (selectDefinedValue(() => (result?.session_key), () => (result?.rate_limit_status?.session_key))), () => (null));
}

function getResultGateType(result: any) {
  return firstDefined(result?.gate_type, result?.status?.gate_type, result?.gate?.type, null);
}

export function getProgressGateType(progress: any, gateId: any) {
  return selectTruthyValue(() => (progress?.gates?.[gateId]?.type), () => (null));
}

export function resolvePipelineGateType(progress: any, stepType: any, stepId: any, result: any = null) {
  if (stepType !== 'gate') return null;
  return firstDefined(getResultGateType(result), getProgressGateType(progress, stepId), null);
}

function resultGateTypeAuthority(progress: any, stepId: any, result: any, gateType: any = null) {
  return firstDefined(gateType, getResultGateType(result), getProgressGateType(progress, stepId), null);
}

function isRateLimitExhausted(result: any) {
  return Boolean(selectTruthyValue(() => (result?.rate_limit_exhausted === true), () => (result?.rate_limit_status?.rate_limit_exhausted === true)));
}

function authoritativeModuleState(config: any, progress: any, moduleId: any, schedulerStatus: any) {
  return firstDefined(loadAuthoritativeModuleState(config, progress, moduleId), schedulerStatus, null);
}

export function buildEscalationPayload(stepType: any, stepId: any, result: any, action: any, gateType: any = null) {
  return {
    action: selectTruthyValue(() => (action), () => (null)),
    fail_count: selectDefinedValue(() => (result?.fail_count), () => (null)),
    last_failure: selectTruthyValue(() => (selectTruthyValue(() => (result?.reason), () => (action))), () => (null)),
    session_key: resolveResultSessionKey(result),
    attempt: resolveResultAttempt(result),
    dispatch_id: resolveResultDispatchId(result),
    gateway_label: resolveResultGatewayLabel(result),
    ...(stepType === 'module' ? { module_id: stepId } : {}),
    ...(stepType === 'gate' ? { gate_id: stepId, gate_type: resultGateTypeAuthority(null, stepId, result, gateType) } : {}),
    ...(stepType === 'validator' ? { validator_id: stepId, validator_stage_id: selectTruthyValue(() => (selectTruthyValue(() => (result?.validator_stage_id), () => (result?.validator))), () => (null)) } : {}),
    terminal_status: selectDefinedValue(() => (selectDefinedValue(() => (result?.terminal_status), () => (result?.terminal?.status))), () => (null)),
    terminal_decision: selectDefinedValue(() => (selectDefinedValue(() => (result?.terminal_decision), () => (result?.terminal?.decision))), () => (null)),
  };
}

export function buildPipelineHaltPayload(stepType: any, stepId: any, result: any, reason: any, gateType: any = null) {
  const maxRateLimitPauses = selectDefinedValue(() => (result?.max_rate_limit_pauses), () => (null));
  const rateLimitExhausted = isRateLimitExhausted(result);
  const terminalStatus = selectDefinedValue(() => (selectDefinedValue(() => (result?.terminal_status), () => (result?.terminal?.status))), () => (null));
  return {
    step_type: selectTruthyValue(() => (stepType), () => (null)),
    step_id: selectTruthyValue(() => (stepId), () => (null)),
    reason: selectDefinedValue(() => (reason), () => ('UNKNOWN')),
    terminal_status: terminalStatus,
    terminal_decision: selectDefinedValue(() => (selectDefinedValue(() => (result?.terminal_decision), () => (result?.terminal?.decision))), () => (null)),
    session_key: resolveResultSessionKey(result),
    attempt: resolveResultAttempt(result),
    dispatch_id: resolveResultDispatchId(result),
    gateway_label: resolveResultGatewayLabel(result),
    ...(terminalStatus === 'rate_limited' ? {
      rate_limit_exhausted: rateLimitExhausted,
      max_rate_limit_pauses: maxRateLimitPauses,
    } : {}),
    ...(stepType === 'module' ? { module_id: stepId } : {}),
    ...(stepType === 'gate' ? { gate_id: stepId, gate_type: resultGateTypeAuthority(null, stepId, result, gateType) } : {}),
    ...(stepType === 'validator' ? { validator_id: stepId, validator_stage_id: selectTruthyValue(() => (selectTruthyValue(() => (result?.validator_stage_id), () => (result?.validator))), () => (null)) } : {}),
  };
}

export function projectPipelineGateState(config: any, gateId: any, gate: any, deps: any = {}) {
  return projectGateSchedulerState(config, gateId, gate, deps);
}

function loadModuleStatus(config: any, progress: any, moduleId: any, deps: any = {}) {
  void deps;
  const moduleConfig = selectTruthyValue(() => (progress?.modules?.[moduleId]), () => (null));
  return projectModuleSchedulerState(config, moduleId, moduleConfig);
}

export function loadAuthoritativeModuleState(config: any, progress: any, moduleId: any) {
  const moduleConfig = selectTruthyValue(() => (progress?.modules?.[moduleId]), () => (null));
  return projectModuleSchedulerState(config, moduleId, moduleConfig);
}

function hasModuleStarted(status: any) {
  if (selectTruthyValue(() => (!status), () => (typeof status !== 'object'))) return false;
  if (selectTruthyValue(() => (status.started_at), () => (status.current_phase))) return true;
  if (status.current_attempt != null) return true;
  if (Array.isArray(status.history) && status.history.length > 0) return true;
  return status.status && status.status !== STATUS.PENDING;
}

export function hasAnyStartedModules(config: any, progress: any, deps: any = {}) {
  return progress.execution_order.some((stepId: any) => {
    if (selectTruthyValue(() => (stepId.startsWith('gate:')), () => (stepId.startsWith('validator:')))) return false;
    const moduleId = stepId.startsWith('module:') ? stepId.slice('module:'.length) : stepId;
    const mod = progress.modules[moduleId];
    if (!mod) return false;
    const authoritative = loadAuthoritativeModuleState(config, progress, moduleId);
    return hasModuleStarted(authoritative);
  });
}

export function buildBlockedModuleResult(config: any, progress: any, moduleId: any, deps: any = {}) {
  const status = loadModuleStatus(config, progress, moduleId, deps);
  const authoritative = authoritativeModuleState(config, progress, moduleId, status);
  const reason = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (authoritative?.blocked_reason), () => (status?.blockedReason))), () => (status?.note))), () => ('BLOCKED'));
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
        fail_count: selectDefinedValue(() => (authoritative?.blocked_fail_count), () => (null)),
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
      correlation_provenance: resolveStatusCorrelationProvenance(selectTruthyValue(() => (selectTruthyValue(() => (authoritative), () => (status))), () => (null))),
    },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.NOTIFY_OPERATOR,
    terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
  });
}

// Pipeline halt correlation boundary only.
// Canonical ownership stays with typed step-result correlation. If a terminal
// module result is intentionally narrow, the pipeline runner may backfill from
// the named module scheduler read model. It must not mine arbitrary nested
// compatibility shapes such as result.status/result.module_status as authority.
export function buildResultWithStepCorrelation(config: any, progress: any, stepType: any, stepId: any, result: any, deps: any = {}) {
  if (stepType === 'gate') {
    return {
      ...result,
      gate_type: resultGateTypeAuthority(progress, stepId, result),
    };
  }
  if (stepType !== 'module') return { ...result };

  const rawStatus = loadModuleStatus(config, progress, stepId, deps);
  const terminalStatus = selectDefinedValue(() => (selectDefinedValue(() => (result?.terminal_status), () => (result?.terminal?.status))), () => (null));
  const exposeIdentity = selectTruthyValue(() => (selectTruthyValue(() => (terminalStatus !== 'blocked'), () => (result?.attempt != null))), () => (result?.dispatch_id != null));
  return {
    ...result,
    attempt: exposeIdentity ? resolveProjectedAttempt(result) : null,
    dispatch_id: exposeIdentity ? resolveProjectedDispatchId(result) : null,
    gateway_label: exposeIdentity ? resolveProjectedGatewayLabel(result) : null,
    session_key: exposeIdentity ? resolveProjectedSessionKey(result) : null,
    correlation_provenance: resolveStatusCorrelationProvenance(selectTruthyValue(() => (rawStatus), () => (null))),
  };
}
