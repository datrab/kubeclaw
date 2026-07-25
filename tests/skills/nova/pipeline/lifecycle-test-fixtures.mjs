import { appendModuleLifecycleEvent } from '../../../../skills/nova/pipeline/services/status-store.ts';

export function markModulePassed(config, moduleId, { completedPhase = null, passingFrom = 'TESTING' } = {}) {
  config.locks ??= {};
  config.locks.lifecycle_append ??= { timeout_ms: 1000, stale_ms: 5000, retry_ms: 5 };
  appendModuleLifecycleEvent(config, moduleId, {
    module_id: moduleId,
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    fail_count: 0,
  }, {
    eventType: 'module_attempt.started',
    oldStatus: 'PENDING',
    newStatus: 'IN_PROGRESS',
    now: '2026-07-10T00:00:00.000Z',
  });
  appendModuleLifecycleEvent(config, moduleId, {
    module_id: moduleId,
    status: 'PASS',
    current_phase: completedPhase,
    fail_count: 0,
  }, {
    eventType: 'module_attempt.passed',
    oldStatus: passingFrom,
    newStatus: 'PASS',
    now: '2026-07-10T00:00:00.000Z',
  });
}
