import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  AGENT_OBSERVABILITY_CONTROL_STREAM,
  AGENT_OBSERVABILITY_DEADLETTER_STREAM,
  AGENT_OBSERVABILITY_REDIS_DATA_FIELD,
} from '../../../../../../skills/nova/pipeline/agent-observability/src/index.ts';
import { aggregateUsage } from '../../../../../../skills/nova/pipeline/services/observability.ts';
import { AgentObservabilityIngester } from '../../../../../../skills/nova/pipeline/services/agent-observability-ingester/consumer.ts';

function makeIngressEvent() {
  return {
    v: 1,
    type: 'openclaw.subagent.spawning',
    source: 'openclaw.plugin.agent-observer',
    ts: '2026-06-03T00:00:00.000Z',
    identity: {
      run_id: 'run-test',
      project: 'project-test',
      session_key: 'session-test',
      agent_type: 'worker',
    },
    payload: {
      hook: 'subagent_spawning',
      requester_session_key: 'session-test',
      child_run_id: 'child-run-test',
      mode: 'default',
    },
    masking: {
      profile: 'kubeclaw-agent-observer-v1-minimal-api-key-mask',
      content: 'full',
      masked: ['basic_api_key_pattern'],
    },
  };
}

function makeModelUsageEvent() {
  return {
    v: 1,
    type: 'openclaw.model.usage',
    source: 'openclaw.plugin.agent-observer',
    ts: '2026-06-03T00:00:00.000Z',
    identity: {
      run_id: 'run-test',
      project: 'project-test',
      session_key: 'session-test',
      agent_type: 'forge',
      module_id: 'alpha',
    },
    payload: {
      hook: 'model_usage',
      provider: 'openai',
      model: 'test-model',
      usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
      cost_usd: 0.25,
    },
    masking: {
      profile: 'kubeclaw-agent-observer-v1-minimal-api-key-mask',
      content: 'full',
      masked: [],
    },
  };
}

function makeCostConfig() {
  const root = fs.mkdtempSync(path.join('/home', 'observability-ingester-test-'));
  return {
    project: 'project-test',
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
    _runId: 'run-test',
    run_id: 'run-test',
  };
}

test('processEntry dead-letters non-throwing telemetry emit failures', async () => {
  const xackCalls = [];
  const xaddCalls = [];
  const redis = {
    xack: async (...args) => {
      xackCalls.push(args);
      return 1;
    },
    xadd: async (...args) => {
      xaddCalls.push(args);
      return '1-0';
    },
  };
  const ingester = new AgentObservabilityIngester({
    config: {
      enabled: true,
      redisCommandTimeoutMs: 100,
    },
    env: {},
    redisClientFactory: () => redis,
    emitEvent: async () => ({
      ok: false,
      skipped: false,
      reason: 'redis_emit_failed',
      error: new Error('down'),
    }),
  });
  const raw = JSON.stringify(makeIngressEvent());

  await ingester.processEntry({}, {
    stream: AGENT_OBSERVABILITY_CONTROL_STREAM,
    id: '1-0',
    data: { [AGENT_OBSERVABILITY_REDIS_DATA_FIELD]: raw },
    reclaimed: false,
  });

  assert.equal(ingester.getStats().emitted, 0);
  assert.equal(ingester.getStats().deadLettered, 1);
  assert.equal(ingester.getStats().acked, 1);
  assert.deepEqual(xackCalls, [[AGENT_OBSERVABILITY_CONTROL_STREAM, ingester.config.groupName, '1-0']]);
  assert.equal(xaddCalls.length, 1);
  assert.equal(xaddCalls[0][0], AGENT_OBSERVABILITY_DEADLETTER_STREAM);

  const deadLetterRecord = JSON.parse(xaddCalls[0].at(-1));
  assert.equal(deadLetterRecord.reason, 'telemetry_emit_failed');
  assert.deepEqual(deadLetterRecord.errors, ['down']);
  assert.equal(deadLetterRecord.data, raw);
});

