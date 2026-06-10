import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendLifecycleEvent,
  appendModuleLifecycleEvent,
  appendWaitLifecycleEvent,
  loadLifecycleReadModels,
  readLifecycleEvents,
} from '../../../../../skills/nova/pipeline/services/status-store-lifecycle.ts';
import { buildLifecycleIdempotencyKey } from '../../../../../skills/nova/pipeline/services/status-store-lifecycle/idempotency.ts';
import { createDefaultLifecycleReadModels } from '../../../../../skills/nova/pipeline/services/status-store-lifecycle/read-models.ts';
import { appendJsonLine, lifecycleEventsPath } from '../../../../../skills/nova/pipeline/services/status-store-lifecycle/storage.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-store-test-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'test-project',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
    },
    _runId: 'run-test',
    run_id: 'run-test',
  };
}

function moduleStartedProposal() {
  const refs = {
    primary_ref: { type: 'module_attempt', id: 'module:alpha:attempt:1' },
    run_id: 'run-test',
    run_ref: 'run:run-test',
    module_id: 'alpha',
    module_attempt_ref: 'module:alpha:attempt:1',
    attempt: 1,
  };
  const data = {
    title: 'Alpha',
    module_dir: 'alpha',
    stages: [],
    resume_from_status: 'PENDING',
  };
  return {
    type: 'module_attempt.started',
    refs,
    data,
    occurredAt: '2026-06-03T06:00:00.000Z',
  };
}

test('idempotent lifecycle retry catches read models up from canonical events', () => {
  const config = makeConfig();
  const proposal = moduleStartedProposal();
  const event = {
    schemaVersion: 'v1',
    event_id: 'event-retry-recovery',
    type: proposal.type,
    occurred_at: proposal.occurredAt,
    recorded_at: proposal.occurredAt,
    idempotency_key: buildLifecycleIdempotencyKey(proposal.type, proposal.refs, proposal.data),
    refs: proposal.refs,
    data: proposal.data,
  };

  appendJsonLine(lifecycleEventsPath(config), event);
  config._lifecycleReadModelsCache = createDefaultLifecycleReadModels(config);

  const retry = appendLifecycleEvent(config, proposal);
  const readModels = loadLifecycleReadModels(config);

  assert.equal(retry.deduped, true);
  assert.equal(retry.readModels.last_event_id, event.event_id);
  assert.equal(retry.readModels.modules.alpha.status, 'IN_PROGRESS');
  assert.equal(readModels.last_event_id, event.event_id);
  assert.equal(readModels.modules.alpha.status, 'IN_PROGRESS');
});

test('gate wait refs include attempt so approval retries do not dedupe prior waits', () => {
  const config = makeConfig();

  appendWaitLifecycleEvent(config, 'wait.opened', {
    gateId: 'approval-gate',
    attempt: 1,
    waitKind: 'approval',
    occurredAt: '2026-06-03T06:00:00.000Z',
    data: { wait_kind: 'approval' },
  });
  appendWaitLifecycleEvent(config, 'resume_signal.received', {
    gateId: 'approval-gate',
    attempt: 1,
    waitKind: 'approval',
    signalKind: 'approve',
    occurredAt: '2026-06-03T06:01:00.000Z',
    data: { signal_kind: 'approve' },
  });
  appendWaitLifecycleEvent(config, 'wait.closed', {
    gateId: 'approval-gate',
    attempt: 1,
    waitKind: 'approval',
    occurredAt: '2026-06-03T06:02:00.000Z',
    data: { close_reason: 'signaled', resolution_kind: 'approved' },
  });

  const retryOpen = appendWaitLifecycleEvent(config, 'wait.opened', {
    gateId: 'approval-gate',
    attempt: 2,
    waitKind: 'approval',
    occurredAt: '2026-06-03T06:03:00.000Z',
    data: { wait_kind: 'approval' },
  });
  appendWaitLifecycleEvent(config, 'resume_signal.received', {
    gateId: 'approval-gate',
    attempt: 2,
    waitKind: 'approval',
    signalKind: 'reject',
    occurredAt: '2026-06-03T06:04:00.000Z',
    data: { signal_kind: 'reject' },
  });

  const events = readLifecycleEvents(config);
  const openedWaits = events.filter((event) => event.type === 'wait.opened');
  const signals = events.filter((event) => event.type === 'resume_signal.received');
  const readModels = loadLifecycleReadModels(config);

  assert.equal(retryOpen.deduped, false);
  assert.equal(events.length, 5);
  assert.equal(openedWaits.length, 2);
  assert.notEqual(openedWaits[0].refs.wait_ref, openedWaits[1].refs.wait_ref);
  assert.equal(openedWaits[0].refs.wait_ref, 'wait:run-test:gate:approval-gate:approval');
  assert.equal(openedWaits[1].refs.wait_ref, 'wait:run-test:gate:approval-gate:2:approval');
  assert.notEqual(signals[0].refs.resume_signal_ref, signals[1].refs.resume_signal_ref);
  assert.equal(signals[0].refs.resume_signal_ref, 'resume_signal:run-test:gate:approval-gate:approval:approve');
  assert.equal(signals[1].refs.resume_signal_ref, 'resume_signal:run-test:gate:approval-gate:2:approval:reject');
  assert.equal(Object.keys(readModels.waits.by_ref).length, 2);
  assert.equal(readModels.waits.by_ref[openedWaits[0].refs.wait_ref].attempt, 1);
  assert.equal(readModels.waits.by_ref[openedWaits[1].refs.wait_ref].attempt, 2);
  assert.equal(Object.keys(readModels.signals.by_ref).length, 2);
});

