import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertRequiredAgentStartupEvidence,
  createAgentLifecycleTelemetryReader,
  matchesAgentLifecycleTelemetry,
  waitForRequiredAgentStartupEvidence,
} from '../../../../../skills/nova/pipeline/services/agent-observability-required.ts';
import {
  clearActiveContext,
  setActiveContext,
} from '../../../../../skills/nova/pipeline/core/logger.ts';

function observabilityConfig({ timeoutMs = 10, blockMs = 1, required = true } = {}) {
  return {
    required,
    payload: { max_event_bytes: 3145728 },
    startup_evidence: { timeout_ms: timeoutMs, block_ms: blockMs },
  };
}

test('startup evidence matches exact plugin-derived lifecycle identity', async () => {
  const identity = {
    run_id: 'run-test',
    project: 'project-test',
    agent_type: 'forge',
    module_id: 'module-a',
    dispatch_id: 'dispatch-a',
    gateway_label: 'forge-module-a-1',
    session_key: 'agent:main:subagent:a',
  };
  const event = {
    v: 1,
    type: 'agent.spawned',
    run_id: 'run-test',
    project: 'project-test',
    agent_type: 'forge',
    module_id: 'module-a',
    dispatch_id: 'dispatch-a',
    label: 'forge-module-a-1',
    session_key: 'agent:main:subagent:a',
  };

  assert.equal(matchesAgentLifecycleTelemetry(event, identity, ['agent.spawned']), true);
  assert.equal(matchesAgentLifecycleTelemetry({ ...event, dispatch_id: 'other' }, identity, ['agent.spawned']), false);
  assert.equal(matchesAgentLifecycleTelemetry({ ...event, session_key: null }, identity, ['agent.spawned']), false);

  const result = await waitForRequiredAgentStartupEvidence({
    project: 'project-test',
    telemetry: { enabled: true },
    agent_observability: observabilityConfig(),
  }, identity, {
    reader: {
      async read(readIdentity, types) {
        assert.deepEqual(readIdentity, identity);
        assert.deepEqual(types, ['agent.spawned', 'agent.session.started']);
        return event;
      },
      close() {},
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'observed');
  assert.equal(result.event, event);
  assert.doesNotThrow(() => assertRequiredAgentStartupEvidence(result, identity));
});

test('startup evidence accepts child-session lifecycle identity when session and label match', async () => {
  const identity = {
    run_id: 'run-test',
    project: 'project-test',
    agent_type: 'forge',
    module_id: 'module-a',
    dispatch_id: 'dispatch-a',
    gateway_label: 'forge-module-a-1',
    session_key: 'agent:main:subagent:a',
  };
  const event = {
    v: 1,
    type: 'agent.spawned',
    run_id: 'child-run-test',
    project: 'project-test',
    label: 'forge-module-a-1',
    session_key: 'agent:main:subagent:a',
    dispatch_id: null,
    module_id: null,
  };

  assert.equal(matchesAgentLifecycleTelemetry(event, identity, ['agent.spawned']), true);
  assert.equal(matchesAgentLifecycleTelemetry({ ...event, session_key: 'agent:main:subagent:other' }, identity, ['agent.spawned']), false);
  assert.equal(matchesAgentLifecycleTelemetry({ ...event, label: 'forge-module-a-2' }, identity, ['agent.spawned']), false);
});

test('required startup evidence fails closed when plugin telemetry is absent', async () => {
  const identity = {
    run_id: 'run-test',
    project: 'project-test',
    agent_type: 'forge',
    module_id: 'module-a',
    dispatch_id: 'dispatch-a',
    gateway_label: 'forge-module-a-1',
    session_key: 'agent:main:subagent:a',
  };
  const result = await waitForRequiredAgentStartupEvidence({
    project: 'project-test',
    telemetry: { enabled: true },
    agent_observability: observabilityConfig({ timeoutMs: 0 }),
  }, identity, {
    reader: {
      async read() { return null; },
      close() {},
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_agent_observability_startup_evidence');
  assert.throws(
    () => assertRequiredAgentStartupEvidence(result, identity),
    /Required agent observability evidence missing/,
  );
});

test('startup evidence reader connects lazy Redis clients before xread', async () => {
  const calls = [];

  class FakeRedis {
    constructor() {
      this.status = 'wait';
    }

    on() {}

    async connect() {
      calls.push('connect');
      this.status = 'ready';
    }

    async ping() {
      calls.push('ping');
      return 'PONG';
    }

    async xread(...args) {
      calls.push(['xread', ...args]);
      return [[
        'telemetry-stream',
        [[
          '1-0',
          ['data', JSON.stringify({
            type: 'agent.spawned',
            run_id: 'run-test',
            project: 'project-test',
            agent_type: 'forge',
            module_id: 'module-a',
            dispatch_id: 'dispatch-a',
            session_key: 'agent:main:subagent:a',
            label: 'forge-module-a-1',
          })],
        ]],
      ]];
    }

    disconnect() {
      calls.push('disconnect');
    }
  }

  const reader = createAgentLifecycleTelemetryReader({
    project: 'project-test',
    telemetry: { enabled: true },
    agent_observability: observabilityConfig({ blockMs: 250, required: false }),
  }, {
    RedisCtor: FakeRedis,
    redis: { host: '127.0.0.1', port: 6379, enforceSecureMode: false },
    runId: 'run-test',
    stream: 'telemetry-stream',
    startId: '0-0',
  });

  const event = await reader.read({
    run_id: 'run-test',
    project: 'project-test',
    agent_type: 'forge',
    module_id: 'module-a',
    dispatch_id: 'dispatch-a',
    session_key: 'agent:main:subagent:a',
    gateway_label: 'forge-module-a-1',
  }, ['agent.spawned']);

  reader.close();

  assert.equal(event?.type, 'agent.spawned');
  assert.deepEqual(calls.slice(0, 3), ['connect', 'ping', ['xread', 'BLOCK', '250', 'COUNT', '10', 'STREAMS', 'telemetry-stream', '0-0']]);
});

test('startup evidence reader falls back to pipeline jsonl when telemetry stream is unavailable', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-observability-required-'));
  const logPath = path.join(tempRoot, 'pipeline.jsonl');
  fs.writeFileSync(logPath, `${JSON.stringify({
    v: 1,
    type: 'agent.spawned',
    ts: '2026-06-19T20:04:23.480Z',
    run_id: 'child-run-test',
    project: 'project-test',
    source: 'pipeline',
    emitter: 'nova/pipeline/services/agent-observability-ingester',
    agent_type: 'main',
    label: 'forge-module-a-1',
    module_id: null,
    gate_id: null,
    session_key: 'agent:main:subagent:a',
    dispatch_id: null,
    seq: 1,
  })}\n`);

  class FakeRedis {
    constructor() {
      this.status = 'wait';
    }

    on() {}

    async connect() {
      this.status = 'ready';
    }

    async ping() {
      return 'PONG';
    }

    async xread() {
      return [];
    }

    disconnect() {}
  }

  const reader = createAgentLifecycleTelemetryReader({
    project: 'project-test',
    telemetry: { enabled: true },
    agent_observability: observabilityConfig({ blockMs: 250, required: false }),
  }, {
    RedisCtor: FakeRedis,
    redis: { host: '127.0.0.1', port: 6379, enforceSecureMode: false },
    runId: 'run-test',
    stream: 'telemetry-stream',
    pipelineLogPaths: [logPath],
  });

  const event = await reader.read({
    run_id: 'run-test',
    project: 'project-test',
    agent_type: 'forge',
    module_id: 'module-a',
    dispatch_id: 'dispatch-a',
    session_key: 'agent:main:subagent:a',
    gateway_label: 'forge-module-a-1',
  }, ['agent.spawned']);

  reader.close();

  assert.equal(event?.type, 'agent.spawned');
  assert.equal(event?.observability_source, 'pipeline_jsonl');
  assert.equal(event?.pipeline_jsonl_path, logPath);
});

test('startup evidence reader uses active run log authority for module worktree configs', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-observability-module-worktree-'));
  const parentRunLogPath = path.join(tempRoot, 'parent', 'runs', 'run-test', 'pipeline.jsonl');
  fs.mkdirSync(path.dirname(parentRunLogPath), { recursive: true });
  fs.writeFileSync(parentRunLogPath, `${JSON.stringify({
    v: 1,
    type: 'agent.spawned',
    run_id: 'child-run-test',
    project: 'project-test',
    source: 'pipeline',
    emitter: 'nova/pipeline/services/agent-observability-ingester',
    label: 'forge-module-a-1',
    session_key: 'agent:main:subagent:a',
    dispatch_id: null,
    module_id: null,
  })}\n`);

  class FakeRedis {
    constructor() {
      this.status = 'ready';
    }

    on() {}
    async ping() { return 'PONG'; }
    async xread() { return []; }
    disconnect() {}
  }

  setActiveContext({
    stats: { errors: [] },
    _runPipelineLogPath: parentRunLogPath,
    _pipelineLogPath: path.join(tempRoot, 'parent', 'pipeline.jsonl'),
  });
  t.after(() => clearActiveContext());

  const moduleWorktreeRoot = path.join(tempRoot, 'module-worktree');
  const reader = createAgentLifecycleTelemetryReader({
    project: 'project-test',
    repo_root: moduleWorktreeRoot,
    paths: { swarm_dir: path.join(moduleWorktreeRoot, 'Project', 'src', '.swarm') },
    _runId: 'run-test',
    telemetry: { enabled: true },
    agent_observability: observabilityConfig({ blockMs: 1, required: false }),
  }, {
    RedisCtor: FakeRedis,
    redis: { host: '127.0.0.1', port: 6379, enforceSecureMode: false },
    runId: 'run-test',
    stream: 'telemetry-stream',
  });

  const event = await reader.read({
    run_id: 'run-test',
    project: 'project-test',
    agent_type: 'forge',
    module_id: 'module-a',
    dispatch_id: 'dispatch-a',
    session_key: 'agent:main:subagent:a',
    gateway_label: 'forge-module-a-1',
  }, ['agent.spawned']);

  reader.close();

  assert.equal(event?.type, 'agent.spawned');
  assert.equal(event?.observability_source, 'pipeline_jsonl');
  assert.equal(event?.pipeline_jsonl_path, parentRunLogPath);
});
