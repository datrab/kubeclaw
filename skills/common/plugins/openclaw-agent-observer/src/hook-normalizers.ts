import {
  AGENT_OBSERVABILITY_SCHEMA_VERSION,
  AGENT_OBSERVABILITY_SOURCE,
  assertAgentObservabilityIngressEvent,
} from './agent-observability/index.ts';
import type {
  AgentObservabilityHook,
  AgentObservabilityIdentityV1,
  AgentObservabilityIngressEventType,
  AgentObservabilityIngressEventV1,
  AgentObservabilityIngressPayloadV1,
  AgentObservabilityJsonValue,
} from './agent-observability/index.ts';
import {
  boolValue,
  dropUndefined,
  firstValue,
  historyMessages,
  isRecord,
  numberValue,
  stringValue,
  toJsonRecord,
  toJsonValue,
  valueAt,
  type UnknownRecord,
} from './hook-values.ts';
import { modelUsagePayload, normalizePayload } from './hook-payloads.ts';

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

type StringIdentityKey = Exclude<keyof AgentObservabilityIdentityV1, 'attempt'>;

function putIdentity(identity: AgentObservabilityIdentityV1, key: StringIdentityKey, value: unknown): void {
  const normalized = stringValue(value);
  if (normalized) identity[key] = normalized;
}

export function extractPluginConfig(event: unknown, hookContext?: unknown): unknown {
  return valueAt(contextOf(event, hookContext), 'pluginConfig') ?? valueAt(event, 'pluginConfig');
}

function normalizeIdentity(event: unknown, hookContext?: unknown): AgentObservabilityIdentityV1 {
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
  const attempt=firstValue(valueAt(event,'attempt'),valueAt(ctx,'attempt'),valueAt(metadata,'attempt'));
  if(typeof attempt==='number'&&Number.isFinite(attempt))identity.attempt=attempt;
  putIdentity(identity, 'tool_call_id', firstValue(valueAt(event, 'toolCallId', 'tool_call_id'), valueAt(ctx, 'toolCallId', 'tool_call_id')));
  putIdentity(identity, 'model_call_id', firstValue(valueAt(event, 'modelCallId', 'model_call_id', 'requestId'), valueAt(ctx, 'modelCallId', 'model_call_id', 'requestId')));
  putIdentity(identity, 'parent_session_key', firstValue(valueAt(event, 'parentSessionKey', 'parent_session_key', 'requesterSessionKey', 'requester_session_key'), valueAt(ctx, 'parentSessionKey', 'parent_session_key', 'requesterSessionKey', 'requester_session_key')));
  putIdentity(identity, 'child_session_key', firstValue(valueAt(event, 'childSessionKey', 'child_session_key', 'targetSessionKey'), valueAt(ctx, 'childSessionKey', 'child_session_key', 'targetSessionKey')));

  return identity;
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
