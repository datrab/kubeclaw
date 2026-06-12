import {
  cloneSerializable,
  getLifecycleModuleState,
  loadLifecycleReadModels,
} from '../status-store-lifecycle.ts';
import {
  READ_MODEL_SOURCE_CANONICAL_EVENTS,
  READ_MODEL_SOURCE_PENDING,
  buildProjectionSourceFields,
} from './common.ts';

export function getAuthoritativeModuleState(config, moduleId, {
  dir = null,
  status = null,
} = {}) {
  const resolvedModuleId = moduleId ?? status?.module_id ?? dir ?? null;
  if (!resolvedModuleId) return null;
  return getLifecycleModuleState(config, resolvedModuleId) ?? null;
}

export function projectModuleSchedulerState(config, moduleId, moduleConfig = null, {
  status = undefined,
  statusRead = undefined,
} = {}) {
  void status;
  void statusRead;

  const authoritative = getAuthoritativeModuleState(config, moduleId, {
    dir: moduleConfig?.dir ?? moduleId ?? null,
  });

  if (!authoritative) {
    return cloneSerializable({
      module_id: moduleId ?? moduleConfig?.dir ?? null,
      module_dir: moduleConfig?.dir ?? null,
      title: moduleConfig?.title ?? null,
      status: 'PENDING',
      scheduler_consumed: false,
      completed: false,
      blocked: false,
      failed: false,
      projection_source: READ_MODEL_SOURCE_PENDING,
    ...buildProjectionSourceFields({
      readModelSource: READ_MODEL_SOURCE_PENDING,
      operatorProjectionSource: 'module_scheduler_read_model',
    }),
      scheduler_drift: [],
      scheduler_drift_detected: false,
    });
  }

  const statusText = authoritative.status ?? 'PENDING';
  return cloneSerializable({
    ...authoritative,
    module_id: authoritative.module_id ?? moduleId ?? moduleConfig?.dir ?? null,
    module_dir: authoritative.module_dir ?? moduleConfig?.dir ?? null,
    title: moduleConfig?.title ?? authoritative.title ?? null,
    status: statusText,
    scheduler_consumed: statusText === 'PASS',
    completed: statusText === 'PASS',
    blocked: statusText === 'BLOCKED',
    failed: statusText === 'FAIL',
    projection_source: authoritative.projection_source ?? READ_MODEL_SOURCE_CANONICAL_EVENTS,
    ...buildProjectionSourceFields({
      readModelSource: authoritative.read_model_source ?? authoritative.projection_source ?? READ_MODEL_SOURCE_CANONICAL_EVENTS,
      operatorProjectionSource: 'module_scheduler_read_model',
    }),
    scheduler_drift: [],
    scheduler_drift_detected: false,
  });
}

export function projectModuleRuntimeState(config, moduleId, moduleConfig = null) {
  const authoritative = getAuthoritativeModuleState(config, moduleId, {
    dir: moduleConfig?.dir ?? moduleId ?? null,
  });
  if (!authoritative) return null;

  const resolvedModuleId = authoritative.module_id ?? moduleId ?? moduleConfig?.dir ?? null;
  const storedActiveSession = loadLifecycleReadModels(config)?.active_sessions?.modules?.[resolvedModuleId] ?? null;
  const normalizedActiveSession = storedActiveSession ? {
    ...storedActiveSession,
    module_id: resolvedModuleId,
    attempt: storedActiveSession.attempt ?? authoritative.current_attempt ?? null,
    dispatch_id: storedActiveSession.dispatch_id ?? authoritative.dispatch_id ?? null,
    session_key: storedActiveSession.session_key ?? authoritative.session_key ?? null,
    gateway_label: storedActiveSession.gateway_label ?? authoritative.gateway_label ?? null,
    model: storedActiveSession.model ?? authoritative.model ?? null,
  } : null;

  return cloneSerializable({
    module_id: resolvedModuleId,
    title: authoritative.title ?? moduleConfig?.title ?? null,
    status: authoritative.status,
    current_phase: authoritative.current_phase ?? null,
    fail_count: authoritative.fail_count ?? 0,
    fail_summaries: authoritative.fail_summaries ?? [],
    history: authoritative.history ?? [],
    started_at: authoritative.started_at ?? authoritative.attempt_started_at ?? null,
    attempt_started_at: authoritative.attempt_started_at ?? null,
    phase_started_at: authoritative.phase_started_at ?? null,
    completed_at: authoritative.completed_at ?? null,
    completion_summary: authoritative.completion_summary ?? null,
    blockedAt: authoritative.blocked_at ?? null,
    blockedReason: authoritative.blocked_reason ?? null,
    blockedPhase: authoritative.blocked_phase ?? null,
    blockedFailCount: authoritative.blocked_fail_count ?? null,
    validation: authoritative.validation ?? null,
    cost: authoritative.cost ?? null,
    commit_hash: authoritative.commit_hash ?? null,
    model: authoritative.model ?? normalizedActiveSession?.model ?? null,
    active_agent: normalizedActiveSession,
    dispatch_id: authoritative.dispatch_id ?? normalizedActiveSession?.dispatch_id ?? null,
    gateway_label: authoritative.gateway_label ?? normalizedActiveSession?.gateway_label ?? null,
    session_key: authoritative.session_key ?? normalizedActiveSession?.session_key ?? null,
    current_attempt: authoritative.current_attempt ?? normalizedActiveSession?.attempt ?? null,
    updated_at: authoritative.latest_event_at ?? null,
    status_authority_source: 'lifecycle_read_model',
    lifecycle_module_state_authority: true,
    lifecycle_projection_source: authoritative.projection_source ?? authoritative.read_model_source ?? READ_MODEL_SOURCE_CANONICAL_EVENTS,
    lifecycle_latest_event_type: authoritative.latest_event_type ?? null,
    lifecycle_latest_event_at: authoritative.latest_event_at ?? null,
  });
}
