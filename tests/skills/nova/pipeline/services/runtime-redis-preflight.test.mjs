import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __runtimeRedisPreflightTest,
  preflightRuntimeRedis,
} from '../../../../../skills/nova/pipeline/services/runtime-redis-preflight.ts';

function agentObservabilityProfile(overrides = {}) {
  return {
    ingester: {
      enabled: true,
      groupName: 'pipeline-ingester',
      consumerName: 'pipeline-ingester-1',
      read_block_ms: 10,
      reclaim_idle_ms: 60000,
      redis_command_timeout_ms: 25,
      loop: { delay_ms: 1, stop_timeout_ms: 100, health_check_every: 0 },
      trim: { interval_ms: 1000, payload_stream_max_len: 1000 },
      pressure: {
        control_lag_degraded_threshold: 100,
        payload_pressure_degraded_threshold: 100,
      },
      ...overrides,
    },
    streams: { stream_max_len: 1000, dead_letter_max_len: 100 },
  };
}

test('runtime Redis preflight uses telemetry and ingester config as the single surface authority', () => {
  const surfaces = __runtimeRedisPreflightTest.redisSurfaces({
    telemetry: {
      enabled: true,
      sink_timeout_ms: 50,
      redisHost: 'redis.telemetry.internal',
      redisPort: 6379,
      redisPassword: 'secret',
    },
    agent_observability: agentObservabilityProfile({
      redisHost: 'redis.ingester.internal',
      redisPort: 6379,
      redisPassword: 'secret',
      redis_command_timeout_ms: 75,
    }),
  });

  assert.deepEqual(surfaces.map(surface => [surface.name, surface.timeoutMs]), [
    ['telemetry', 50],
    ['agent_observability_ingester', 75],
  ]);
});

test('runtime Redis preflight rejects insecure Redis through the canonical transport policy', async () => {
  await assert.rejects(
    () => preflightRuntimeRedis({
      telemetry: {
        enabled: true,
        sink_timeout_ms: 50,
        redisHost: 'redis.internal',
        redisPort: 6379,
      },
    }),
    error => {
      assert.equal(error.code, 'SECURE_REDIS_TRANSPORT_POLICY_VIOLATION');
      assert.equal(error.surface, 'telemetry');
      return true;
    },
  );
});
