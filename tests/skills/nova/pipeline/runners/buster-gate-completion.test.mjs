import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { waitBusterGateCompletionEvidence } from '../../../../../skills/nova/pipeline/runners/buster-gate-completion.ts';

function completionXreadResult(id, fields) {
  return [['completion-stream', [[id, Object.entries(fields).flatMap(([key, value]) => [key, value])]]]];
}

function makeConfig() {
  const root = fs.mkdtempSync(path.join('/home', 'buster-gate-completion-'));
  const swarmDir = path.join(root, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'test-project',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
    },
    buster: {
      runtime: {
        heartbeat_interval_ms: 1,
        task_poll_interval_ms: 1,
        task_pending_reclaim_idle_ms: 1,
        completion_event_block_ms: 0,
        completion_recovery_scan_interval_ms: 1,
        task_stream_max_len: 1,
      },
    },
    redis_completion: { archive_max_len: 1000, tail_scan_batch_size: 100, tail_scan_limit: 1000 },
    event_adapters: { local_evidence_debounce_ms: 1, approval_signal_debounce_ms: 1 },
    _runId: 'run-test',
    run_id: 'run-test',
  };
}

test('gate completion compares immediate Redis terminal verdicts with pre-existing local output', async () => {
  class FakeRedis {
    constructor() {
      this.calls = 0;
      this.waiting = null;
    }

    on() {}

    async xread() {
      this.calls += 1;
      if (this.calls === 1) {
        return completionXreadResult('1-0', {
          _id: '1-0',
          schema_version: 'v1',
          type: 'completion',
          stream_role: 'completion',
          project: 'test-project',
          target_kind: 'gate',
          target_id: 'buster',
          gate_id: 'buster',
          gate_type: 'buster',
          status: 'FAIL',
          outcome: 'FAIL',
          source: 'agent',
          run_id: 'run-test',
          attempt: '1',
          dispatch_id: 'dispatch-test',
          session_key: 'session-test',
          gateway_label: 'gateway-test',
          timestamp: '2026-06-03T00:00:00.000Z',
        });
      }
      return new Promise((resolve) => {
        this.waiting = resolve;
      });
    }

    async xrevrange() {
      return [];
    }

    disconnect() {
      this.waiting?.(null);
    }
  }

  const config = makeConfig();
  const gate = {
    type: 'buster',
    output_file: 'buster-output.json',
  };
  fs.writeFileSync(
    path.join(config.paths.swarm_dir, gate.output_file),
    JSON.stringify({ gate: 'buster', status: 'PASS', summary: 'local pass' }),
  );

  const result = await waitBusterGateCompletionEvidence({
    deps: {
      pollResult: (ok, reason, data) => ({ ok, reason, data }),
      _explicitDeps: {
        completionEventAdapters: {
          RedisCtor: FakeRedis,
          redisOptions: { host: '127.0.0.1', port: '6379', enforceSecureMode: false },
        },
      },
    },
    config,
    gateId: 'buster',
    gate,
    completionIdentity: {
      runId: 'run-test',
      attempt: '1',
      dispatchId: 'dispatch-test',
      sessionKey: 'session-test',
      gateway_label: 'gateway-test',
    },
    gateRateLimitStatusOptions: {},
    timeoutMinutes: 1,
  });

  assert.equal(result.reason, 'completion_conflict');
  assert.equal(result.data.status, 'PASS');
  assert.equal(result.data.redis_status, 'FAIL');
  assert.equal(result.data.authority_policy.local_status, 'PASS');
  assert.equal(result.data.authority_policy.code, 'redis_terminal_conflicts_with_terminal_status');
});

test('gate completion stops Redis adapter when local adapter start throws', async () => {
  let resolveRedisDone;
  const calls = [];

  const config = makeConfig();
  const gate = {
    type: 'buster',
    output_file: 'buster-output.json',
  };

  await assert.rejects(
    waitBusterGateCompletionEvidence({
      deps: {
        pollResult: (ok, reason, data) => ({ ok, reason, data }),
        _explicitDeps: {
          completionEventAdapters: {
            createRedisCompletionEventAdapter: () => ({
              start: () => {
                calls.push('redis:start');
                return new Promise((resolve) => {
                  resolveRedisDone = resolve;
                });
              },
              stop: (reason) => {
                calls.push(`redis:stop:${reason}`);
                resolveRedisDone?.({ stopped: true });
              },
            }),
            createLocalEvidenceEventAdapter: () => ({
              start: () => {
                calls.push('local:start');
                throw new Error('local start failed');
              },
              stop: (reason) => {
                calls.push(`local:stop:${reason}`);
              },
            }),
          },
        },
      },
      config,
      gateId: 'buster',
      gate,
      completionIdentity: {
        runId: 'run-test',
        attempt: '1',
        dispatchId: 'dispatch-test',
        sessionKey: 'session-test',
        gateway_label: 'gateway-test',
      },
      gateRateLimitStatusOptions: {},
      timeoutMinutes: 1,
    }),
    /local start failed/,
  );

  assert.deepEqual(calls, [
    'redis:start',
    'local:start',
    'local:stop:redis_completion_finished',
    'redis:stop:redis_completion_finished',
  ]);
});

test('gate completion recovers canonical Redis completion from tail scan when live stream delivery is missed', async () => {
  class FakeRedis {
    constructor() {
      this.waiting = null;
    }
    on() {}
    async xread() {
      return new Promise((resolve) => {
        this.waiting = resolve;
      });
    }
    disconnect() {
      this.waiting?.(null);
    }
  }

  const config = makeConfig();
  const gate = {
    type: 'buster',
    output_file: 'buster-output.json',
  };

  const result = await waitBusterGateCompletionEvidence({
    deps: {
      pollResult: (ok, reason, data) => ({ ok, reason, data }),
      _explicitDeps: {
        completionEventAdapters: {
          RedisCtor: FakeRedis,
          redisOptions: { host: '127.0.0.1', port: '6379', enforceSecureMode: false },
        },
        createDedicatedRedisCompletionClient: () => ({
          on() {},
          disconnect() {},
        }),
        scanLatestCompletionFromTail: async () => ({
          match: {
            _id: '9-0',
            schema_version: 'v1',
            type: 'completion',
            stream_role: 'completion',
            project: 'test-project',
            target_kind: 'gate',
            target_id: 'buster',
            gate_id: 'buster',
            gate_type: 'buster',
            status: 'PASS',
            outcome: 'PASS',
            source: 'buster-pipeline',
            run_id: 'run-test',
            attempt: '1',
            dispatch_id: 'dispatch-test',
            session_key: 'session-test',
            timestamp: '2026-06-24T00:00:00.000Z',
          },
          scanned: 1,
          batches: 1,
          truncated: false,
        }),
      },
    },
    config,
    gateId: 'buster',
    gate,
    completionIdentity: {
      runId: 'run-test',
      attempt: '1',
      dispatchId: 'dispatch-test',
      sessionKey: 'session-test',
      gateway_label: 'gateway-test',
    },
    gateRateLimitStatusOptions: {},
    timeoutMinutes: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'target_reached');
  assert.equal(result.data.status, 'PASS');
  assert.equal(result.data._source, 'redis');
  assert.equal(result.data._redis_entry._id, '9-0');
});
