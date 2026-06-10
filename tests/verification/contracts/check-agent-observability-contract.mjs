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
const contract = await import(path.join(sourceRoot, 'skills/common/pipeline/agent-observability/src/index.ts'));
const novaShim = await import(path.join(sourceRoot, 'skills/nova/pipeline/agent-observability/src/index.ts'));
const busterShim = await import(path.join(sourceRoot, 'skills/buster/pipeline/agent-observability/src/index.ts'));

assert.equal(novaShim.AGENT_OBSERVABILITY_CONTROL_STREAM, contract.AGENT_OBSERVABILITY_CONTROL_STREAM);
assert.equal(busterShim.AGENT_OBSERVABILITY_CONTROL_STREAM, contract.AGENT_OBSERVABILITY_CONTROL_STREAM);
assert.deepEqual([...novaShim.AGENT_OBSERVABILITY_HOOKS], [...contract.AGENT_OBSERVABILITY_HOOKS]);
assert.deepEqual([...busterShim.AGENT_OBSERVABILITY_HOOKS], [...contract.AGENT_OBSERVABILITY_HOOKS]);

function baseEvent(overrides = {}) {
  return {
    v: 1,
    type: 'openclaw.llm.input',
    source: contract.AGENT_OBSERVABILITY_SOURCE,
    ts: '2026-05-16T18:33:00.000Z',
    identity: {
      run_id: 'run-1',
      project: 'kubecommand',
      session_key: 'agent:forge:session-1',
      dispatch_id: 'dispatch-1',
      agent_id: 'forge',
      agent_type: 'forge',
      module_id: '01',
    },
    payload: {
      hook: 'llm_input',
      prompt: 'full raw prompt with no summarization',
      system_prompt: 'raw system prompt',
      history_messages: [
        { role: 'user', content: 'first user message' },
        { role: 'assistant', content: { blocks: [{ type: 'text', text: 'assistant history' }] } },
      ],
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      request: { temperature: 0.1 },
    },
    masking: contract.createFullContentMinimalMasking(false),
    ...overrides,
  };
}

const llmInput = baseEvent();
let result = contract.validateAgentObservabilityIngressEvent(llmInput);
assert.equal(result.ok, true, result.errors.join('; '));
assert.equal(llmInput.payload.prompt, 'full raw prompt with no summarization');
assert.equal(llmInput.payload.system_prompt, 'raw system prompt');
assert.equal(llmInput.payload.history_messages[1].content.blocks[0].text, 'assistant history');
assert.equal(contract.selectAgentObservabilityStreamKey(llmInput.type), contract.AGENT_OBSERVABILITY_PAYLOAD_STREAM);

const llmOutput = baseEvent({
  type: 'openclaw.llm.output',
  payload: {
    hook: 'llm_output',
    response: 'full raw assistant response',
    assistant_response: 'full raw assistant response',
    assistant_message: { role: 'assistant', content: 'final assistant message' },
    history_messages: [{ role: 'user', content: 'preserved prior user prompt' }],
    usage: { input_tokens: 11, output_tokens: 17 },
  },
});
result = contract.validateAgentObservabilityIngressEvent(llmOutput);
assert.equal(result.ok, true, result.errors.join('; '));
assert.equal(llmOutput.payload.response, 'full raw assistant response');
assert.equal(llmOutput.payload.assistant_message.content, 'final assistant message');
assert.equal(llmOutput.payload.history_messages[0].content, 'preserved prior user prompt');
assert.equal(contract.selectAgentObservabilityStreamKey(llmOutput.type), contract.AGENT_OBSERVABILITY_PAYLOAD_STREAM);

const invalidLlmOutput = baseEvent({
  type: 'openclaw.llm.output',
  payload: { hook: 'llm_output', history_messages: [] },
});
result = contract.validateAgentObservabilityIngressEvent(invalidLlmOutput);
assert.equal(result.ok, false, 'llm_output without response must fail');
assert(result.errors.includes('payload.response is required'));

const masked = contract.applyMinimalApiKeyMask({
  prompt: 'Authorization: sk-1234567890abcdef',
  harmless: 'normal prompt content remains unchanged',
});
assert.equal(masked.value.prompt, 'Authorization: [REDACTED_API_KEY]');
assert.equal(masked.value.harmless, 'normal prompt content remains unchanged');
assert.deepEqual(masked.masking.masked, [contract.AGENT_OBSERVABILITY_MASK_BASIC_API_KEY_PATTERN]);
assert.equal(masked.masking.content, 'full');

