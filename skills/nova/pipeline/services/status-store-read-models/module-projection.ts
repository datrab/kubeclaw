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

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
const MODULE_PENDING_STATUS = 'PENDING';

function authoritativeModuleStatus(authoritative) {
  return typeof authoritative?.status === 'string' && authoritative.status.trim()
    ? authoritative.status
    : MODULE_PENDING_STATUS;
}

function moduleFailCount(authoritative) {
  const value = authoritative?.fail_count;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function moduleFailSummaries(authoritative) {
  return Array.isArray(authoritative?.fail_summaries) ? authoritative.fail_summaries : [];
}

function moduleHistory(authoritative) {
  return Array.isArray(authoritative?.history) ? authoritative.history : [];
}

export function getAuthoritativeModuleState(config, moduleId, {
  dir = null,
  status = null,
} = {}) {
  const resolvedModuleId = selectDefinedValue(() => (moduleId), () => (null));
  if (!resolvedModuleId) return null;
  return selectDefinedValue(() => (getLifecycleModuleState(config, resolvedModuleId)), () => (null));
}

export function projectModuleSchedulerState(config, moduleId, moduleConfig = null, {
  status = undefined,
  statusRead = undefined,
} = {}) {
  void status;
  void statusRead;

  const authoritative = getAuthoritativeModuleState(config, moduleId, {
    dir: selectDefinedValue(() => (selectDefinedValue(() => (moduleConfig?.dir), () => (moduleId))), () => (null)),
  });

  if (!authoritative) {
    return cloneSerializable({
      module_id: selectDefinedValue(() => (selectDefinedValue(() => (moduleId), () => (moduleConfig?.dir))), () => (null)),
      module_dir: selectDefinedValue(() => (moduleConfig?.dir), () => (null)),
      title: selectDefinedValue(() => (moduleConfig?.title), () => (null)),
      status: MODULE_PENDING_STATUS,
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

  const statusText = authoritativeModuleStatus(authoritative);
  return cloneSerializable({
    ...authoritative,
    module_id: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (authoritative.module_id), () => (moduleId))), () => (moduleConfig?.dir))), () => (null)),
    module_dir: selectDefinedValue(() => (selectDefinedValue(() => (authoritative.module_dir), () => (moduleConfig?.dir))), () => (null)),
    title: selectDefinedValue(() => (selectDefinedValue(() => (moduleConfig?.title), () => (authoritative.title))), () => (null)),
    status: statusText,
    scheduler_consumed: statusText === 'PASS',
    completed: statusText === 'PASS',
    blocked: statusText === 'BLOCKED',
    failed: statusText === 'FAIL',
    projection_source: projectionSourceAuthority(authoritative),
    ...buildProjectionSourceFields({
      readModelSource: selectDefinedValue(() => (authoritative.read_model_source), () => (READ_MODEL_SOURCE_CANONICAL_EVENTS)),
      operatorProjectionSource: 'module_scheduler_read_model',
    }),
    scheduler_drift: [],
    scheduler_drift_detected: false,
  });
}

