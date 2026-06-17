#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendModuleLifecycleEvent,
  appendPipelineLifecycleEvent,
  appendWaitLifecycleEvent,
  loadLifecycleReadModels,
  readLifecycleEvents,
  rebuildLifecycleReadModels,
  saveLifecycleReadModels,
} from '../../../skills/nova/pipeline/services/status-store.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-read-model-replay-contract-'));

try {
  const runId = 'run-lifecycle-replay';
  const moduleId = '01-replay';
  const gateId = 'approval';
  const config = {
    project: 'lifecycle-replay-contract',
    repo_root: root,
    run_id: runId,
    _runId: runId,
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
    _progress: {
      execution_order: [moduleId],
      modules: {
        [moduleId]: {
          title: 'Replay module',
          dir: moduleId,
          stages: ['forge', 'buster'],
        },
      },
      gates: {
        [gateId]: {
          type: 'approval',
          title: 'Approval',
        },
      },
    },
  };

  appendPipelineLifecycleEvent(config, 'pipeline_run.started', {
    progress: config._progress,
    opts: { resume: false },
  });
  appendModuleLifecycleEvent(config, moduleId, {
    module_id: moduleId,
    status: 'IN_PROGRESS',
    current_phase: 'forge',
    active_agent: {
      attempt: 1,
      dispatch_id: 'dispatch-module-1',
      gateway_label: 'gateway-module',
      session_key: 'session-module',
    },
  }, {
    eventType: 'module_attempt.started',
    attempt: 1,
    oldStatus: 'PENDING',
    now: '2026-06-17T00:00:01.000Z',
  });
  appendModuleLifecycleEvent(config, moduleId, {
    module_id: moduleId,
    status: 'PASS',
    current_phase: null,
    completion_summary: 'module passed',
    active_agent: {
      attempt: 1,
      dispatch_id: 'dispatch-module-1',
      gateway_label: 'gateway-module',
      session_key: 'session-module',
    },
  }, {
    eventType: 'module_attempt.passed',
    attempt: 1,
    oldStatus: 'TESTING',
    previousPhase: 'buster',
    now: '2026-06-17T00:00:02.000Z',
  });
  appendWaitLifecycleEvent(config, 'wait.opened', {
    gateId,
    gateType: 'approval',
    attempt: 1,
    waitKind: 'approval',
    data: {
      wait_kind: 'approval',
      requested_at: '2026-06-17T00:00:03.000Z',
      deadline: '2026-06-17T00:10:03.000Z',
      timeout_minutes: 10,
      timeout_policy: 'block',
      gate_title: 'Approval',
      request_artifact_path: '.swarm/logs/gates/approval/approval-request.json',
    },
    occurredAt: '2026-06-17T00:00:03.000Z',
  });
  appendWaitLifecycleEvent(config, 'resume_signal.received', {
    gateId,
    gateType: 'approval',
    attempt: 1,
    waitKind: 'approval',
    signalKind: 'approve',
    data: {
      signal_kind: 'approve',
      received_via: 'discord',
      decision_by: 'operator',
      reason: 'approved',
    },
    occurredAt: '2026-06-17T00:00:04.000Z',
  });
  appendWaitLifecycleEvent(config, 'wait.closed', {
    gateId,
    gateType: 'approval',
    attempt: 1,
    waitKind: 'approval',
    data: {
      close_reason: 'signaled',
      closed_at: '2026-06-17T00:00:05.000Z',
      resolution_kind: 'approved',
      decision_by: 'operator',
      decision_via: 'discord',
    },
    occurredAt: '2026-06-17T00:00:05.000Z',
  });

  const canonical = loadLifecycleReadModels(config);
  assert.equal(canonical.modules[moduleId].status, 'PASS');
  assert.equal(canonical.gates[gateId].status, 'APPROVED');
  assert.equal(canonical.gates[gateId].projection_source, 'canonical-events');
  assert.equal(canonical.progression.modules_passed, 1);

  saveLifecycleReadModels(config, {
    ...canonical,
    last_event_id: 'stale-event',
    event_count: 0,
    modules: {
      [moduleId]: {
        module_id: moduleId,
        status: 'FAIL',
        projection_source: 'stale-file',
      },
    },
    gates: {
      [gateId]: {
        gate_id: gateId,
        status: 'REJECTED',
        projection_source: 'stale-file',
      },
    },
  });

  const caughtUp = loadLifecycleReadModels(config);
  assert.equal(caughtUp.modules[moduleId].status, 'PASS');
  assert.equal(caughtUp.modules[moduleId].projection_source, 'canonical-events');
  assert.equal(caughtUp.gates[gateId].status, 'APPROVED');
  assert.equal(caughtUp.gates[gateId].projection_source, 'canonical-events');

  const readModelsPath = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', runId, 'lifecycle', 'read-models.json');
  fs.rmSync(readModelsPath, { force: true });
  delete config._lifecycleReadModelsCache;
  const rebuiltFromMissingProjection = loadLifecycleReadModels(config);
  assert.equal(rebuiltFromMissingProjection.modules[moduleId].status, 'PASS');
  assert.equal(rebuiltFromMissingProjection.gates[gateId].status, 'APPROVED');

  const replayed = rebuildLifecycleReadModels(config, readLifecycleEvents(config));
  assert.deepEqual(
    {
      pipeline: replayed.pipeline.status,
      module: replayed.modules[moduleId].status,
      gate: replayed.gates[gateId].status,
      events: replayed.event_count,
    },
    {
      pipeline: rebuiltFromMissingProjection.pipeline.status,
      module: rebuiltFromMissingProjection.modules[moduleId].status,
      gate: rebuiltFromMissingProjection.gates[gateId].status,
      events: rebuiltFromMissingProjection.event_count,
    },
  );

  console.log(JSON.stringify({
    ok: true,
    contract: 'lifecycle-read-model-replay',
    run_id: runId,
    event_count: replayed.event_count,
    module_status: replayed.modules[moduleId].status,
    gate_status: replayed.gates[gateId].status,
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
