import assert from 'node:assert/strict';
import test from 'node:test';

import { mapAgentObservabilityEventToTelemetry } from '../../../../../../skills/nova/pipeline/services/agent-observability-ingester/mapper.ts';

function makeIngressEvent(type, identity, payload) {
  return {
    v: 1,
    type,
    source: 'openclaw.plugin.agent-observer',
    ts: '2026-06-03T00:00:00.000Z',
    identity: {
      run_id: 'run-test',
      project: 'project-test',
      session_key: 'session-test',
      ...identity,
    },
    payload,
  };
}

test('tool finished payload preserves reason separately from outcome', () => {
  const emission = mapAgentObservabilityEventToTelemetry(makeIngressEvent(
    'openclaw.tool.finished',
    { tool_call_id: 'tool-call-test' },
    {
      hook: 'after_tool_call',
      tool_name: 'fetch_data',
      outcome: 'failed',
      reason: 'timeout',
      duration_ms: 2500,
    },
  ));

  assert.equal(emission?.eventType, 'agent.tool.finished');
  assert.equal(emission.payload.outcome, 'failed');
  assert.equal(emission.payload.reason, 'timeout');
});

test('model ended payload preserves reason separately from outcome', () => {
  const emission = mapAgentObservabilityEventToTelemetry(makeIngressEvent(
    'openclaw.model.ended',
    { model_call_id: 'model-call-test' },
    {
      hook: 'model_call_ended',
      provider: 'test-provider',
      model: 'test-model',
      outcome: 'failed',
      reason: 'timeout',
      duration_ms: 5000,
    },
  ));

  assert.equal(emission?.eventType, 'agent.model.ended');
  assert.equal(emission.payload.outcome, 'failed');
  assert.equal(emission.payload.reason, 'timeout');
});
