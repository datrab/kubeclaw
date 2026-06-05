import {
  getAgentObservabilityTelemetryMapping,
} from '../../agent-observability/src/index.ts';
import type {
  AgentObservabilityIngressEventV1,
  AgentObservabilityJsonValue,
} from '../../agent-observability/src/index.ts';

type JsonRecord = Record<string, AgentObservabilityJsonValue | undefined>;

export interface AgentObservabilityTelemetryEmission {
  eventType: string;
  payload: JsonRecord;
  options: {
    source: string;
    emitter: string;
    runId?: string;
    project?: string;
  };
}

export interface AgentObservabilityMapperOptions {
  modelUsageAggregate?: {
    totalCostUsd: number | null;
    totalInputTokens: number;
    totalOutputTokens: number;
    partial: boolean;
  } | null;
}

function seconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value / 1000 : null;
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  return null;
}

function jsonSize(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function charCount(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.length;
  return JSON.stringify(value).length;
}

function isJsonObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asJsonValue(value: unknown): AgentObservabilityJsonValue {
  return value as AgentObservabilityJsonValue;
}

function jsonObjectOrNull(value: unknown): JsonRecord | null {
  return isJsonObject(value) ? value as JsonRecord : null;
}

function errorMessage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (isJsonObject(value) && typeof value.message === 'string') return value.message;
  return JSON.stringify(value);
}

function usageNumber(usage: unknown, ...keys: string[]): number | null {
  if (!isJsonObject(usage)) return null;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function identityPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const identity = event.identity || {};
  return {
    module_id: identity.module_id ?? null,
    gate_id: identity.gate_id ?? null,
    agent_type: identity.agent_type ?? identity.agent_id ?? null,
    session_key: identity.session_key ?? null,
    dispatch_id: identity.dispatch_id ?? null,
    gateway_label: identity.gateway_label ?? null,
  };
}

function baseOptions(event: AgentObservabilityIngressEventV1): AgentObservabilityTelemetryEmission['options'] {
  const options: AgentObservabilityTelemetryEmission['options'] = {
    source: 'openclaw.agent-observability.ingester',
    emitter: 'nova/pipeline/services/agent-observability-ingester',
  };
  if (event.identity.run_id !== undefined) options.runId = event.identity.run_id;
  if (event.identity.project !== undefined) options.project = event.identity.project;
  return options;
}

function maskingPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  return {
    masking_profile: event.masking.profile,
    masked: [...event.masking.masked],
  };
}

function pluginEventPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  return {
    plugin_id: 'openclaw-agent-observer',
    plugin_event: event.type,
    ...identityPayload(event),
    outcome: 'outcome' in event.payload ? event.payload.outcome ?? null : null,
    reason: 'reason' in event.payload ? event.payload.reason ?? null : null,
    duration_seconds: 'duration_ms' in event.payload ? seconds(event.payload.duration_ms) : null,
    details: {
      ingress_type: event.type,
      hook: event.payload.hook,
      source_ts: event.ts,
      identity: asJsonValue(event.identity),
      payload: asJsonValue(event.payload),
      masking: asJsonValue(event.masking),
    },
  };
}

function spawnRequestedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'subagent_spawning') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    agent_type: event.identity.agent_type ?? payload.agent_id ?? event.identity.agent_id ?? null,
    requester_session_key: payload.requester_session_key ?? event.identity.parent_session_key ?? event.identity.session_key ?? null,
    child_run_id: payload.child_run_id ?? null,
    mode: payload.mode ?? null,
    spawn_mode: payload.spawn_mode ?? null,
    thread: payload.thread ?? null,
    expects_completion_message: payload.expects_completion_message ?? null,
    requester_origin: jsonObjectOrNull(payload.requester_origin),
    requested_at: event.ts,
  };
}

function spawnedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  const childSessionKey = 'child_session_key' in payload ? payload.child_session_key : null;
  const agentId = 'agent_id' in payload ? payload.agent_id : null;
  return {
    agent_type: event.identity.agent_type ?? agentId ?? event.identity.agent_id ?? null,
    label: event.identity.gateway_label ?? null,
    module_id: event.identity.module_id ?? null,
    gate_id: event.identity.gate_id ?? null,
    session_key: event.identity.child_session_key ?? childSessionKey ?? event.identity.session_key ?? null,
    dispatch_id: event.identity.dispatch_id ?? null,
  };
}

function deliveryTargetPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'subagent_delivery_target') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    agent_type: event.identity.agent_type ?? payload.agent_id ?? event.identity.agent_id ?? null,
    requester_session_key: payload.requester_session_key ?? event.identity.parent_session_key ?? event.identity.session_key ?? null,
    child_session_key: payload.child_session_key ?? event.identity.child_session_key ?? null,
    child_run_id: payload.child_run_id ?? null,
    spawn_mode: payload.spawn_mode ?? payload.mode ?? null,
    expects_completion_message: payload.expects_completion_message ?? null,
    requester_origin: jsonObjectOrNull(payload.requester_origin),
    targeted_at: event.ts,
  };
}

function agentEndedPayload(event: AgentObservabilityIngressEventV1, scope = 'agent'): JsonRecord {
  const payload = event.payload;
  return {
    ...identityPayload(event),
    agent_scope: scope,
    label: event.identity.gateway_label ?? null,
    outcome: 'outcome' in payload ? payload.outcome ?? null : null,
    reason: 'reason' in payload ? payload.reason ?? null : null,
    duration_seconds: 'duration_ms' in payload ? seconds(payload.duration_ms) : null,
    final_message_count: 'final_messages' in payload && Array.isArray(payload.final_messages) ? payload.final_messages.length : null,
    error: 'error' in payload ? jsonObjectOrNull(payload.error) : null,
    error_message: 'error' in payload ? errorMessage(payload.error) : null,
    ended_at: event.ts,
  };
}

function llmInputSummaryPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'llm_input') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    provider: payload.provider ?? null,
    model: payload.model ?? null,
    model_call_id: event.identity.model_call_id ?? null,
    prompt_chars: charCount(payload.prompt),
    system_prompt_chars: charCount(payload.system_prompt),
    history_message_count: payload.history_messages.length,
    request: jsonObjectOrNull(payload.request),
    ...maskingPayload(event),
  };
}

function llmOutputSummaryPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'llm_output') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    provider: payload.provider ?? null,
    model: payload.model ?? null,
    model_call_id: event.identity.model_call_id ?? null,
    response_chars: charCount(payload.response),
    assistant_response_chars: charCount(payload.assistant_response),
    history_message_count: Array.isArray(payload.history_messages) ? payload.history_messages.length : null,
    usage: jsonObjectOrNull(payload.usage),
    input_tokens: usageNumber(payload.usage, 'input_tokens', 'tokens_in'),
    output_tokens: usageNumber(payload.usage, 'output_tokens', 'tokens_out'),
    ...maskingPayload(event),
  };
}

function toolStartedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'before_tool_call') return pluginEventPayload(event);
  const params = isJsonObject(payload.params) ? payload.params : null;
  return {
    ...identityPayload(event),
    tool_name: payload.tool_name,
    tool_call_id: event.identity.tool_call_id ?? null,
    params_bytes: jsonSize(payload.params),
    param_keys: params ? Object.keys(params) : null,
    ...maskingPayload(event),
  };
}

function toolFinishedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'after_tool_call') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    tool_name: payload.tool_name,
    tool_call_id: event.identity.tool_call_id ?? null,
    outcome: payload.outcome ?? null,
    reason: (payload as { reason?: string | null }).reason ?? null,
    duration_seconds: seconds(payload.duration_ms),
    result_bytes: jsonSize(payload.result),
    error: jsonObjectOrNull(payload.error),
    error_message: errorMessage(payload.error),
    ...maskingPayload(event),
  };
}

function modelStartedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'model_call_started') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    provider: payload.provider ?? null,
    model: payload.model ?? null,
    model_call_id: event.identity.model_call_id ?? null,
    request: jsonObjectOrNull(payload.request),
  };
}

function modelEndedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'model_call_ended') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    provider: payload.provider ?? null,
    model: payload.model ?? null,
    model_call_id: event.identity.model_call_id ?? null,
    outcome: payload.outcome ?? null,
    reason: (payload as { reason?: string | null }).reason ?? null,
    duration_seconds: seconds(payload.duration_ms),
    usage: jsonObjectOrNull(payload.usage),
    input_tokens: usageNumber(payload.usage, 'input_tokens', 'tokens_in'),
    output_tokens: usageNumber(payload.usage, 'output_tokens', 'tokens_out'),
    cost_usd: usageNumber(payload.usage, 'cost_usd', 'estimated_cost_usd'),
    error: jsonObjectOrNull(payload.error),
    error_message: errorMessage(payload.error),
  };
}

function costUpdatePayload(event: AgentObservabilityIngressEventV1, aggregate?: AgentObservabilityMapperOptions['modelUsageAggregate']): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'model_usage') return pluginEventPayload(event);
  const inputTokens = usageNumber(payload.usage, 'input', 'input_tokens', 'tokens_in');
  const outputTokens = usageNumber(payload.usage, 'output', 'output_tokens', 'tokens_out');
  const totalCostUsd = aggregate?.totalCostUsd ?? null;
  return {
    module_id: event.identity.module_id ?? null,
    agent_type: event.identity.agent_type ?? event.identity.agent_id ?? null,
    label: event.identity.gateway_label ?? null,
    cost_usd: payload.cost_usd ?? null,
    total_cost_usd: totalCostUsd,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    gate_id: event.identity.gate_id ?? null,
    model: payload.model ?? null,
    estimated_cost_usd: payload.cost_usd ?? null,
    cumulative_cost_usd: totalCostUsd,
    tokens_in: inputTokens,
    tokens_out: outputTokens,
  };
}

function sessionStartedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'session_start') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    session_key: payload.session_key ?? event.identity.session_key ?? null,
    session_id: payload.session_id ?? event.identity.session_id ?? null,
    started_at: event.ts,
  };
}

function sessionEndedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'session_end') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    session_key: payload.session_key ?? event.identity.session_key ?? null,
    session_id: payload.session_id ?? event.identity.session_id ?? null,
    outcome: payload.outcome ?? null,
    reason: payload.reason ?? null,
    duration_seconds: seconds(payload.duration_ms),
    error: jsonObjectOrNull(payload.error),
    error_message: errorMessage(payload.error),
    ended_at: event.ts,
  };
}

function payloadForTelemetryType(event: AgentObservabilityIngressEventV1, telemetryType: string, options: AgentObservabilityMapperOptions = {}): JsonRecord {
  switch (telemetryType) {
    case 'agent.spawn.requested':
      return spawnRequestedPayload(event);
    case 'agent.spawned':
      return spawnedPayload(event);
    case 'agent.delivery.target':
      return deliveryTargetPayload(event);
    case 'agent.ended':
      return agentEndedPayload(event, event.type === 'openclaw.subagent.ended' ? 'subagent' : 'agent');
    case 'agent.llm.input.summary':
      return llmInputSummaryPayload(event);
    case 'agent.llm.output.summary':
      return llmOutputSummaryPayload(event);
    case 'agent.tool.started':
      return toolStartedPayload(event);
    case 'agent.tool.finished':
      return toolFinishedPayload(event);
    case 'agent.model.started':
      return modelStartedPayload(event);
    case 'agent.model.ended':
      return modelEndedPayload(event);
    case 'cost.update':
      return costUpdatePayload(event, options.modelUsageAggregate);
    case 'agent.session.started':
      return sessionStartedPayload(event);
    case 'agent.session.ended':
      return sessionEndedPayload(event);
    case 'plugin.event':
    default:
      return pluginEventPayload(event);
  }
}

export function mapAgentObservabilityEventToTelemetry(
  event: AgentObservabilityIngressEventV1,
  options: AgentObservabilityMapperOptions = {},
): AgentObservabilityTelemetryEmission | null {
  const mapping = getAgentObservabilityTelemetryMapping(event.type);
  if (!mapping?.promoted_by_default || !mapping.current_telemetry_type) return null;

  return {
    eventType: mapping.current_telemetry_type,
    payload: payloadForTelemetryType(event, mapping.current_telemetry_type, options),
    options: baseOptions(event),
  };
}
