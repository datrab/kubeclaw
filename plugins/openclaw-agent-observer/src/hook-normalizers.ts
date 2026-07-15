import {
  AGENT_OBSERVABILITY_SCHEMA_VERSION,
  AGENT_OBSERVABILITY_SOURCE,
  assertAgentObservabilityIngressEvent,
} from './agent-observability/index.ts';
import type {
  AgentObservabilityHistoryMessageV1,
  AgentObservabilityHook,
  AgentObservabilityIdentityV1,
  AgentObservabilityIngressEventType,
  AgentObservabilityIngressEventV1,
  AgentObservabilityIngressPayloadV1,
  AgentObservabilityJsonValue,
} from './agent-observability/index.ts';

type UnknownRecord = Record<string, unknown>;

const HOOK_TO_TYPE: Record<AgentObservabilityHook, AgentObservabilityIngressEventType> = Object.freeze({
  agent_end: 'openclaw.agent.ended',
  llm_input: 'openclaw.llm.input',
  llm_output: 'openclaw.llm.output',
  subagent_spawned: 'openclaw.subagent.spawned',
  subagent_delivery_target: 'openclaw.subagent.delivery_target',
  subagent_ended: 'openclaw.subagent.ended',
  before_tool_call: 'openclaw.tool.started',
  after_tool_call: 'openclaw.tool.finished',
  model_call_started: 'openclaw.model.started',
  model_call_ended: 'openclaw.model.ended',
  session_start: 'openclaw.session.started',
  session_end: 'openclaw.session.ended',
});

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function valueAt(source: unknown, ...keys: string[]): unknown {
  if (!isRecord(source)) return undefined;
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function stringValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function numberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function boolValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function successValue(value: unknown): boolean | undefined {
  const explicit = boolValue(valueAt(value, 'success', 'ok'));
  if (explicit !== undefined) return explicit;
  const phase = stringValue(valueAt(value, 'phase'));
  if (phase === 'end') return true;
  if (phase === 'error') return false;
  return undefined;
}

function toJsonValue(value: unknown, seen = new Set<object>()): AgentObservabilityJsonValue {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item, seen));
  if (!isRecord(value)) return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  const next: Record<string, AgentObservabilityJsonValue | undefined> = {};
  for (const [key, item] of Object.entries(value)) {
    next[key] = item === undefined ? undefined : toJsonValue(item, seen);
  }
  seen.delete(value);
  return next;
}

function toJsonRecord(value: unknown): Record<string, AgentObservabilityJsonValue | undefined> | undefined {
  if (!isRecord(value)) return undefined;
  return toJsonValue(value) as Record<string, AgentObservabilityJsonValue | undefined>;
}

function dropUndefined(value: AgentObservabilityJsonValue): AgentObservabilityJsonValue {
  if (Array.isArray(value)) return value.map((item) => dropUndefined(item));
  if (value && typeof value === 'object') {
    const next: Record<string, AgentObservabilityJsonValue | undefined> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) next[key] = dropUndefined(item);
    }
    return next;
  }
  return value;
}

function historyMessages(value: unknown): AgentObservabilityHistoryMessageV1[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((item) => {
    if (!isRecord(item)) return { content: toJsonValue(item) };
    const content = 'content' in item ? item.content : firstValue(item.text, item.message, item);
    const message: AgentObservabilityHistoryMessageV1 = { content: toJsonValue(content) };
    const role = stringValue(item.role);
    const name = stringValue(item.name);
    const toolCallId = stringValue(item.tool_call_id ?? item.toolCallId);
    const metadata = toJsonRecord(item.metadata);
    if (role) message.role = role;
    if (name) message.name = name;
    if (toolCallId) message.tool_call_id = toolCallId;
    if (metadata) message.metadata = metadata;
    return message;
  });
}

