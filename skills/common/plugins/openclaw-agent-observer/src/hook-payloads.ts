import type {
  AgentObservabilityHook,
  AgentObservabilityIngressPayloadV1,
} from './generated/agent-observability/index.ts';
import {
  boolValue,
  firstValue,
  historyMessages,
  numberValue,
  stringValue,
  toJsonRecord,
  toJsonValue,
  valueAt,
} from './hook-values.ts';

function provider(event: unknown): string | undefined {
  return stringValue(firstValue(
    valueAt(event, 'provider'),
    valueAt(event, 'providerId'),
    valueAt(event, 'modelProvider'),
  ));
}

function model(event: unknown): string | undefined {
  return stringValue(firstValue(
    valueAt(event, 'model'),
    valueAt(event, 'modelId'),
    valueAt(event, 'resolvedModel'),
  ));
}

function outcome(event: unknown): string | undefined {
  const explicit = stringValue(firstValue(valueAt(event, 'outcome'), valueAt(event, 'status')));
  if (explicit) return explicit;
  const success = boolValue(valueAt(event, 'success', 'ok'));
  if (success === true) return 'success';
  if (success === false || valueAt(event, 'error') !== undefined) return 'error';
  return undefined;
}

function successOutcome(event: unknown): string | null {
  const explicit = outcome(event);
  if (explicit) return explicit;
  const phase = stringValue(valueAt(event, 'phase'));
  if (phase === 'end') return 'success';
  if (phase === 'error') return 'error';
  return null;
}

function baseMetadata(event: unknown) {
  return toJsonRecord(valueAt(event, 'metadata'));
}

export function modelUsagePayload(event: unknown): AgentObservabilityIngressPayloadV1 {
  return {
    hook: 'model_usage',
    provider: provider(event) ?? null,
    model: model(event) ?? null,
    cost_usd: numberValue(valueAt(event, 'costUsd', 'cost_usd')) ?? null,
    duration_ms: numberValue(valueAt(event, 'durationMs', 'duration_ms', 'duration')) ?? null,
    context: toJsonRecord(valueAt(event, 'context')),
    usage: toJsonRecord(valueAt(event, 'usage')),
    metadata: baseMetadata(event),
  };
}

function llmInputPayload(event: unknown): AgentObservabilityIngressPayloadV1 {
  return {
    hook: 'llm_input',
    prompt: toJsonValue(firstValue(valueAt(event, 'prompt'), valueAt(event, 'input'), valueAt(event, 'providerInput'), valueAt(event, 'messages'))),
    system_prompt: stringValue(valueAt(event, 'systemPrompt', 'system_prompt')) ?? null,
    history_messages: historyMessages(firstValue(valueAt(event, 'historyMessages', 'history_messages', 'history'), valueAt(event, 'messages'))),
    provider: provider(event) ?? null,
    model: model(event) ?? null,
    request: toJsonRecord(firstValue(valueAt(event, 'request'), valueAt(event, 'providerInput'))),
    metadata: baseMetadata(event),
  };
}

function llmOutputPayload(event: unknown): AgentObservabilityIngressPayloadV1 {
  return {
    hook: 'llm_output',
    response: toJsonValue(firstValue(valueAt(event, 'response'), valueAt(event, 'output'), valueAt(event, 'assistantResponse', 'assistant_response'), valueAt(event, 'text'), valueAt(valueAt(event, 'message'), 'content'))),
    assistant_response: stringValue(valueAt(event, 'assistantResponse', 'assistant_response', 'text')) ?? null,
    assistant_message: toJsonValue(firstValue(valueAt(event, 'assistantMessage', 'assistant_message'), valueAt(event, 'message'))),
    history_messages: historyMessages(valueAt(event, 'historyMessages', 'history_messages', 'history')),
    provider: provider(event) ?? null,
    model: model(event) ?? null,
    usage: toJsonRecord(valueAt(event, 'usage')),
    metadata: baseMetadata(event),
  };
}

function beforeToolPayload(event: unknown): AgentObservabilityIngressPayloadV1 {
  return {
    hook: 'before_tool_call',
    tool_name: stringValue(valueAt(event, 'toolName', 'tool_name', 'name')) ?? 'unknown_tool',
    params: toJsonValue(firstValue(valueAt(event, 'params'), valueAt(event, 'arguments'), valueAt(event, 'input'), {})),
    metadata: baseMetadata(event),
  };
}

function afterToolPayload(event: unknown): AgentObservabilityIngressPayloadV1 {
  return {
    hook: 'after_tool_call',
    tool_name: stringValue(valueAt(event, 'toolName', 'tool_name', 'name')) ?? 'unknown_tool',
    params: toJsonValue(valueAt(event, 'params')),
    result: toJsonValue(firstValue(valueAt(event, 'result'), valueAt(event, 'output'))),
    error: toJsonValue(valueAt(event, 'error')),
    duration_ms: numberValue(valueAt(event, 'durationMs', 'duration_ms', 'duration')) ?? null,
    outcome: outcome(event) ?? null,
    metadata: baseMetadata(event),
  };
}

