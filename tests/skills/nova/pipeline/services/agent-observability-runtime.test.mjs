import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AGENT_OBSERVABILITY_CONTROL_STREAM,
  AGENT_OBSERVABILITY_REDIS_DATA_FIELD,
} from '../../../../../skills/nova/pipeline/agent-observability/src/index.ts';
import { startAgentObservabilityIngester } from '../../../../../skills/nova/pipeline/services/agent-observability-runtime.ts';

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
      masked: [],
    },
  };
}

function waitFor(promise, ms = 1000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out waiting for runtime ingester')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function observabilityConfig(overrides = {}) {
  return {
    ingester: {
      enabled: true,
      groupName: 'kubeclaw-agent-observability-ingester',
      consumerName: 'kubeclaw-agent-observability-ingester-1',
    },
    profile: 'test',
    profiles: {
      test: {
        redis: { command_timeout_ms: 50 },
        streams: { stream_max_len: 10000, dead_letter_max_len: 1000 },
        ingester: {
          read: { block_ms: 5, reclaim_idle_ms: 60000 },
          loop: { delay_ms: 1, stop_timeout_ms: 2000, health_check_every: 0 },
          trim: { interval_ms: 5000, payload_stream_max_len: 5000 },
          pressure: {
            control_lag_degraded_threshold: 1000,
            payload_pressure_degraded_threshold: 10000,
          },
        },
      },
    },
  };
}

test('runtime forwards ingester dependency injection options', async () => {
  const raw = JSON.stringify(makeIngressEvent());
  const xackCalls = [];
  let readCount = 0;
  let emittedResolve;
  const emitted = new Promise((resolve) => {
    emittedResolve = resolve;
  });
  const redis = {
    xgroup: async () => 'OK',
    xreadgroup: async () => {
      if (readCount > 0) return [];
      readCount += 1;
      return [[
        AGENT_OBSERVABILITY_CONTROL_STREAM,
        [['1-0', [AGENT_OBSERVABILITY_REDIS_DATA_FIELD, raw]]],
      ]];
    },
    xack: async (...args) => {
      xackCalls.push(args);
      return 1;
    },
    quit: async () => {},
  };
  const config = {
    project: 'project-test',
    agent_observability: observabilityConfig(),
  };
  const runtime = startAgentObservabilityIngester(config, { requestId: 'ctx-test' }, {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    redisClientFactory: () => redis,
    emitEvent: async (ctx, eventType, payload) => {
      emittedResolve({ ctx, eventType, payload });
      return { ok: true };
    },
  });

  const emission = await waitFor(emitted);
  await runtime.stop();

  assert.equal(runtime.started, true);
  assert.equal(emission.ctx.requestId, 'ctx-test');
  assert.equal(emission.ctx.config, config);
  assert.equal(emission.eventType, 'agent.spawn.requested');
  assert.equal(emission.payload.requester_session_key, 'session-test');
  assert.deepEqual(xackCalls, [[AGENT_OBSERVABILITY_CONTROL_STREAM, 'kubeclaw-agent-observability-ingester', '1-0']]);
});