function contextOf(event: unknown, hookContext?: unknown): UnknownRecord {
  return {
    ...asRecord(hookContext),
    ...asRecord(valueAt(event, 'context')),
    ...asRecord(valueAt(event, 'ctx')),
  };
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function putIdentity(identity: AgentObservabilityIdentityV1, key: keyof AgentObservabilityIdentityV1, value: unknown): void {
  const normalized = stringValue(value);
  if (normalized) identity[key] = normalized;
}

export function extractPluginConfig(event: unknown, hookContext?: unknown): unknown {
  return valueAt(contextOf(event, hookContext), 'pluginConfig') ?? valueAt(event, 'pluginConfig');
}

export function normalizeIdentity(event: unknown, hookContext?: unknown): AgentObservabilityIdentityV1 {
  const ctx = contextOf(event, hookContext);
  const session = asRecord(valueAt(event, 'session'));
  const metadata = asRecord(valueAt(event, 'metadata'));
  const identity: AgentObservabilityIdentityV1 = {};

  putIdentity(identity, 'run_id', firstValue(valueAt(event, 'runId', 'run_id'), valueAt(ctx, 'runId', 'run_id'), valueAt(metadata, 'run_id')));
  putIdentity(identity, 'project', firstValue(valueAt(event, 'project'), valueAt(ctx, 'project'), valueAt(metadata, 'project')));
  putIdentity(identity, 'session_key', firstValue(valueAt(event, 'sessionKey', 'session_key'), valueAt(ctx, 'sessionKey', 'session_key'), valueAt(session, 'key', 'sessionKey')));
  putIdentity(identity, 'session_id', firstValue(valueAt(event, 'sessionId', 'session_id'), valueAt(ctx, 'sessionId', 'session_id'), valueAt(session, 'id', 'sessionId')));
  putIdentity(identity, 'gateway_label', firstValue(valueAt(event, 'gatewayLabel', 'gateway_label', 'label'), valueAt(ctx, 'gatewayLabel', 'gateway_label', 'label')));
  putIdentity(identity, 'dispatch_id', firstValue(valueAt(event, 'dispatchId', 'dispatch_id', 'jobId'), valueAt(ctx, 'dispatchId', 'dispatch_id', 'jobId')));
  putIdentity(identity, 'agent_id', firstValue(valueAt(event, 'agentId', 'agent_id'), valueAt(ctx, 'agentId', 'agent_id')));
  putIdentity(identity, 'agent_type', firstValue(valueAt(event, 'agentType', 'agent_type'), valueAt(ctx, 'agentType', 'agent_type')));
  putIdentity(identity, 'module_id', firstValue(valueAt(event, 'moduleId', 'module_id'), valueAt(ctx, 'moduleId', 'module_id'), valueAt(metadata, 'module_id')));
  putIdentity(identity, 'gate_id', firstValue(valueAt(event, 'gateId', 'gate_id'), valueAt(ctx, 'gateId', 'gate_id'), valueAt(metadata, 'gate_id')));
  putIdentity(identity, 'tool_call_id', firstValue(valueAt(event, 'toolCallId', 'tool_call_id'), valueAt(ctx, 'toolCallId', 'tool_call_id')));
  putIdentity(identity, 'model_call_id', firstValue(valueAt(event, 'modelCallId', 'model_call_id', 'requestId'), valueAt(ctx, 'modelCallId', 'model_call_id', 'requestId')));
  putIdentity(identity, 'parent_session_key', firstValue(valueAt(event, 'parentSessionKey', 'parent_session_key', 'requesterSessionKey', 'requester_session_key'), valueAt(ctx, 'parentSessionKey', 'parent_session_key', 'requesterSessionKey', 'requester_session_key')));
  putIdentity(identity, 'child_session_key', firstValue(valueAt(event, 'childSessionKey', 'child_session_key', 'targetSessionKey'), valueAt(ctx, 'childSessionKey', 'child_session_key', 'targetSessionKey')));

  return identity;
}

function provider(event: unknown): string | undefined {
  return stringValue(firstValue(valueAt(event, 'provider'), valueAt(event, 'providerId'), valueAt(event, 'modelProvider')));
}

function model(event: unknown): string | undefined {
  return stringValue(firstValue(valueAt(event, 'model'), valueAt(event, 'modelId'), valueAt(event, 'resolvedModel')));
}

function outcome(event: unknown): string | undefined {
  const explicit = stringValue(firstValue(valueAt(event, 'outcome'), valueAt(event, 'status')));
  if (explicit) return explicit;
  const success = boolValue(valueAt(event, 'success', 'ok'));
  if (success === true) return 'success';
  if (success === false) return 'error';
  if (valueAt(event, 'error') !== undefined) return 'error';
  return undefined;
}

function baseMetadata(event: unknown): Record<string, AgentObservabilityJsonValue | undefined> | undefined {
  return toJsonRecord(valueAt(event, 'metadata'));
}

function modelUsagePayload(event: unknown): AgentObservabilityIngressPayloadV1 {
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

function unwrapAgentEventData(event: unknown): UnknownRecord {
  const eventRecord = asRecord(event);
  return {
    ...asRecord(valueAt(event, 'data')),
    runId: eventRecord.runId,
    sessionKey: eventRecord.sessionKey,
    sessionId: eventRecord.sessionId,
    agentId: eventRecord.agentId,
    seq: eventRecord.seq,
    ts: eventRecord.ts,
    stream: eventRecord.stream,
  };
}

function normalizeAgentEventHook(event: unknown): AgentObservabilityHook | null {
  const stream = stringValue(valueAt(event, 'stream'));
  const data = asRecord(valueAt(event, 'data'));
  const phase = stringValue(valueAt(data, 'phase'));
  if (stream === 'lifecycle') {
    if (phase === 'start') return 'session_start';
    if (phase === 'end' || phase === 'error') return 'agent_end';
    return null;
  }
  if (stream === 'assistant') return 'llm_output';
  if (stream === 'item') {
    if (phase === 'start') return 'before_tool_call';
    if (phase === 'end') return 'after_tool_call';
    return null;
  }
  if (stream === 'command_output' || stream === 'patch' || stream === 'approval') return 'after_tool_call';
  return null;
}

export function normalizePayload(hook: AgentObservabilityHook, event: unknown): AgentObservabilityIngressPayloadV1 {
  switch (hook) {
    case 'llm_input':
      return {
        hook,
        prompt: toJsonValue(firstValue(valueAt(event, 'prompt'), valueAt(event, 'input'), valueAt(event, 'providerInput'), valueAt(event, 'messages'))),
        system_prompt: stringValue(valueAt(event, 'systemPrompt', 'system_prompt')) ?? null,
        history_messages: historyMessages(firstValue(valueAt(event, 'historyMessages', 'history_messages', 'history'), valueAt(event, 'messages'))),
        provider: provider(event) ?? null,
        model: model(event) ?? null,
        request: toJsonRecord(firstValue(valueAt(event, 'request'), valueAt(event, 'providerInput'))),
        metadata: baseMetadata(event),
      };
    case 'llm_output':
      return {
        hook,
        response: toJsonValue(firstValue(valueAt(event, 'response'), valueAt(event, 'output'), valueAt(event, 'assistantResponse', 'assistant_response'), valueAt(event, 'text'), valueAt(valueAt(event, 'message'), 'content'))),
        assistant_response: stringValue(valueAt(event, 'assistantResponse', 'assistant_response', 'text')) ?? null,
        assistant_message: toJsonValue(firstValue(valueAt(event, 'assistantMessage', 'assistant_message'), valueAt(event, 'message'))),
        history_messages: historyMessages(valueAt(event, 'historyMessages', 'history_messages', 'history')),
        provider: provider(event) ?? null,
        model: model(event) ?? null,
        usage: toJsonRecord(valueAt(event, 'usage')),
        metadata: baseMetadata(event),
      };
    case 'before_tool_call':
      return {
        hook,
        tool_name: stringValue(valueAt(event, 'toolName', 'tool_name', 'name')) ?? 'unknown_tool',
        params: toJsonValue(firstValue(valueAt(event, 'params'), valueAt(event, 'arguments'), valueAt(event, 'input'), {})),
        metadata: baseMetadata(event),
      };
    case 'after_tool_call':
      return {
        hook,
        tool_name: stringValue(valueAt(event, 'toolName', 'tool_name', 'name')) ?? 'unknown_tool',
        params: toJsonValue(valueAt(event, 'params')),
        result: toJsonValue(firstValue(valueAt(event, 'result'), valueAt(event, 'output'))),
        error: toJsonValue(valueAt(event, 'error')),
        duration_ms: numberValue(valueAt(event, 'durationMs', 'duration_ms', 'duration')) ?? null,
        outcome: outcome(event) ?? null,
        metadata: baseMetadata(event),
      };
    case 'agent_end':
      return {
        hook,
        outcome: outcome(event) ?? (successValue(event) === true ? 'success' : successValue(event) === false ? 'error' : null),
        reason: stringValue(firstValue(valueAt(event, 'reason'), valueAt(event, 'stopReason', 'stop_reason'), valueAt(event, 'phase'))) ?? null,
        error: toJsonValue(valueAt(event, 'error')),
        duration_ms: numberValue(valueAt(event, 'durationMs', 'duration_ms', 'duration')) ?? null,
        final_messages: historyMessages(valueAt(event, 'finalMessages', 'final_messages', 'messages')),
        metadata: baseMetadata(event),
      };
    case 'model_call_started':
      return {
        hook,
        provider: provider(event) ?? null,
        model: model(event) ?? null,
        request: toJsonRecord(valueAt(event, 'request')),
        metadata: baseMetadata(event),
      };
    case 'model_call_ended':
      return {
        hook,
        provider: provider(event) ?? null,
        model: model(event) ?? null,
        outcome: outcome(event) ?? null,
        error: toJsonValue(valueAt(event, 'error')),
        duration_ms: numberValue(valueAt(event, 'durationMs', 'duration_ms', 'duration')) ?? null,
        usage: toJsonRecord(valueAt(event, 'usage')),
        metadata: baseMetadata(event),
      };
    case 'subagent_spawned':
    case 'subagent_delivery_target':
    case 'subagent_ended':
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
    case 'session_start':
    case 'session_end':
      return {
        hook,
        session_key: stringValue(valueAt(event, 'sessionKey', 'session_key')) ?? null,
        session_id: stringValue(valueAt(event, 'sessionId', 'session_id')) ?? null,
        outcome: outcome(event) ?? (successValue(event) === true ? 'success' : successValue(event) === false ? 'error' : null),
        reason: stringValue(firstValue(valueAt(event, 'reason'), valueAt(event, 'stopReason', 'stop_reason'), valueAt(event, 'phase'))) ?? null,
        error: toJsonValue(valueAt(event, 'error')),
        duration_ms: numberValue(valueAt(event, 'durationMs', 'duration_ms', 'duration')) ?? null,
        metadata: baseMetadata(event),
      };
    default:
      throw new Error(`unsupported OpenClaw agent observability hook: ${hook}`);
  }
}

function normalizeIngressEvent(
  type: AgentObservabilityIngressEventType,
  event: unknown,
  payload: AgentObservabilityIngressPayloadV1,
  now = new Date(),
  context?: unknown,
): AgentObservabilityIngressEventV1 {
  const ingressEvent = {
    v: AGENT_OBSERVABILITY_SCHEMA_VERSION,
    type,
    source: AGENT_OBSERVABILITY_SOURCE,
    ts: now.toISOString(),
    identity: normalizeIdentity(event, context),
    payload: dropUndefined(payload as unknown as AgentObservabilityJsonValue),
  } as unknown as AgentObservabilityIngressEventV1;
  assertAgentObservabilityIngressEvent(ingressEvent);
  return ingressEvent;
}

export function normalizeHookEvent(hook: AgentObservabilityHook, event: unknown, now = new Date(), hookContext?: unknown): AgentObservabilityIngressEventV1 {
  const type = HOOK_TO_TYPE[hook];
  if (!type) throw new Error(`unsupported OpenClaw agent observability hook: ${hook}`);
  return normalizeIngressEvent(type, event, normalizePayload(hook, event), now, hookContext);
}

export function normalizeModelUsageDiagnosticEvent(event: unknown, now = new Date()): AgentObservabilityIngressEventV1 {
  if (valueAt(event, 'type') !== 'model.usage') {
    throw new Error('unsupported OpenClaw diagnostic event: expected model.usage');
  }
  return normalizeIngressEvent('openclaw.model.usage', event, modelUsagePayload(event), now);
}

export function normalizeAgentEvent(event: unknown, now = new Date()): AgentObservabilityIngressEventV1 | null {
  const hook = normalizeAgentEventHook(event);
  if (!hook) return null;
  const normalizedEvent = unwrapAgentEventData(event);
  return normalizeHookEvent(hook, normalizedEvent, now, event);
}