function agentEndPayload(event: unknown): AgentObservabilityIngressPayloadV1 {
  return {
    hook: 'agent_end',
    outcome: successOutcome(event),
    reason: stringValue(firstValue(valueAt(event, 'reason'), valueAt(event, 'stopReason', 'stop_reason'), valueAt(event, 'phase'))) ?? null,
    error: toJsonValue(valueAt(event, 'error')),
    duration_ms: numberValue(valueAt(event, 'durationMs', 'duration_ms', 'duration')) ?? null,
    final_messages: historyMessages(valueAt(event, 'finalMessages', 'final_messages', 'messages')),
    metadata: baseMetadata(event),
  };
}

function modelCallPayload(
  hook: 'model_call_started' | 'model_call_ended',
  event: unknown,
): AgentObservabilityIngressPayloadV1 {
  const base = {
    hook,
    provider: provider(event) ?? null,
    model: model(event) ?? null,
    metadata: baseMetadata(event),
  };
  if (hook === 'model_call_started') {
    return { ...base, request: toJsonRecord(valueAt(event, 'request')) };
  }
  return {
    ...base,
    outcome: outcome(event) ?? null,
    error: toJsonValue(valueAt(event, 'error')),
    duration_ms: numberValue(valueAt(event, 'durationMs', 'duration_ms', 'duration')) ?? null,
    usage: toJsonRecord(valueAt(event, 'usage')),
  };
}

function subagentPayload(
  hook: 'subagent_spawned' | 'subagent_delivery_target' | 'subagent_ended',
  event: unknown,
): AgentObservabilityIngressPayloadV1 {
  return {
    hook,
    child_session_key: stringValue(valueAt(event, 'childSessionKey', 'child_session_key', 'targetSessionKey')) ?? null,
    child_session_id: stringValue(valueAt(event, 'childSessionId', 'child_session_id', 'targetSessionId')) ?? null,
    agent_id: stringValue(valueAt(event, 'agentId', 'agent_id')) ?? null,
    requester_session_key: stringValue(valueAt(event, 'requesterSessionKey', 'requester_session_key')) ?? null,
    child_run_id: stringValue(valueAt(event, 'childRunId', 'child_run_id', 'runId', 'run_id')) ?? null,
    mode: stringValue(valueAt(event, 'mode')) ?? null,
    spawn_mode: stringValue(valueAt(event, 'spawnMode', 'spawn_mode')) ?? null,
    thread: boolValue(valueAt(event, 'thread', 'threadRequested')) ?? null,
    expects_completion_message: boolValue(valueAt(event, 'expectsCompletionMessage', 'expects_completion_message')) ?? null,
    requester_origin: toJsonValue(valueAt(event, 'requesterOrigin', 'requester_origin')),
    outcome: outcome(event) ?? null,
    reason: stringValue(valueAt(event, 'reason')) ?? null,
    error: toJsonValue(valueAt(event, 'error')),
    duration_ms: numberValue(valueAt(event, 'durationMs', 'duration_ms', 'duration')) ?? null,
    metadata: baseMetadata(event),
  };
}

function sessionPayload(
  hook: 'session_start' | 'session_end',
  event: unknown,
): AgentObservabilityIngressPayloadV1 {
  return {
    hook,
    session_key: stringValue(valueAt(event, 'sessionKey', 'session_key')) ?? null,
    session_id: stringValue(valueAt(event, 'sessionId', 'session_id')) ?? null,
    outcome: successOutcome(event),
    reason: stringValue(firstValue(valueAt(event, 'reason'), valueAt(event, 'stopReason', 'stop_reason'), valueAt(event, 'phase'))) ?? null,
    error: toJsonValue(valueAt(event, 'error')),
    duration_ms: numberValue(valueAt(event, 'durationMs', 'duration_ms', 'duration')) ?? null,
    metadata: baseMetadata(event),
  };
}

export function normalizePayload(
  hook: AgentObservabilityHook,
  event: unknown,
): AgentObservabilityIngressPayloadV1 {
  if (hook === 'llm_input') return llmInputPayload(event);
  if (hook === 'llm_output') return llmOutputPayload(event);
  if (hook === 'before_tool_call') return beforeToolPayload(event);
  if (hook === 'after_tool_call') return afterToolPayload(event);
  if (hook === 'agent_end') return agentEndPayload(event);
  if (hook === 'model_call_started' || hook === 'model_call_ended') {
    return modelCallPayload(hook, event);
  }
  if (hook === 'subagent_spawned' || hook === 'subagent_delivery_target' || hook === 'subagent_ended') {
    return subagentPayload(hook, event);
  }
  if (hook === 'session_start' || hook === 'session_end') return sessionPayload(hook, event);
  throw new Error(`unsupported OpenClaw agent observability hook: ${hook}`);
}
