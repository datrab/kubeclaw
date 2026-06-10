import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createPipelineEventBus } from '../../../../../skills/nova/pipeline/services/pipeline-event-contract.ts';
import { createApprovalSignalEventAdapter } from '../../../../../skills/nova/pipeline/services/approval-signal-event-adapter.ts';

test('approval signal adapter emitExisting waits when state file is absent', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-signal-watch-'));
  const statePath = path.join(tmpDir, 'deploy-gate-status.json');
  const eventBus = createPipelineEventBus();
  const controller = new AbortController();
  const identity = { gate_id: 'deploy', run_id: 'run-approval' };
  const adapter = createApprovalSignalEventAdapter({
    project: 'approval-signal-test',
    _runId: 'run-approval',
    run_id: 'run-approval',
    paths: { swarm_dir: tmpDir },
  }, {
    eventBus,
    gateId: 'deploy',
    gate: { type: 'approval' },
    statePath,
    emitExisting: true,
    debounceMs: 10,
  });

  try {
    const fatalWait = eventBus.waitForEvent('fatal.error', identity, {
      signal: controller.signal,
      timeoutMs: 75,
    });
    adapter.start();

    await assert.rejects(fatalWait, { code: 'PIPELINE_EVENT_WAIT_TIMEOUT' });

    const signalWait = eventBus.waitForEvent('approval.signal', identity, {
      signal: controller.signal,
      timeoutMs: 500,
    });
    fs.writeFileSync(statePath, JSON.stringify({
      gate_id: 'deploy',
      gate_type: 'approval',
      run_id: 'run-approval',
      project: 'approval-signal-test',
      status: 'APPROVED',
      timeout_policy: 'BLOCK',
      decision_by: 'operator',
    }));

    const event = await signalWait;
    assert.equal(event.payload.status, 'APPROVED');
    assert.equal(event.payload.signal_kind, 'approve');
    assert.equal(event.payload.state_path, statePath);
  } finally {
    controller.abort('test_done');
    adapter.stop('test_done');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
