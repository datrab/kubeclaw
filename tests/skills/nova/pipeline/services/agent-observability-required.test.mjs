import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertRequiredAgentStartupEvidence,
  matchesAgentLifecycleTelemetry,
  waitForRequiredAgentStartupEvidence,
} from '../../../../../skills/nova/pipeline/services/agent-observability-required.ts';

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
    agent_observability: { required: true, startup_evidence_timeout_ms: 10 },
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
    agent_observability: { required: true, startup_evidence_timeout_ms: 0 },
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