export function projectModuleRuntimeState(config, moduleId, moduleConfig = null) {
  const authoritative = getAuthoritativeModuleState(config, moduleId, {
    dir: selectDefinedValue(() => (selectDefinedValue(() => (moduleConfig?.dir), () => (moduleId))), () => (null)),
  });
  if (!authoritative) return null;

  const resolvedModuleId = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (authoritative.module_id), () => (moduleId))), () => (moduleConfig?.dir))), () => (null));
  const storedActiveSession = selectDefinedValue(() => (loadLifecycleReadModels(config)?.active_sessions?.modules?.[resolvedModuleId]), () => (null));
  const normalizedActiveSession = storedActiveSession ? {
    ...storedActiveSession,
    module_id: resolvedModuleId,
    attempt: selectDefinedValue(() => (storedActiveSession.attempt), () => (null)),
    dispatch_id: selectDefinedValue(() => (storedActiveSession.dispatch_id), () => (null)),
    session_key: selectDefinedValue(() => (storedActiveSession.session_key), () => (null)),
    gateway_label: selectDefinedValue(() => (storedActiveSession.gateway_label), () => (null)),
    model: selectDefinedValue(() => (selectDefinedValue(() => (storedActiveSession.model), () => (authoritative.model))), () => (null)),
  } : null;

  return cloneSerializable({
    module_id: resolvedModuleId,
    title: selectDefinedValue(() => (selectDefinedValue(() => (authoritative.title), () => (moduleConfig?.title))), () => (null)),
    status: authoritative.status,
    current_phase: selectDefinedValue(() => (authoritative.current_phase), () => (null)),
    fail_count: moduleFailCount(authoritative),
    fail_summaries: moduleFailSummaries(authoritative),
    history: moduleHistory(authoritative),
    started_at: selectDefinedValue(() => (selectDefinedValue(() => (authoritative.started_at), () => (authoritative.attempt_started_at))), () => (null)),
    attempt_started_at: selectDefinedValue(() => (authoritative.attempt_started_at), () => (null)),
    phase_started_at: selectDefinedValue(() => (authoritative.phase_started_at), () => (null)),
    completed_at: selectDefinedValue(() => (authoritative.completed_at), () => (null)),
    completion_summary: selectDefinedValue(() => (authoritative.completion_summary), () => (null)),
    blockedAt: selectDefinedValue(() => (authoritative.blocked_at), () => (null)),
    blockedReason: selectDefinedValue(() => (authoritative.blocked_reason), () => (null)),
    blockedPhase: selectDefinedValue(() => (authoritative.blocked_phase), () => (null)),
    blockedFailCount: selectDefinedValue(() => (authoritative.blocked_fail_count), () => (null)),
    validation: selectDefinedValue(() => (authoritative.validation), () => (null)),
    cost: selectDefinedValue(() => (authoritative.cost), () => (null)),
    commit_hash: selectDefinedValue(() => (authoritative.commit_hash), () => (null)),
    model: selectDefinedValue(() => (selectDefinedValue(() => (authoritative.model), () => (normalizedActiveSession?.model))), () => (null)),
    active_agent: normalizedActiveSession,
    dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (authoritative.dispatch_id), () => (normalizedActiveSession?.dispatch_id))), () => (null)),
    gateway_label: selectDefinedValue(() => (selectDefinedValue(() => (authoritative.gateway_label), () => (normalizedActiveSession?.gateway_label))), () => (null)),
    session_key: selectDefinedValue(() => (selectDefinedValue(() => (authoritative.session_key), () => (normalizedActiveSession?.session_key))), () => (null)),
    current_attempt: selectDefinedValue(() => (selectDefinedValue(() => (authoritative.current_attempt), () => (normalizedActiveSession?.attempt))), () => (null)),
    updated_at: selectDefinedValue(() => (authoritative.latest_event_at), () => (null)),
    status_authority_source: 'lifecycle_read_model',
    lifecycle_module_state_authority: true,
    lifecycle_projection_source: lifecycleProjectionSourceAuthority(authoritative),
    lifecycle_latest_event_type: selectDefinedValue(() => (authoritative.latest_event_type), () => (null)),
    lifecycle_latest_event_at: selectDefinedValue(() => (authoritative.latest_event_at), () => (null)),
  });
}

function projectionSourceAuthority(authoritative) {
  if (authoritative.projection_source !== undefined && authoritative.projection_source !== null) return authoritative.projection_source;
  return READ_MODEL_SOURCE_CANONICAL_EVENTS;
}

function lifecycleProjectionSourceAuthority(authoritative) {
  if (authoritative.projection_source !== undefined && authoritative.projection_source !== null) return authoritative.projection_source;
  if (authoritative.read_model_source !== undefined && authoritative.read_model_source !== null) return authoritative.read_model_source;
  return READ_MODEL_SOURCE_CANONICAL_EVENTS;
}