test('gate wait refs reject overlapping retry waits while an earlier wait is open', () => {
  const config = makeConfig();

  appendWaitLifecycleEvent(config, 'wait.opened', {
    gateId: 'approval-gate',
    attempt: 1,
    waitKind: 'approval',
    occurredAt: '2026-06-03T06:00:00.000Z',
    data: { wait_kind: 'approval' },
  });

  assert.throws(
    () => appendWaitLifecycleEvent(config, 'wait.opened', {
      gateId: 'approval-gate',
      attempt: 2,
      waitKind: 'approval',
      occurredAt: '2026-06-03T06:01:00.000Z',
      data: { wait_kind: 'approval' },
    }),
    /already has an open wait/,
  );

  const events = readLifecycleEvents(config);
  assert.equal(events.filter((event) => event.type === 'wait.opened').length, 1);
});

test('failed module attempts keep the current attempt when fail_count has not advanced', () => {
  const config = makeConfig();
  const dir = 'alpha';
  const baseStatus = {
    module_id: 'alpha',
    title: 'Alpha',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    fail_count: 0,
  };

  appendModuleLifecycleEvent(config, dir, baseStatus, {
    eventType: 'module_attempt.started',
    oldStatus: 'PENDING',
    newStatus: 'IN_PROGRESS',
    now: '2026-06-03T06:00:00.000Z',
  });
  appendModuleLifecycleEvent(config, dir, {
    ...baseStatus,
    status: 'FAIL',
    completion_summary: 'first attempt failed',
  }, {
    eventType: 'module_attempt.failed',
    oldStatus: 'IN_PROGRESS',
    newStatus: 'FAIL',
    now: '2026-06-03T06:01:00.000Z',
  });
  appendModuleLifecycleEvent(config, dir, {
    ...baseStatus,
    status: 'READY_FOR_TESTING',
    fail_count: 1,
  }, {
    eventType: 'module_attempt.ready_for_testing',
    oldStatus: 'FAIL',
    newStatus: 'READY_FOR_TESTING',
    now: '2026-06-03T06:02:00.000Z',
  });

  appendModuleLifecycleEvent(config, dir, {
    ...baseStatus,
    status: 'FAIL',
    completion_summary: 'second attempt failed',
  }, {
    eventType: 'module_attempt.failed',
    oldStatus: 'READY_FOR_TESTING',
    newStatus: 'FAIL',
    now: '2026-06-03T06:03:00.000Z',
  });

  const failedEvents = readLifecycleEvents(config).filter((event) => event.type === 'module_attempt.failed');
  const readModels = loadLifecycleReadModels(config);

  assert.equal(failedEvents.length, 2);
  assert.equal(failedEvents[1].refs.attempt, 2);
  assert.equal(readModels.modules.alpha.current_attempt, 2);
  assert.equal(readModels.modules.alpha.fail_count, 2);
});

test('failed module attempts honor an advanced fail_count for direct terminal updates', () => {
  const config = makeConfig();
  const dir = 'alpha';
  const baseStatus = {
    module_id: 'alpha',
    title: 'Alpha',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    fail_count: 0,
  };

  appendModuleLifecycleEvent(config, dir, baseStatus, {
    eventType: 'module_attempt.started',
    oldStatus: 'PENDING',
    newStatus: 'IN_PROGRESS',
    now: '2026-06-03T06:00:00.000Z',
  });
  appendModuleLifecycleEvent(config, dir, {
    ...baseStatus,
    status: 'FAIL',
    completion_summary: 'first attempt failed',
  }, {
    eventType: 'module_attempt.failed',
    oldStatus: 'IN_PROGRESS',
    newStatus: 'FAIL',
    now: '2026-06-03T06:01:00.000Z',
  });
  appendModuleLifecycleEvent(config, dir, {
    ...baseStatus,
    status: 'READY_FOR_TESTING',
    fail_count: 1,
  }, {
    eventType: 'module_attempt.ready_for_testing',
    oldStatus: 'FAIL',
    newStatus: 'READY_FOR_TESTING',
    now: '2026-06-03T06:02:00.000Z',
  });
  appendModuleLifecycleEvent(config, dir, {
    ...baseStatus,
    status: 'FAIL',
    fail_count: 3,
    completion_summary: 'third attempt failed',
  }, {
    eventType: 'module_attempt.failed',
    oldStatus: 'READY_FOR_TESTING',
    newStatus: 'FAIL',
    now: '2026-06-03T06:03:00.000Z',
  });

  const failedEvents = readLifecycleEvents(config).filter((event) => event.type === 'module_attempt.failed');
  const readModels = loadLifecycleReadModels(config);

  assert.equal(failedEvents.length, 2);
  assert.equal(failedEvents[1].refs.attempt, 3);
  assert.equal(readModels.modules.alpha.current_attempt, 3);
  assert.equal(readModels.modules.alpha.fail_count, 3);
});
