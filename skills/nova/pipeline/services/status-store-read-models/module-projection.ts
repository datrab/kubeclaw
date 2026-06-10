import {
  cloneSerializable,
  getLifecycleModuleState,
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
  const resolvedModuleId = moduleId || status?.module_id || dir || null;
  if (!resolvedModuleId) return null;
  return getLifecycleModuleState(config, resolvedModuleId) || null;
}

export function projectModuleSchedulerState(config, moduleId, moduleConfig = null, {
  status = undefined,
  statusRead = undefined,
} = {}) {
  void status;
  void statusRead;

  const authoritative = getAuthoritativeModuleState(config, moduleId, {
    dir: moduleConfig?.dir || moduleId || null,
  });

  if (!authoritative) {
    return cloneSerializable({
      module_id: moduleId || moduleConfig?.dir || null,
      module_dir: moduleConfig?.dir || null,
      title: moduleConfig?.title || null,
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

  const statusText = authoritative.status || 'PENDING';
  return cloneSerializable({
    ...authoritative,
    module_id: authoritative.module_id || moduleId || moduleConfig?.dir || null,
    module_dir: authoritative.module_dir || moduleConfig?.dir || null,
    title: moduleConfig?.title || authoritative.title || null,
    status: statusText,
    scheduler_consumed: statusText === 'PASS',
    completed: statusText === 'PASS',
    blocked: statusText === 'BLOCKED',
    failed: statusText === 'FAIL',
    projection_source: authoritative.projection_source || READ_MODEL_SOURCE_CANONICAL_EVENTS,
    ...buildProjectionSourceFields({
      readModelSource: authoritative.read_model_source || authoritative.projection_source || READ_MODEL_SOURCE_CANONICAL_EVENTS,
      operatorProjectionSource: 'module_scheduler_read_model',
    }),
    scheduler_drift: [],
    scheduler_drift_detected: false,
  });
}
