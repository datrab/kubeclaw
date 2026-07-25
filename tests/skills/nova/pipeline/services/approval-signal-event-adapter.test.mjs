import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createPipelineEventBus } from '../../../../../skills/nova/pipeline/services/pipeline-event-contract.ts';
import {
  buildApprovalSignalEvent,
  buildApprovalSignalRedisEntry,
  createApprovalSignalEventAdapter,
  createRedisApprovalSignalEventAdapter,
  publishApprovalSignalEvent,
} from '../../../../../skills/nova/pipeline/services/approval-signal-event-adapter.ts';

function installFakeWatch() {
  const originalWatch = fs.watch;
  const calls = [];
  fs.watch = (watchPath, listener) => {
    const watcher = {
      watchPath,
      listener,
      close() {},
      on() { return watcher; },
    };
    calls.push(watcher);
    return watcher;
  };
  return {
    calls,
    restore() {
      fs.watch = originalWatch;
    },
  };
}

function approvalState(gateId = 'deploy', status = 'APPROVED') {
  return {
    gate_id: gateId,
    gate_type: 'approval',
    run_id: 'run-approval',
    project: 'approval-signal-test',
    status,
    timeout_policy: 'BLOCK',
    decision_by: 'operator',
  };
}

function filesystemApprovalFixture(prefix, relativeStatePath = 'deploy-gate-status.json', options = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const statePath = path.join(tmpDir, relativeStatePath);
  const eventBus = createPipelineEventBus();
  const controller = new AbortController();
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
    debounceMs: 10,
    ...options,
  });
  return { tmpDir, statePath, eventBus, controller, adapter };
}

function stopApprovalFixture(fixture, fakeWatch) {
  fixture.controller.abort('test_done');
  fixture.adapter.stop('test_done');
  fakeWatch.restore();
  fs.rmSync(fixture.tmpDir, { recursive: true, force: true });
}

test('approval signal adapter emitExisting waits when state file is absent', async () => {
  const fakeWatch = installFakeWatch();
  const fixture = filesystemApprovalFixture('approval-signal-watch-', 'deploy-gate-status.json', { emitExisting: true });
  const { statePath, eventBus, controller, adapter } = fixture;
  const identity = { gate_id: 'deploy', run_id: 'run-approval' };

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
    fs.writeFileSync(statePath, JSON.stringify(approvalState()));
    fakeWatch.calls[0].listener('change', path.basename(statePath));

    const event = await signalWait;
    assert.equal(event.payload.status, 'APPROVED');
    assert.equal(event.payload.signal_kind, 'approve');
    assert.equal(event.payload.state_path, statePath);
  } finally {
    stopApprovalFixture(fixture, fakeWatch);
  }
});

test('approval signal adapter creates the canonical state directory before watching', async () => {
  const fakeWatch = installFakeWatch();
  const fixture = filesystemApprovalFixture(
    'approval-signal-missing-dir-',
    path.join('missing', 'nested', 'deploy-gate-status.json'),
  );
  const { statePath, eventBus, controller, adapter } = fixture;
  const identity = { gate_id: 'deploy', run_id: 'run-approval' };

  try {
    const fatalWait = eventBus.waitForEvent('fatal.error', identity, {
      signal: controller.signal,
      timeoutMs: 75,
    });
    const started = adapter.start();
    assert.equal(started.watching, 1);
    assert.equal(fs.existsSync(path.dirname(statePath)), true);
    await assert.rejects(fatalWait, { code: 'PIPELINE_EVENT_WAIT_TIMEOUT' });

    const signalWait = eventBus.waitForEvent('approval.signal', identity, {
      signal: controller.signal,
      timeoutMs: 500,
    });
    fs.writeFileSync(statePath, JSON.stringify(approvalState()));
    fakeWatch.calls[0].listener('change', path.basename(statePath));

    const event = await signalWait;
    assert.equal(event.payload.status, 'APPROVED');
  } finally {
    stopApprovalFixture(fixture, fakeWatch);
  }
});

