import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { setModuleActiveAgent, clearModuleActiveAgent, startModulePhase } from '../lifecycle-state.ts';
import { emitPipelineCheckpoint } from '../services/pipeline-checkpoint.ts';

function dispatchIdentityValue(dispatch: any, completionIdentity: any, field: 'dispatch_id' | 'run_id') {
  const dispatchValue = typeof dispatch?.[field] === 'string' && dispatch[field].trim() ? dispatch[field].trim() : null;
  const identityField = field === 'dispatch_id' ? 'dispatchId' : 'runId';
  const identityValue = typeof completionIdentity?.[identityField] === 'string' && completionIdentity[identityField].trim() ? completionIdentity[identityField].trim() : null;
  if (dispatchValue) return dispatchValue;
  if (identityValue) return identityValue;
  throw new Error(`Buster worker dispatch requires ${field}`);
}

function firstPresent(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function finalizedValue(finalized: any, latest: any, key: string) {
  return firstPresent(finalized[key], latest?.[key]);
}

function mergeFinalizedStatus(latest: any, finalized: any) {
  if (!finalized) return latest;
  return {
    ...(latest ?? {}), ...finalized,
    validation: finalizedValue(finalized, latest, 'validation'),
    cost: finalizedValue(finalized, latest, 'cost'),
    active_agent: finalizedValue(finalized, latest, 'active_agent'),
    session_key: finalizedValue(finalized, latest, 'session_key'),
    dispatch_id: finalizedValue(finalized, latest, 'dispatch_id'),
    gateway_label: finalizedValue(finalized, latest, 'gateway_label'),
  };
}

function createDispatchCallback(ctx: any, state: any) {
  return async (dispatch: any = {}) => {
    const dispatchId = dispatchIdentityValue(dispatch, ctx.completionIdentity, 'dispatch_id');
    const dispatchRunId = dispatchIdentityValue(dispatch, ctx.completionIdentity, 'run_id');
    ctx.completionIdentity.dispatchId = dispatchId;
    ctx.completionIdentity.gateway_label = dispatch.gateway_label ?? null;
    const transition = startModulePhase(state.status, 'buster', `Buster started (subagent attempt ${ctx.busterAttempt}/${ctx.maxBusterCrashRetries + 1})`, { now: new Date().toISOString(), clearCompletionSummary: true });
    const active = setModuleActiveAgent(state.status, {
      session_key: dispatch.session_key ?? null,
      stream_log_path: dispatch.stream_log_path ?? null,
      label: dispatchId,
      gateway_label: dispatch.gateway_label ?? null,
      dispatch_id: dispatchId,
      run_id: dispatchRunId,
      attempt: ctx.completionIdentity.attempt,
      runtime: dispatch.runtime ?? null,
      model: ctx.busterModel,
      model_source: ctx.busterPolicy.model_source ?? null,
      reasoning_level: ctx.busterPolicy.thinking_supported === false ? 'not supported' : (ctx.busterPolicy.thinking ?? 'default'),
      thinking_source: ctx.busterPolicy.thinking_source ?? null,
      agent_id: dispatch.agent_id ?? null,
      phase: 'buster',
      started_at: new Date().toISOString(),
    }, { lifecycleMutation: transition.lifecycleMutation });
    Object.assign(state.status, { session_key: dispatch.session_key ?? null, dispatch_id: dispatchId, gateway_label: dispatch.gateway_label ?? null });
    state.busterSessionKey = dispatch.session_key ?? null;
    ctx.deps.saveStatus(ctx.config, ctx.dir, state.status, active);
    const details = { step_type: 'module', step_id: ctx.moduleId, module_id: ctx.moduleId, attempt: ctx.completionIdentity.attempt, dispatch_id: dispatchId };
    emitPipelineCheckpoint(ctx.config, 'after_buster_task_enqueue', details);
    emitPipelineCheckpoint(ctx.config, 'during_buster_wait', details);
  };
}

function createFinalizedCallback(ctx: any, state: any) {
  return async ({ status: finalized = null, session_key: sessionKey = null }: any = {}) => {
    state.status = mergeFinalizedStatus(ctx.deps.loadStatus(ctx.config, ctx.dir) ?? state.status, finalized);
    state.busterSessionKey = firstPresent(sessionKey, state.busterSessionKey);
    state.status.session_key = firstPresent(state.status.session_key, state.busterSessionKey);
    state.status.dispatch_id = firstPresent(state.status.dispatch_id, ctx.completionIdentity.dispatchId);
    state.status.gateway_label = firstPresent(state.status.gateway_label, ctx.completionIdentity.gateway_label);
    clearModuleActiveAgent(state.status);
    ctx.deps.saveStatus(ctx.config, ctx.dir, state.status);
  };
}

export function buildBusterWorkerInput(ctx: any, executionInput: any, state: any) {
  return {
    ...executionInput,
    executionContext: { ...executionInput.executionContext, startupRateLimitPauseCount: ctx.startupRateLimitPauseCount },
    prompt: ctx.busterPrompt,
    status: state.status,
    onDispatched: createDispatchCallback(ctx, state),
    onFinalized: createFinalizedCallback(ctx, state),
  };
}