test('model usage snapshots are idempotent when an ack failure causes replay', async () => {
  const config = makeCostConfig();
  const raw = JSON.stringify(makeModelUsageEvent());
  const xackCalls = [];
  const emittedPayloads = [];
  let xackFailuresRemaining = 2;
  const redis = {
    xack: async (...args) => {
      xackCalls.push(args);
      if (xackFailuresRemaining > 0) {
        xackFailuresRemaining -= 1;
        throw new Error('ack lost');
      }
      return 1;
    },
    xadd: async () => 'deadletter-1',
  };
  const ingester = new AgentObservabilityIngester({
    config: {
      enabled: true,
      redisCommandTimeoutMs: 100,
    },
    env: {},
    redisClientFactory: () => redis,
    emitEvent: async (_ctx, _type, payload) => {
      emittedPayloads.push(payload);
      return { ok: true };
    },
  });
  const entry = {
    stream: AGENT_OBSERVABILITY_CONTROL_STREAM,
    id: '10-0',
    data: { [AGENT_OBSERVABILITY_REDIS_DATA_FIELD]: raw },
    reclaimed: false,
  };

  await assert.rejects(() => ingester.processEntry({ config }, entry), /ack lost/);
  await ingester.processEntry({ config }, { ...entry, reclaimed: true });

  const usage = aggregateUsage(config);

  assert.equal(xackCalls.length, 3);
  assert.equal(usage.run.input_tokens, 10);
  assert.equal(usage.run.output_tokens, 20);
  assert.equal(usage.run.estimated_cost_usd, 0.25);
  assert.equal(usage.by_module.alpha.input_tokens, 10);
  assert.equal(emittedPayloads.length, 2);
  assert.equal(emittedPayloads[0].tokens_in, 10);
  assert.equal(emittedPayloads[1].tokens_in, 10);
  assert.equal(emittedPayloads[0].total_cost_usd, 0.25);
  assert.equal(emittedPayloads[1].total_cost_usd, 0.25);
});

test('readNext allows idle blocking read to exceed command timeout by poll block duration', async () => {
  const redis = {
    xgroup: async () => 'OK',
    xreadgroup: async () => new Promise((resolve) => {
      setTimeout(() => resolve(null), 25);
    }),
  };
  const ingester = new AgentObservabilityIngester({
    config: {
      enabled: true,
      pollBlockMs: 20,
      redisCommandTimeoutMs: 20,
    },
    env: {},
    redisClientFactory: () => redis,
  });

  const entries = await ingester.readNext();

  assert.deepEqual(entries, []);
});

test('trim logs and continues when Redis housekeeping times out', async () => {
  const warnings = [];
  const redis = {
    xtrim: async (_stream, _strategy, _approx, len) => {
      if (len === 1000) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return 1;
    },
  };
  const ingester = new AgentObservabilityIngester({
    config: {
      enabled: true,
      redisCommandTimeoutMs: 10,
      deadLetterMaxLen: 1000,
      controlStreamMaxLen: 2000,
    },
    env: {},
    logger: {
      info: () => {},
      error: () => {},
      debug: () => {},
      warn: (message) => warnings.push(String(message)),
    },
    redisClientFactory: () => redis,
  });

  await ingester.trim();

  assert.equal(warnings.some((entry) => entry.includes('agent observability dead-letter XTRIM failed')), true);
});

test('stop waits for in-flight start loop before closing Redis', async () => {
  const raw = JSON.stringify(makeIngressEvent());
  const xackCalls = [];
  const clients = [];
  let releaseEmit;
  const emitStarted = new Promise((resolve) => {
    releaseEmit = resolve;
  });
  let finishEmit;
  const emitFinished = new Promise((resolve) => {
    finishEmit = resolve;
  });

  function makeRedis() {
    const redis = {
      quitCalls: 0,
      xgroup: async () => 'OK',
      xreadgroup: async () => [[
        AGENT_OBSERVABILITY_CONTROL_STREAM,
        [['1-0', [AGENT_OBSERVABILITY_REDIS_DATA_FIELD, raw]]],
      ]],
      xack: async (...args) => {
        xackCalls.push(args);
        return 1;
      },
      xpending: async () => [0],
      xlen: async () => 0,
      xtrim: async () => 0,
      quit: async () => {
        redis.quitCalls += 1;
      },
    };
    clients.push(redis);
    return redis;
  }

  const ingester = new AgentObservabilityIngester({
    config: {
      enabled: true,
      redisCommandTimeoutMs: 1000,
    },
    env: {},
    redisClientFactory: makeRedis,
    emitEvent: async () => {
      releaseEmit();
      await emitFinished;
      return { ok: true };
    },
  });

  ingester.start({});
  await emitStarted;

  let stopSettled = false;
  const stopPromise = ingester.stop().then(() => {
    stopSettled = true;
  });
  await Promise.resolve();

  assert.equal(stopSettled, false);
  assert.equal(clients.length, 1);

  finishEmit();
  await stopPromise;

  assert.equal(clients.length, 1);
  assert.equal(clients[0].quitCalls, 1);
  assert.deepEqual(xackCalls, [[AGENT_OBSERVABILITY_CONTROL_STREAM, ingester.config.groupName, '1-0']]);
});

test('stop closes Redis when in-flight loop task has already failed', async () => {
  let quitCalls = 0;
  const redis = {
    xack: async () => 1,
    quit: async () => {
      quitCalls += 1;
    },
  };
  const ingester = new AgentObservabilityIngester({
    config: {
      enabled: true,
      redisCommandTimeoutMs: 1000,
    },
    env: {},
    redisClientFactory: () => redis,
  });

  await ingester.ack('1-0');
  ingester.loopTask = Promise.reject(new Error('loop failed')).catch(() => {});

  await ingester.stop();

  assert.equal(quitCalls, 1);
});
