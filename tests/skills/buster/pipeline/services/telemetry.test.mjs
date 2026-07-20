import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { emitEvent } from '../../../../../skills/buster/pipeline/services/telemetry.ts';

function makeTelemetryContext(pipelineLogPath, redisDetail = 'redis client unavailable') {
  return {
    redis: null,
    streamKey: 'pipeline:telemetry:project-a:run-a',
    seqKey: 'pipeline:telemetry:seq:project-a:run-a',
    project: 'project-a',
    runId: 'run-a',
    moduleId: 'module-a',
    emitter: 'buster/pipeline/services/telemetry.test',
    logDir: null,
    pipelineLogPath,
    pipelineRunLogPath: null,
    attempt: 1,
    dispatchId: 'dispatch-a',
    sessionKey: 'session-a',
    gateId: null,
    gateType: null,
    _health: {
      redis: {
        degraded: false,
        degradedAt: null,
        detail: redisDetail,
      },
    },
  };
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeRedisMock({ failRestoredOnce = false, onRestoredExec = null, waitForRestoredExec = null } = {}) {
  let seq = 0;
  let execCount = 0;
  const xaddEvents = [];
  return {
    xaddEvents,
    async incr() {
      seq += 1;
      return seq;
    },
    multi() {
      const commands = [];
      return {
        xadd(...args) {
          commands.push(args);
          return this;
        },
        expire() {
          return this;
        },
        async exec() {
          execCount += 1;
          const dataArg = commands[0]?.[6];
          const event = typeof dataArg === 'string' ? JSON.parse(dataArg) : null;
          if (event?.type === 'observability.restored') onRestoredExec?.();
          if (failRestoredOnce && execCount === 2) {
            throw new Error('restored write failed');
          }
          if (event?.type === 'observability.restored' && waitForRestoredExec) {
            await waitForRestoredExec;
          }
          if (event) xaddEvents.push(event);
          return [];
        },
      };
    },
    async quit() {},
    on() {},
  };
}

test('payload fields cannot override canonical telemetry envelope fields', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-telemetry-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pipelineLogPath = path.join(dir, 'pipeline.jsonl');
  const redis = makeRedisMock();
  const ctx = makeTelemetryContext(pipelineLogPath);
  ctx.redis = redis;

  await emitEvent(ctx, 'rate_limit.detected', {
    run_id: 'payload-run',
    source: 'payload-source',
    emitter: 'payload-emitter',
    module_id: 'payload-module',
    provider: 'provider-a',
    pause_count: 1,
  });

  const [artifactEvent] = readJsonl(pipelineLogPath);
  const [redisEvent] = redis.xaddEvents;
  assert.equal(artifactEvent.type, 'rate_limit.detected');
  assert.equal(artifactEvent.project, 'project-a');
  assert.equal(artifactEvent.run_id, 'run-a');
  assert.equal(artifactEvent.seq, 1);
  assert.equal(artifactEvent.source, 'buster');
  assert.equal(artifactEvent.producer, 'buster/pipeline/services/telemetry.test');
  assert.equal(artifactEvent.module_id, 'payload-module');
  assert.deepEqual(redisEvent, artifactEvent);
});

test('invalid telemetry degraded artifact preserves validation diagnostics', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-telemetry-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pipelineLogPath = path.join(dir, 'pipeline.jsonl');
  const ctx = makeTelemetryContext(pipelineLogPath);

  await emitEvent(ctx, 'plugin.event.token=supersecretvalue123456', {});

  const [event] = readJsonl(pipelineLogPath);
  const serialized = JSON.stringify(event);
  assert.equal(event.schema_version, 'quarantined_payload.v1');
  assert.equal(event.reason_code, 'TRANSPORT_UNAVAILABLE');
  assert.doesNotMatch(serialized, /supersecretvalue123456/);
});

test('redis degraded artifact preserves runtime error detail', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-telemetry-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pipelineLogPath = path.join(dir, 'pipeline.jsonl');
  const ctx = makeTelemetryContext(
    pipelineLogPath,
    'redis auth failed with Bearer abcdefghijklmnop1234567890',
  );

  await emitEvent(ctx, 'plugin.event', {
    plugin_id: 'plugin-a',
    plugin_event: 'started',
    details: {},
  });

  const [event] = readJsonl(pipelineLogPath);
  const serialized = JSON.stringify(event);
  assert.equal(event.schema_version, 'quarantined_payload.v1');
  assert.equal(event.reason_code, 'TRANSPORT_UNAVAILABLE');
  assert.doesNotMatch(serialized, /abcdefghijklmnop1234567890/);
});

test('failed restored redis write keeps degradation pending for retry', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-telemetry-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pipelineLogPath = path.join(dir, 'pipeline.jsonl');
  const redis = makeRedisMock({ failRestoredOnce: true });
  const ctx = makeTelemetryContext(pipelineLogPath);
  ctx.redis = redis;
  ctx._health.redis.degraded = true;
  ctx._health.redis.degradedAt = new Date(Date.now() - 1000).toISOString();

  await emitEvent(ctx, 'plugin.event', {
    plugin_id: 'plugin-a',
    plugin_event: 'started',
    details: {},
  });

  assert.equal(ctx._health.redis.degraded, true);

  await emitEvent(ctx, 'plugin.event', {
    plugin_id: 'plugin-a',
    plugin_event: 'finished',
    details: {},
  });

  assert.equal(ctx._health.redis.degraded, false);
  assert.deepEqual(
    redis.xaddEvents.map((event) => event.type),
    ['plugin.event', 'plugin.event', 'observability.restored'],
  );
});

test('concurrent redis emits publish one restored event', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-telemetry-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pipelineLogPath = path.join(dir, 'pipeline.jsonl');
  const restoredExecStarted = createDeferred();
  const releaseRestoredExec = createDeferred();
  const redis = makeRedisMock({
    onRestoredExec: restoredExecStarted.resolve,
    waitForRestoredExec: releaseRestoredExec.promise,
  });
  const ctx = makeTelemetryContext(pipelineLogPath);
  ctx.redis = redis;
  ctx._health.redis.degraded = true;
  ctx._health.redis.degradedAt = new Date(Date.now() - 1000).toISOString();

  const firstEmit = emitEvent(ctx, 'plugin.event', {
    plugin_id: 'plugin-a',
    plugin_event: 'started',
    details: {},
  });
  const secondEmit = emitEvent(ctx, 'plugin.event', {
    plugin_id: 'plugin-a',
    plugin_event: 'finished',
    details: {},
  });

  await restoredExecStarted.promise;
  releaseRestoredExec.resolve();
  await Promise.all([firstEmit, secondEmit]);

  assert.equal(ctx._health.redis.degraded, false);
  assert.equal(
    redis.xaddEvents.filter((event) => event.type === 'observability.restored').length,
    1,
  );
  assert.equal(
    redis.xaddEvents.filter((event) => event.type === 'plugin.event').length,
    2,
  );
});