const unmasked = contract.applyMinimalApiKeyMask({ prompt: 'keep this full prompt' });
assert.equal(unmasked.value.prompt, 'keep this full prompt');
assert.deepEqual(unmasked.masking.masked, []);

const oversized = contract.checkAgentObservabilityPayloadSize(
  baseEvent({ payload: { hook: 'llm_input', prompt: 'x'.repeat(512), history_messages: [] } }),
  256,
);
assert.equal(oversized.ok, false);
assert.equal(oversized.reason, contract.AGENT_OBSERVABILITY_PAYLOAD_TOO_LARGE_REASON);
assert.equal(oversized.identity.run_id, 'run-1');

assert.throws(() => contract.normalizeAgentObservabilityMaxEventBytes(contract.AGENT_OBSERVABILITY_ABSOLUTE_MAX_EVENT_BYTES + 1));

assert.equal(contract.AGENT_OBSERVABILITY_TELEMETRY_MAPPINGS.length, contract.AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES.length);
for (const type of contract.AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES) {
  const mapping = contract.getAgentObservabilityTelemetryMapping(type);
  assert(mapping, `${type} must have a mapping`);
  assert.equal(mapping.ingress_type, type);
}
assert.equal(contract.getAgentObservabilityTelemetryMapping('openclaw.agent.ended').current_telemetry_type, 'agent.ended');
assert.equal(contract.getAgentObservabilityTelemetryMapping('openclaw.llm.input').current_telemetry_type, 'agent.llm.input.summary');
assert.equal(contract.getAgentObservabilityTelemetryMapping('openclaw.llm.input').promoted_by_default, false);
assert.equal(contract.getAgentObservabilityTelemetryMapping('openclaw.llm.output').future_telemetry_type, 'agent.llm.output.summary');
assert.equal(contract.getAgentObservabilityTelemetryMapping('openclaw.tool.finished').current_telemetry_type, 'agent.tool.finished');
assert.equal(contract.getAgentObservabilityTelemetryMapping('openclaw.model.ended').current_telemetry_type, 'agent.model.ended');
assert.equal(contract.getAgentObservabilityTelemetryMapping('openclaw.subagent.spawning').current_telemetry_type, 'agent.spawn.requested');
assert.equal(contract.getAgentObservabilityTelemetryMapping('openclaw.subagent.delivery_target').current_telemetry_type, 'agent.delivery.target');
assert.equal(contract.selectAgentObservabilityStreamKey('openclaw.agent.ended'), contract.AGENT_OBSERVABILITY_CONTROL_STREAM);

const deliveryTarget = baseEvent({
  type: 'openclaw.subagent.delivery_target',
  payload: {
    hook: 'subagent_delivery_target',
    child_session_key: 'child-session',
    requester_session_key: 'requester-session',
    child_run_id: 'child-run',
    spawn_mode: 'session',
    expects_completion_message: true,
    requester_origin: { channel: 'discord', threadId: '123' },
  },
});
result = contract.validateAgentObservabilityIngressEvent(deliveryTarget);
assert.equal(result.ok, true, result.errors.join('; '));
assert.equal(contract.selectAgentObservabilityStreamKey(deliveryTarget.type), contract.AGENT_OBSERVABILITY_CONTROL_STREAM);

const modelUsage = baseEvent({
  type: 'openclaw.model.usage',
  payload: {
    hook: 'model_usage',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    cost_usd: 0.123,
    duration_ms: 4321,
    context: { limit: 200000, used: 12345 },
    usage: { input: 111, output: 222, cacheRead: 3, cacheWrite: 4, total: 340 },
  },
});
result = contract.validateAgentObservabilityIngressEvent(modelUsage);
assert.equal(result.ok, true, result.errors.join('; '));
assert.equal(contract.getAgentObservabilityTelemetryMapping('openclaw.model.usage').current_telemetry_type, 'cost.update');
assert.equal(contract.selectAgentObservabilityStreamKey(modelUsage.type), contract.AGENT_OBSERVABILITY_CONTROL_STREAM);

console.log(JSON.stringify({ ok: true, checked: 40 }));
