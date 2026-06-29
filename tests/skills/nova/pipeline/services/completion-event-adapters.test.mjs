import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import { STATUS } from '../../../../../skills/nova/pipeline/core/constants.ts';
import { createPipelineEventBus } from '../../../../../skills/nova/pipeline/services/pipeline-event-contract.ts';
import { waitForBusterCompletion } from '../../../../../skills/nova/pipeline/services/buster-completion-controller.ts';
import { createLocalEvidenceEventAdapter, createRedisCompletionEventAdapter } from '../../../../../skills/nova/pipeline/services/completion-event-adapters.ts';

function completionXreadResult(id, fields) {
  return [['completion-stream', [[id, Object.entries(fields).flatMap(([key, value]) => [key, value])]]]];
}

test('redis completion entries without dispatch identity do not inherit active wait identity', async () => {
  class FakeRedis {
    static instance = null;

    constructor() {
      FakeRedis.instance = this;
      this.calls = 0;
      this.waiting = null;
    }

    on() {}

    async xread() {
      this.calls += 1;
      if (this.calls === 1) {
        return completionXreadResult('1-0', {
          type: 'completion',
          stream_role: 'completion',
          target_kind: 'gate',
          target_id: 'active-gate',
          status: 'FAIL',
          outcome: 'COMPLETION_INVALID',
          source: 'completion-invalid',
        });
      }
      return new Promise((resolve) => {
        this.waiting = resolve;
      });
    }

    disconnect() {
      this.waiting?.(null);
    }
  }

  const eventBus = createPipelineEventBus();
  const controller = new AbortController();
  const activeIdentity = {
    gate_id: 'active-gate',
    run_id: 'run-active',
    attempt: '2',
    dispatch_id: 'dispatch-active',
  };
  const expectedIdentity = {
    run_id: 'run-active',
    attempt: '2',
    dispatch_id: 'dispatch-active',
  };
  const adapter = createRedisCompletionEventAdapter({ project: 'test' }, {
    eventBus,
    identity: activeIdentity,
    stream: 'completion-stream',
    startId: '0-0',
    blockMs: 0,
    RedisCtor: FakeRedis,
    host: '127.0.0.1',
    enforceSecureMode: false,
  });

  const wait = waitForBusterCompletion({
    eventBus,
    identity: activeIdentity,
    targetKind: 'gate',
    targetId: 'active-gate',
    expectedStatuses: [STATUS.PASS, STATUS.FAIL],
    expectedIdentity,
    signal: controller.signal,
    timeoutMs: 25,
  });

  const done = adapter.start();

  await assert.rejects(wait, { code: 'PIPELINE_EVENT_WAIT_TIMEOUT' });

  controller.abort('test_done');
  adapter.stop('test_done');
  await done;
});

test('redis completion adapter treats stop-time disconnect as intentional shutdown', async () => {
  class FakeRedis {
    static instance = null;

    constructor() {
      FakeRedis.instance = this;
      this.waiting = null;
    }

    on() {}

    async xread() {
      return new Promise((_resolve, reject) => {
        this.waiting = reject;
      });
    }

    disconnect() {
      this.waiting?.(new Error("Stream isn't writeable and enableOfflineQueue options is false"));
    }
  }

  const fatalEvents = [];
  const eventBus = createPipelineEventBus();
  const originalEmit = eventBus.emit.bind(eventBus);
  eventBus.emit = (event) => {
    if (event?.type === 'fatal.error') fatalEvents.push(event);
    return originalEmit(event);
  };
  const adapter = createRedisCompletionEventAdapter({ project: 'test' }, {
    eventBus,
    identity: { gate_id: 'gate-a', run_id: 'run-a' },
    stream: 'completion-stream',
    startId: '0-0',
    blockMs: 0,
    RedisCtor: FakeRedis,
    host: '127.0.0.1',
    enforceSecureMode: false,
  });

  const done = adapter.start();
  await sleep(10);
  adapter.stop('test_done');
  await done;

  assert.deepEqual(fatalEvents, []);
});

test('local evidence adapter follows target creation through a missing parent directory', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-evidence-watch-'));
  const targetPath = path.join(tmpDir, 'new-dir', 'output.json');
  const eventBus = createPipelineEventBus();
  const controller = new AbortController();
  const identity = { module_id: 'module-1' };
  const adapter = createLocalEvidenceEventAdapter({ project: 'test' }, {
    eventBus,
    identity,
    paths: [targetPath],
    debounceMs: 10,
  });

  adapter.start();
  try {
    const eventPromise = eventBus.waitForEvent('local.evidence.updated', identity, {
      signal: controller.signal,
      timeoutMs: 500,
    });
    fs.mkdirSync(path.dirname(targetPath));
    fs.writeFileSync(targetPath, '{"status":"PASS"}\n');
    const event = await eventPromise;

    assert.deepEqual(event.payload.paths, [targetPath]);
  } finally {
    controller.abort('test_done');
    adapter.stop('test_done');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