test('approval signal adapter shares one filesystem watcher per directory', async () => {
  const fakeWatch = installFakeWatch();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-signal-shared-'));
  const firstStatePath = path.join(tmpDir, 'deploy-gate-status.json');
  const secondStatePath = path.join(tmpDir, 'release-gate-status.json');
  const eventBus = createPipelineEventBus();
  const controller = new AbortController();
  const firstIdentity = { gate_id: 'deploy', run_id: 'run-approval' };
  const secondIdentity = { gate_id: 'release', run_id: 'run-approval' };

  const baseConfig = {
    project: 'approval-signal-test',
    _runId: 'run-approval',
    run_id: 'run-approval',
    paths: { swarm_dir: tmpDir },
  };
  const firstAdapter = createApprovalSignalEventAdapter(baseConfig, {
    eventBus,
    gateId: 'deploy',
    gate: { type: 'approval' },
    statePath: firstStatePath,
    debounceMs: 10,
  });
  const secondAdapter = createApprovalSignalEventAdapter(baseConfig, {
    eventBus,
    gateId: 'release',
    gate: { type: 'approval' },
    statePath: secondStatePath,
    debounceMs: 10,
  });

  try {
    assert.equal(firstAdapter.start().watching, 1);
    assert.equal(secondAdapter.start().watching, 1);
    assert.equal(fakeWatch.calls.length, 1);

    const firstWait = eventBus.waitForEvent('approval.signal', firstIdentity, {
      signal: controller.signal,
      timeoutMs: 500,
    });
    fs.writeFileSync(firstStatePath, JSON.stringify(approvalState()));
    fakeWatch.calls[0].listener('change', path.basename(firstStatePath));

    const firstEvent = await firstWait;
    assert.equal(firstEvent.payload.gate_id, 'deploy');

    const secondWait = eventBus.waitForEvent('approval.signal', secondIdentity, {
      signal: controller.signal,
      timeoutMs: 500,
    });
    fs.writeFileSync(secondStatePath, JSON.stringify(approvalState('release', 'REJECTED')));
    fakeWatch.calls[0].listener('change', path.basename(secondStatePath));

    const secondEvent = await secondWait;
    assert.equal(secondEvent.payload.gate_id, 'release');
  } finally {
    controller.abort('test_done');
    firstAdapter.stop('test_done');
    secondAdapter.stop('test_done');
    fakeWatch.restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('approval signal adapter classifies inotify exhaustion as watcher limit reached', async () => {
  const originalWatch = fs.watch;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-signal-emfile-'));
  const statePath = path.join(tmpDir, 'deploy-gate-status.json');
  const eventBus = createPipelineEventBus();
  const controller = new AbortController();
  const identity = { gate_id: 'deploy', run_id: 'run-approval' };

  fs.watch = () => {
    const error = new Error(`EMFILE: too many open files, watch '${tmpDir}'`);
    error.code = 'EMFILE';
    throw error;
  };

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
    debounceMs: 10,
  });

  try {
    const fatalWait = eventBus.waitForEvent('fatal.error', identity, {
      signal: controller.signal,
      timeoutMs: 500,
    });
    const started = adapter.start();
    assert.equal(started.watching, 0);

    const event = await fatalWait;
    assert.equal(event.payload.reason, 'watcher_limit_reached');
    assert.equal(event.payload.error_code, 'EMFILE');
    assert.equal(event.payload.watch_path, tmpDir);
  } finally {
    controller.abort('test_done');
    adapter.stop('test_done');
    fs.watch = originalWatch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('redis approval signal adapter emits without filesystem watcher access', async () => {
  const originalWatch = fs.watch;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-signal-redis-'));
  const eventBus = createPipelineEventBus();
  const controller = new AbortController();
  const identity = { gate_id: 'deploy', run_id: 'run-approval' };
  const streamKey = 'swarm:pipeline:approval-signal-test:run-approval:approval-signals';

  fs.watch = () => {
    const error = new Error('fs.watch must not be used by Redis approval adapter');
    error.code = 'EMFILE';
    throw error;
  };

  const event = buildApprovalSignalEvent({
    project: 'approval-signal-test',
    _runId: 'run-approval',
    run_id: 'run-approval',
    paths: { swarm_dir: tmpDir },
  }, 'deploy', { type: 'approval' }, {
    gate_id: 'deploy',
    gate_type: 'approval',
    run_id: 'run-approval',
    project: 'approval-signal-test',
    status: 'APPROVED',
    timeout_policy: 'BLOCK',
    decision_by: 'operator',
    continued: true,
  }, {
    statePath: path.join(tmpDir, 'deploy-gate-status.json'),
  });
  const entry = buildApprovalSignalRedisEntry(event);
  const fields = Object.entries(entry).flatMap(([key, value]) => [key, value ?? '']);
  let readCount = 0;
  const redisClient = {
    on() {},
    disconnect() {},
    async xread(...args) {
      assert.deepEqual(args.slice(-2), [streamKey, readCount === 0 ? '0-0' : '1-0']);
      readCount += 1;
      if (readCount === 1) return [[streamKey, [['1-0', fields]]]];
      await new Promise((resolve) => setTimeout(resolve, 20));
      return null;
    },
  };

  const adapter = createRedisApprovalSignalEventAdapter({
    project: 'approval-signal-test',
    _runId: 'run-approval',
    run_id: 'run-approval',
    paths: { swarm_dir: tmpDir },
  }, {
    eventBus,
    gateId: 'deploy',
    gate: { type: 'approval' },
    streamKey,
    redisClient,
    blockMs: 1,
  });

  try {
    const signalWait = eventBus.waitForEvent('approval.signal', identity, {
      signal: controller.signal,
      timeoutMs: 500,
    });
    adapter.start();
    const received = await signalWait;
    assert.equal(received.source, 'redis');
    assert.equal(received.payload.status, 'APPROVED');
    assert.equal(received.payload.signal_kind, 'approve');
  } finally {
    controller.abort('test_done');
    adapter.stop('test_done');
    fs.watch = originalWatch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('approval signal publisher writes one canonical Redis entry', async () => {
  const calls = [];
  const redisClient = {
    async xadd(...args) {
      calls.push(args);
      return '7-0';
    },
  };
  const event = {
    type: 'approval.signal',
    source: 'local_fs',
    identity: { gate_id: 'deploy', run_id: 'run-approval' },
    payload: {
      gate_id: 'deploy',
      gate_type: 'approval',
      run_id: 'run-approval',
      project: 'approval-signal-test',
      wait_ref: null,
      status: 'REJECTED',
      signal_kind: 'reject',
      requested_at: null,
      deadline: null,
      timeout_minutes: null,
      timeout_policy: 'BLOCK',
      resolved_at: null,
      decision_by: 'operator',
      decision_via: 'unit-test',
      continued: false,
      reason: 'no',
      state_path: '/tmp/deploy-gate-status.json',
      updated_at: null,
    },
  };

  const published = await publishApprovalSignalEvent(redisClient, 'stream-key', event, { source: 'unit_test' });
  assert.equal(published.id, '7-0');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'stream-key');
  assert.equal(calls[0][1], 'MAXLEN');
  const typeIndex = calls[0].indexOf('type');
  assert.equal(calls[0][typeIndex + 1], 'approval.signal');
  const payloadIndex = calls[0].indexOf('payload');
  assert.equal(JSON.parse(calls[0][payloadIndex + 1]).status, 'REJECTED');
});
