import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendLifecycleEvent,
  applyGateCompletion,
  appendModuleLifecycleEvent,
  appendStaleRecoveryLifecycleEvent,
  appendWaitLifecycleEvent,
  applyModuleCompletion,
  loadLifecycleReadModels,
  readLifecycleEvents,
} from '../../../../../skills/nova/pipeline/services/status-store-lifecycle.ts';
import { buildLifecycleIdempotencyKey } from '../../../../../skills/nova/pipeline/services/status-store-lifecycle/idempotency.ts';
import {
  createDefaultLifecycleReadModels,
  saveLifecycleReadModels,
} from '../../../../../skills/nova/pipeline/services/status-store-lifecycle/read-models.ts';
import {
  appendJsonLine,
  lifecycleAppendLockPath,
  lifecycleEventsPath,
  withLifecycleAppendLock,
} from '../../../../../skills/nova/pipeline/services/status-store-lifecycle/storage.ts';

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
    locks: {
      lifecycle_append: {
        stale_ms: 30_000,
        retry_ms: 1,
        timeout_ms: 1000,
      },
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

test('module lifecycle refs include canonical project identity', () => {
  const config = makeConfig();
  try {
    const result = appendModuleLifecycleEvent(config, 'alpha', {
      module_id: 'alpha',
      status: 'PENDING',
      fail_count: 0,
      title: 'Alpha',
    }, {
      eventType: 'module_attempt.started',
      oldStatus: 'PENDING',
      newStatus: 'IN_PROGRESS',
      attempt: 1,
      now: '2026-06-03T06:00:00.000Z',
    });

    assert.equal(result.record.refs.project, 'test-project');
    assert.equal(result.record.refs.run_id, 'run-test');
    assert.equal(result.record.refs.module_id, 'alpha');
  } finally {
    fs.rmSync(config.repo_root, { recursive: true, force: true });
  }
});

test('read-only lifecycle read-model save updates cache without requiring a file path', () => {
  const config = makeConfig();
  config._lifecycleReadOnly = true;
  const readModels = createDefaultLifecycleReadModels(config);
  readModels.gates.review = {
    gate_id: 'review',
    status: 'PENDING',
  };

  const saved = saveLifecycleReadModels(config, readModels);

  assert.equal(saved.gates.review.status, 'PENDING');
  assert.equal(config._lifecycleReadModelsCache.gates.review.status, 'PENDING');
  assert.equal(fs.existsSync(path.join(config.paths.swarm_dir, 'logs')), false);
});

test('pipeline checkpoints append as canonical lifecycle diagnostics without changing pipeline state', () => {
  const config = makeConfig();
  const refs = {
    primary_ref: { kind: 'pipeline_run', id: 'run:run-test' },
    run_id: 'run-test',
    run_ref: 'run:run-test',
  };

  const first = appendLifecycleEvent(config, {
    type: 'pipeline.checkpoint',
    refs,
    data: { point: 'post-forge', details: { phase: 'forge' } },
  });
  const second = appendLifecycleEvent(config, {
    type: 'pipeline.checkpoint',
    refs,
    data: { point: 'post-forge', details: { phase: 'forge' } },
  });

  const events = readLifecycleEvents(config);
  const readModels = loadLifecycleReadModels(config);

  assert.equal(first.deduped, false);
  assert.equal(second.deduped, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'pipeline.checkpoint');
  assert.equal(events[0].data.point, 'post-forge');
  assert.equal(readModels.last_event_type, 'pipeline.checkpoint');
  assert.equal(readModels.pipeline, null);
});

test('lifecycle append lock is a transient file so artifact walkers never recurse into it', () => {
  const config = makeConfig();
  const lockPath = lifecycleAppendLockPath(config);

  const result = withLifecycleAppendLock(config, () => {
    const stat = fs.lstatSync(lockPath);
    assert.equal(stat.isFile(), true);
    assert.equal(stat.isDirectory(), false);
    return 'locked';
  });

  assert.equal(result, 'locked');
  assert.equal(fs.existsSync(lockPath), false);
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

test('module completion applies through lifecycle spine without requiring session identity', () => {
  const config = makeConfig();
  const dir = 'alpha';
  const status = {
    module_id: 'alpha',
    title: 'Alpha',
    status: 'TESTING',
    current_phase: 'buster',
    fail_count: 0,
    history: [],
  };
  appendModuleLifecycleEvent(config, dir, status, {
    eventType: 'module_attempt.started',
    oldStatus: 'PENDING',
    newStatus: 'IN_PROGRESS',
    phase: 'forge',
    attempt: 1,
    now: '2026-06-03T06:00:00.000Z',
  });
  appendModuleLifecycleEvent(config, dir, status, {
    eventType: 'module_attempt.testing_started',
    oldStatus: 'READY_FOR_TESTING',
    newStatus: 'TESTING',
    phase: 'buster',
    attempt: 1,
    now: '2026-06-03T06:01:00.000Z',
  });

  const result = applyModuleCompletion(config, dir, status, {
    target_kind: 'module',
    target_id: 'alpha',
    phase: 'buster',
    attempt: 1,
    status: 'PASS',
    authority: {
      kind: 'redis',
      dispatch_id: 'dispatch-1',
      key: 'run-test:1:dispatch-1',
    },
    summary: 'Buster PASS from completion evidence',
  });

  const events = readLifecycleEvents(config);
  const readModels = loadLifecycleReadModels(config);

  assert.equal(result.status.status, 'PASS');
  assert.equal(events.length, 3);
  assert.equal(events[2].type, 'module_attempt.passed');
  assert.equal(events[2].data.completion.status, 'PASS');
  assert.equal(events[2].data.completion.authority.kind, 'redis');
  assert.equal(events[2].refs.session_key, null);
  assert.equal(readModels.modules.alpha.status, 'PASS');
  assert.equal(readModels.modules.alpha.current_phase, null);
});

test('module phase lifecycle events project active session identity for crash resume', () => {
  const config = makeConfig();
  const dir = 'alpha';
  const status = {
    module_id: 'alpha',
    title: 'Alpha',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    fail_count: 0,
    history: [],
  };

  appendModuleLifecycleEvent(config, dir, status, {
    eventType: 'module_attempt.started',
    oldStatus: 'PENDING',
    newStatus: 'IN_PROGRESS',
    phase: 'forge',
    attempt: 1,
    now: '2026-06-03T06:00:00.000Z',
  });

  status.status = 'TESTING';
  status.current_phase = 'buster';
  status.active_agent = {
    dispatch_id: 'buster-dispatch-1',
    session_key: 'buster-session-1',
    gateway_label: 'buster-gateway-1',
    model: 'gpt-test',
  };

  appendModuleLifecycleEvent(config, dir, status, {
    eventType: 'module_attempt.testing_started',
    oldStatus: 'READY_FOR_TESTING',
    newStatus: 'TESTING',
    phase: 'buster',
    attempt: 1,
    now: '2026-06-03T06:01:00.000Z',
  });

  let readModels = loadLifecycleReadModels(config);
  assert.equal(readModels.modules.alpha.status, 'TESTING');
  assert.equal(readModels.modules.alpha.current_phase, 'buster');
  assert.equal(readModels.modules.alpha.dispatch_id, 'buster-dispatch-1');
  assert.equal(readModels.modules.alpha.session_key, 'buster-session-1');
  assert.equal(readModels.active_sessions.modules.alpha.dispatch_id, 'buster-dispatch-1');
  assert.equal(readModels.active_sessions.modules.alpha.session_key, 'buster-session-1');
  assert.equal(readModels.active_sessions.modules.alpha.phase, 'buster');

  appendModuleLifecycleEvent(config, dir, { ...status, status: 'PASS', active_agent: null }, {
    eventType: 'module_attempt.passed',
    oldStatus: 'TESTING',
    newStatus: 'PASS',
    phase: null,
    attempt: 1,
    now: '2026-06-03T06:03:00.000Z',
  });

  readModels = loadLifecycleReadModels(config);
  assert.equal(readModels.modules.alpha.status, 'PASS');
  assert.equal(readModels.active_sessions.modules.alpha, undefined);
});

test('module phase lifecycle event without session clears prior active session', () => {
  const config = makeConfig();
  const dir = 'alpha';
  const status = {
    module_id: 'alpha',
    title: 'Alpha',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    fail_count: 0,
    history: [],
    active_agent: {
      dispatch_id: 'forge-dispatch-1',
      session_key: 'forge-session-1',
      gateway_label: 'forge-gateway-1',
    },
  };

  appendModuleLifecycleEvent(config, dir, status, {
    eventType: 'module_attempt.started',
    oldStatus: 'PENDING',
    newStatus: 'IN_PROGRESS',
    phase: 'forge',
    attempt: 1,
    now: '2026-06-03T06:00:00.000Z',
  });
  assert.equal(loadLifecycleReadModels(config).active_sessions.modules.alpha.session_key, 'forge-session-1');

  status.status = 'TESTING';
  status.current_phase = 'buster';
  status.active_agent = null;
  appendModuleLifecycleEvent(config, dir, status, {
    eventType: 'module_attempt.testing_started',
    oldStatus: 'READY_FOR_TESTING',
    newStatus: 'TESTING',
    phase: 'buster',
    attempt: 1,
    now: '2026-06-03T06:01:00.000Z',
  });

  const readModels = loadLifecycleReadModels(config);
  assert.equal(readModels.modules.alpha.status, 'TESTING');
  assert.equal(readModels.modules.alpha.current_phase, 'buster');
  assert.equal(readModels.active_sessions.modules.alpha, undefined);
});

test('module phase lifecycle re-dispatch with identity supersedes identity-less checkpoint marker', () => {
  const config = makeConfig();
  const dir = 'alpha';
  const status = {
    module_id: 'alpha',
    title: 'Alpha',
    status: 'TESTING',
    current_phase: 'buster',
    fail_count: 0,
    history: [],
    active_agent: null,
  };

  appendModuleLifecycleEvent(config, dir, {
    ...status,
    status: 'IN_PROGRESS',
    current_phase: 'forge',
  }, {
    eventType: 'module_attempt.started',
    oldStatus: 'PENDING',
    newStatus: 'IN_PROGRESS',
    phase: 'forge',
    attempt: 1,
    now: '2026-06-03T06:00:00.000Z',
  });

  appendModuleLifecycleEvent(config, dir, status, {
    eventType: 'module_attempt.testing_started',
    oldStatus: 'READY_FOR_TESTING',
    newStatus: 'TESTING',
    phase: 'buster',
    attempt: 1,
    now: '2026-06-03T06:01:00.000Z',
  });
  assert.equal(loadLifecycleReadModels(config).active_sessions.modules.alpha, undefined);

  status.active_agent = {
    dispatch_id: 'buster-dispatch-2',
    session_key: 'buster-session-2',
    gateway_label: 'buster-gateway-2',
    model: 'gpt-test',
  };

  const result = appendModuleLifecycleEvent(config, dir, status, {
    eventType: 'module_attempt.testing_started',
    oldStatus: 'READY_FOR_TESTING',
    newStatus: 'TESTING',
    phase: 'buster',
    attempt: 1,
    now: '2026-06-03T06:02:00.000Z',
  });

  const testingStartedEvents = readLifecycleEvents(config).filter((event) => event.type === 'module_attempt.testing_started');
  const readModels = loadLifecycleReadModels(config);

  assert.equal(result.deduped, false);
  assert.equal(testingStartedEvents.length, 2);
  assert.equal(testingStartedEvents[1].refs.dispatch_id, 'buster-dispatch-2');
  assert.equal(readModels.modules.alpha.dispatch_id, 'buster-dispatch-2');
  assert.equal(readModels.modules.alpha.session_key, 'buster-session-2');
  assert.equal(readModels.active_sessions.modules.alpha.dispatch_id, 'buster-dispatch-2');
  assert.equal(readModels.active_sessions.modules.alpha.session_key, 'buster-session-2');
});

test('stale Buster recovery can preserve dispatch-only polling authority', () => {
  const config = makeConfig();
  const dir = 'alpha';
  const status = {
    module_id: 'alpha',
    title: 'Alpha',
    status: 'TESTING',
    current_phase: 'buster',
    fail_count: 0,
    history: [],
    active_agent: {
      dispatch_id: 'buster-dispatch-preserved',
      session_key: 'buster-session-terminal',
      gateway_label: 'buster-gateway-preserved',
      model: 'gpt-test',
      phase: 'buster',
    },
  };

  appendModuleLifecycleEvent(config, dir, {
    ...status,
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    active_agent: null,
  }, {
    eventType: 'module_attempt.started',
    oldStatus: 'PENDING',
    newStatus: 'IN_PROGRESS',
    phase: 'forge',
    attempt: 1,
    now: '2026-06-03T06:00:00.000Z',
  });

  appendModuleLifecycleEvent(config, dir, status, {
    eventType: 'module_attempt.testing_started',
    oldStatus: 'READY_FOR_TESTING',
    newStatus: 'TESTING',
    phase: 'buster',
    attempt: 1,
    now: '2026-06-03T06:01:00.000Z',
  });

  appendStaleRecoveryLifecycleEvent(config, {
    moduleId: 'alpha',
    dir,
    status,
    attempt: 1,
    recoveryTargetStatus: 'TESTING',
    recoveryTargetPhase: 'buster',
    recoveryAction: 'observed_terminal',
    reason: 'Buster session terminal; keep Redis completion polling authority',
    dispatchId: 'buster-dispatch-preserved',
    sessionKey: null,
    gatewayLabel: 'buster-gateway-preserved',
    staleEvidence: { preserve_for_completion_polling: true },
    occurredAt: '2026-06-03T06:02:00.000Z',
  });

  const readModels = loadLifecycleReadModels(config);
  assert.equal(readModels.modules.alpha.status, 'TESTING');
  assert.equal(readModels.modules.alpha.current_phase, 'buster');
  assert.equal(readModels.modules.alpha.dispatch_id, 'buster-dispatch-preserved');
  assert.equal(readModels.modules.alpha.session_key, 'buster-session-terminal');
  assert.equal(readModels.active_sessions.modules.alpha, undefined);
});

test('gate completion applies through lifecycle spine with idempotent retry', () => {
  const config = makeConfig();
  const gate = { type: 'approval', title: 'Architecture approval' };
  const completion = {
    target_kind: 'gate',
    target_id: 'architecture-approval',
    phase: 'approval',
    attempt: 1,
    status: 'PASS',
    authority: {
      kind: 'approval',
      approval_id: 'approval-1',
    },
    summary: 'Architecture findings approved',
    metadata: {
      gate_type: 'approval',
      outcome_class: 'passed',
    },
  };

  const first = applyGateCompletion(config, 'architecture-approval', gate, completion);
  const second = applyGateCompletion(config, 'architecture-approval', gate, completion);
  const events = readLifecycleEvents(config);
  const readModels = loadLifecycleReadModels(config);

  assert.equal(first.deduped, false);
  assert.equal(second.deduped, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'gate_evaluation.passed');
  assert.equal(events[0].refs.gate_evaluation_ref, 'gate_evaluation:run-test:architecture-approval:1');
  assert.equal(events[0].data.completion.authority.kind, 'approval');
  assert.equal(readModels.gates['architecture-approval'].status, 'PASS');
  assert.equal(readModels.gates['architecture-approval'].completed, true);
  assert.equal(readModels.gates['architecture-approval'].completion_source, 'lifecycle_completion');
});

test('failed gate completion is terminal in lifecycle read model', () => {
  const config = makeConfig();
  const gate = { type: 'buster', title: 'Final Buster' };

  applyGateCompletion(config, 'final-buster', gate, {
    target_kind: 'gate',
    target_id: 'final-buster',
    phase: 'buster',
    attempt: 1,
    status: 'FAIL',
    authority: { kind: 'artifact', path: '.swarm/buster-test/FINAL-BUSTER-RESULT.json' },
    reason_code: 'verdict_fail',
    summary: 'tailscale-preview failed',
    metadata: {
      gate_type: 'buster',
      outcome_class: 'needs_nova',
    },
  });

  const events = readLifecycleEvents(config);
  const readModels = loadLifecycleReadModels(config);

  assert.equal(events[0].type, 'gate_evaluation.failed');
  assert.equal(readModels.gates['final-buster'].status, 'FAIL');
  assert.equal(readModels.gates['final-buster'].completed, true);
  assert.equal(readModels.gates['final-buster'].scheduler_consumed, true);
  assert.equal(readModels.gates['final-buster'].completed_at, events[0].occurred_at);
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

test('blocked module attempts project blocked phase and summary from canonical events', () => {
  const config = makeConfig();
  const dir = 'alpha';
  const status = {
    module_id: 'alpha',
    title: 'Alpha',
    status: 'BLOCKED',
    current_phase: null,
    fail_count: 1,
    blockedPhase: 'delivery_lint',
    blockedReason: '[delivery_lint] SERVE_DOCKERFILE_MISSING at REAL_E2E_MISSING_DOCKERFILE',
    blockedFailCount: 1,
    validation: {
      delivery_lint_passed: false,
      delivery_lint_passed_at: null,
      pre_check_passed: false,
      pre_check_passed_at: null,
    },
  };

  appendModuleLifecycleEvent(config, dir, {
    module_id: 'alpha',
    title: 'Alpha',
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    fail_count: 0,
  }, {
    eventType: 'module_attempt.started',
    oldStatus: 'PENDING',
    newStatus: 'IN_PROGRESS',
    now: '2026-06-03T06:00:00.000Z',
  });
  appendModuleLifecycleEvent(config, dir, status, {
    eventType: 'module_attempt.blocked',
    oldStatus: 'READY_FOR_TESTING',
    newStatus: 'BLOCKED',
    blockedReason: status.blockedReason,
    blockedPhase: status.blockedPhase,
    blockedFailCount: status.blockedFailCount,
    now: '2026-06-03T06:04:00.000Z',
  });

  const readModels = loadLifecycleReadModels(config);
  const moduleState = readModels.modules.alpha;

  assert.equal(moduleState.status, 'BLOCKED');
  assert.equal(moduleState.blocked_phase, 'delivery_lint');
  assert.equal(moduleState.blocked_reason, status.blockedReason);
  assert.equal(moduleState.validation.delivery_lint_passed, false);
  assert.equal(moduleState.fail_summaries.at(-1).phase, 'delivery_lint');
  assert.match(moduleState.fail_summaries.at(-1).summary, /REAL_E2E_MISSING_DOCKERFILE/);
});
