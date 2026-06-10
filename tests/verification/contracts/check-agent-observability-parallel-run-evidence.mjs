#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') {
      args.sourceRoot = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

const { sourceRoot } = parseArgs();
const evidenceModule = await import(path.join(sourceRoot, 'skills/nova/pipeline/services/agent-observability-evidence/index.ts'));
const contract = await import(path.join(sourceRoot, 'skills/common/pipeline/agent-observability/src/index.ts'));

const baseIdentity = {
  run_id: 'run-ao4',
  project: 'kubeclaw-main',
  session_key: 'agent:forge:session-1',
  dispatch_id: 'dispatch-1',
  gateway_label: 'forge-dispatch-1',
  agent_type: 'forge',
  module_id: '01',
};

function makeEvent(type, payload, identity = {}, ts = '2026-05-17T17:00:00.000Z') {
  const event = {
    v: 1,
    type,
    source: contract.AGENT_OBSERVABILITY_SOURCE,
    ts,
    identity: { ...baseIdentity, ...identity },
    payload,
    masking: {
      profile: contract.AGENT_OBSERVABILITY_MASKING_PROFILE,
      content: 'full',
      masked: [],
    },
  };
  assert.equal(contract.validateAgentObservabilityIngressEvent(event).ok, true, `${type} fixture must satisfy ingress contract`);
  return event;
}

const observedEvents = [
  makeEvent('openclaw.subagent.spawned', {
    hook: 'subagent_spawned',
    child_session_key: 'agent:buster:child-1',
    agent_id: 'buster',
  }, {
    agent_type: 'buster',
    child_session_key: 'agent:buster:child-1',
  }),
  makeEvent('openclaw.session.ended', {
    hook: 'session_end',
    session_key: 'agent:forge:session-1',
    outcome: 'success',
    duration_ms: 1000,
  }, {}, '2026-05-17T17:00:04.000Z'),
  makeEvent('openclaw.agent.ended', {
    hook: 'agent_end',
    outcome: 'success',
    reason: 'done',
  }),
  makeEvent('openclaw.tool.started', {
    hook: 'before_tool_call',
    tool_name: 'read',
    params: { path: 'README.md' },
  }, { tool_call_id: 'tool-1' }),
  makeEvent('openclaw.tool.finished', {
    hook: 'after_tool_call',
    tool_name: 'read',
    result: { ok: true },
    duration_ms: 12,
    outcome: 'success',
  }, { tool_call_id: 'tool-1' }),
  makeEvent('openclaw.model.started', {
    hook: 'model_call_started',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
  }, { model_call_id: 'model-1' }),
  makeEvent('openclaw.model.ended', {
    hook: 'model_call_ended',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    outcome: 'success',
    duration_ms: 200,
  }, { model_call_id: 'model-1' }),
  makeEvent('openclaw.llm.input', {
    hook: 'llm_input',
    prompt: 'full prompt',
    history_messages: [],
  }, { model_call_id: 'model-1' }),
  makeEvent('openclaw.llm.output', {
    hook: 'llm_output',
    response: 'full response',
  }, { model_call_id: 'model-1' }),
  makeEvent('openclaw.model.ended', {
    hook: 'model_call_ended',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    outcome: 'error',
    reason: 'provider rate limit',
    duration_ms: 30,
  }, { model_call_id: 'model-rate-limit' }),
];

const evidence = evidenceModule.compareAgentObservabilityParallelRunEvidence({
  observedEvents,
  redisPressure: {
    controlPending: 2,
    payloadLength: 25,
    payloadBytes: 4096,
    memoryBytes: 8192,
    controlLagThreshold: 1,
    payloadPressureThreshold: 10,
    payloadBytesThreshold: 1024,
    memoryPressureThreshold: 4096,
  },
  generatedAt: '2026-05-17T17:01:00.000Z',
});

assert.equal(evidence.v, 1);
assert.equal(evidence.generated_at, '2026-05-17T17:01:00.000Z');
assert.equal(evidence.status, 'degraded');
assert.deepEqual(evidence.coverage.spawn, { observed: 1 });
assert.deepEqual(evidence.coverage.agent_end, { observed: 1 });
assert.deepEqual(evidence.coverage.session_end, { observed: 1 });
assert.deepEqual(evidence.coverage.rate_limit, { observed: 1 });
assert.deepEqual(evidence.coverage.failure, { observed: 0 });
assert.deepEqual(evidence.spans.tool, { started: 1, finished: 1, complete: 1, orphan_started: 0, orphan_finished: 0 });
assert.deepEqual(evidence.spans.model, { started: 1, finished: 2, complete: 1, orphan_started: 0, orphan_finished: 1 });
assert.deepEqual(evidence.spans.llm, { inputs: 1, outputs: 1, paired: 1, input_without_output: 0, output_without_input: 0 });
assert.equal(evidence.session_end_timing.compared, 1);
assert.equal(evidence.session_end_timing.max_delta_ms, null);
assert.deepEqual(evidence.redis_pressure.degraded, ['control_lag', 'payload_stream_length', 'payload_stream_bytes', 'redis_memory']);
assert.equal(evidence.issues.some((item) => item.code === 'failure_missing_observed_evidence'), true);
assert.equal(evidence.issues.some((item) => item.code === 'redis_observability_pressure'), true);

const identityGapEvidence = evidenceModule.compareAgentObservabilityParallelRunEvidence({
  observedEvents: [makeEvent('openclaw.agent.ended', {
    hook: 'agent_end',
    outcome: 'success',
  }, {
    session_key: undefined,
    dispatch_id: undefined,
    gateway_label: undefined,
    agent_type: undefined,
  })],
  generatedAt: '2026-05-17T17:02:00.000Z',
});
assert.equal(identityGapEvidence.status, 'warning');
assert.equal(identityGapEvidence.identity_gaps.length, 1);
assert.deepEqual(identityGapEvidence.identity_gaps[0].details.missing, ['session_key', 'dispatch_id', 'gateway_label', 'agent_type']);

console.log(JSON.stringify({ ok: true, checked: 31 }));
