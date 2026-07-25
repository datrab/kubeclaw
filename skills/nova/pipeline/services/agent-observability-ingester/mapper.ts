import {
  getAgentObservabilityTelemetryMapping,
} from '../../agent-observability/src/index.ts';
import type {
  AgentObservabilityIngressEventV1,
} from '../../agent-observability/src/index.ts';
import {
  asJsonValue, charCount, errorMessage, isJsonObject, jsonObjectOrNull, jsonSize,
  seconds, stringValue, usageNumber,
} from './mapper-values.ts';
import type { JsonRecord } from './mapper-values.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';

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

function identityPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const identity = event.identity;
  return {
    module_id: selectDefinedValue(() => (identity.module_id), () => (null)),
    gate_id: selectDefinedValue(() => (identity.gate_id), () => (null)),
    agent_type: selectDefinedValue(() => (selectDefinedValue(() => (identity.agent_type), () => (identity.agent_id))), () => (null)),
    session_key: selectDefinedValue(() => (identity.session_key), () => (null)),
    dispatch_id: selectDefinedValue(() => (identity.dispatch_id), () => (null)),
    attempt: selectDefinedValue(() => (identity.attempt), () => (null)),
    gateway_label: selectDefinedValue(() => (identity.gateway_label), () => (null)),
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

function pluginEventPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload as unknown as JsonRecord;
  return {
    plugin_id: 'openclaw-agent-observer',
    plugin_event: event.type,
    ...identityPayload(event),
    outcome: selectDefinedValue(() => (payload.outcome), () => (null)),
    reason: selectDefinedValue(() => (payload.reason), () => (null)),
    duration_seconds: 'duration_ms' in event.payload ? seconds(event.payload.duration_ms) : null,
    details: {
      ingress_type: event.type,
      hook: event.payload.hook,
      source_ts: event.ts,
      identity: asJsonValue(event.identity),
      payload: asJsonValue(event.payload),
    },
  };
}

function spawnRequestedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'subagent_spawning') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    agent_type: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (event.identity.agent_type), () => (payload.agent_id))), () => (event.identity.agent_id))), () => (null)),
    requester_session_key: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (payload.requester_session_key), () => (event.identity.parent_session_key))), () => (event.identity.session_key))), () => (null)),
    child_run_id: selectDefinedValue(() => (payload.child_run_id), () => (null)),
    mode: selectDefinedValue(() => (payload.mode), () => (null)),
    spawn_mode: selectDefinedValue(() => (payload.spawn_mode), () => (null)),
    thread: selectDefinedValue(() => (payload.thread), () => (null)),
    expects_completion_message: selectDefinedValue(() => (payload.expects_completion_message), () => (null)),
    requester_origin: jsonObjectOrNull(payload.requester_origin),
    requested_at: event.ts,
  };
}

function spawnedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  const childSessionKey = 'child_session_key' in payload ? payload.child_session_key : null;
  const agentId = 'agent_id' in payload ? payload.agent_id : null;
  return {
    agent_type: selectDefinedValue(() => (event.identity.agent_type), () => (null)),
    label: selectDefinedValue(() => (event.identity.gateway_label), () => (null)),
    module_id: selectDefinedValue(() => (event.identity.module_id), () => (null)),
    gate_id: selectDefinedValue(() => (event.identity.gate_id), () => (null)),
    session_key: selectDefinedValue(() => (event.identity.child_session_key), () => (null)),
    dispatch_id: selectDefinedValue(() => (event.identity.dispatch_id), () => (null)),
  };
}

function deliveryTargetPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'subagent_delivery_target') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    agent_type: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (event.identity.agent_type), () => (payload.agent_id))), () => (event.identity.agent_id))), () => (null)),
    requester_session_key: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (payload.requester_session_key), () => (event.identity.parent_session_key))), () => (event.identity.session_key))), () => (null)),
    child_session_key: selectDefinedValue(() => (selectDefinedValue(() => (payload.child_session_key), () => (event.identity.child_session_key))), () => (null)),
    child_run_id: selectDefinedValue(() => (payload.child_run_id), () => (null)),
    spawn_mode: selectDefinedValue(() => (selectDefinedValue(() => (payload.spawn_mode), () => (payload.mode))), () => (null)),
    expects_completion_message: selectDefinedValue(() => (payload.expects_completion_message), () => (null)),
    requester_origin: jsonObjectOrNull(payload.requester_origin),
    targeted_at: event.ts,
  };
}

function agentEndedPayload(event: AgentObservabilityIngressEventV1, scope: any = 'agent'): JsonRecord {
  const payload = event.payload;
  return {
    ...identityPayload(event),
    agent_scope: scope,
    label: selectDefinedValue(() => (event.identity.gateway_label), () => (null)),
    outcome: 'outcome' in payload ? selectDefinedValue(() => (payload.outcome), () => (null)) : null,
    reason: 'reason' in payload ? selectDefinedValue(() => (payload.reason), () => (null)) : null,
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
    provider: selectDefinedValue(() => (payload.provider), () => (null)),
    model: selectDefinedValue(() => (payload.model), () => (null)),
    model_call_id: selectDefinedValue(() => (event.identity.model_call_id), () => (null)),
    prompt_chars: charCount(payload.prompt),
    system_prompt_chars: charCount(payload.system_prompt),
    history_message_count: payload.history_messages.length,
    request: jsonObjectOrNull(payload.request),
  };
}

function llmOutputSummaryPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'llm_output') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    provider: selectDefinedValue(() => (payload.provider), () => (null)),
    model: selectDefinedValue(() => (payload.model), () => (null)),
    model_call_id: selectDefinedValue(() => (event.identity.model_call_id), () => (null)),
    response_chars: charCount(payload.response),
    assistant_response_chars: charCount(payload.assistant_response),
    history_message_count: Array.isArray(payload.history_messages) ? payload.history_messages.length : null,
    usage: jsonObjectOrNull(payload.usage),
    input_tokens: usageNumber(payload.usage, 'input_tokens', 'tokens_in'),
    output_tokens: usageNumber(payload.usage, 'output_tokens', 'tokens_out'),
  };
}

function toolStartedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'before_tool_call') return pluginEventPayload(event);
  const params = isJsonObject(payload.params) ? payload.params : null;
  return {
    ...identityPayload(event),
    tool_name: payload.tool_name,
    tool_call_id: selectDefinedValue(() => (event.identity.tool_call_id), () => (null)),
    model_call_id: selectDefinedValue(() => (event.identity.model_call_id), () => (null)),
    params_bytes: jsonSize(payload.params),
    param_keys: params ? Object.keys(params) : null,
  };
}

function toolFinishedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'after_tool_call') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    tool_name: payload.tool_name,
    tool_call_id: selectDefinedValue(() => (event.identity.tool_call_id), () => (null)),
    model_call_id: selectDefinedValue(() => (event.identity.model_call_id), () => (null)),
    outcome: selectDefinedValue(() => (payload.outcome), () => (null)),
    reason: selectDefinedValue(() => ((payload as {
    reason?: string | null;
}).reason), () => (null)),
    duration_seconds: seconds(payload.duration_ms),
    result_bytes: jsonSize(payload.result),
    error: jsonObjectOrNull(payload.error),
    error_message: errorMessage(payload.error),
  };
}

function modelStartedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'model_call_started') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    provider: selectDefinedValue(() => (payload.provider), () => (null)),
    model: selectDefinedValue(() => (payload.model), () => (null)),
    model_call_id: selectDefinedValue(() => (event.identity.model_call_id), () => (null)),
    request: jsonObjectOrNull(payload.request),
  };
}

function modelEndedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'model_call_ended') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    provider: selectDefinedValue(() => (payload.provider), () => (null)),
    model: selectDefinedValue(() => (payload.model), () => (null)),
    model_call_id: selectDefinedValue(() => (event.identity.model_call_id), () => (null)),
    outcome: selectDefinedValue(() => (payload.outcome), () => (null)),
    reason: selectDefinedValue(() => ((payload as {
    reason?: string | null;
}).reason), () => (null)),
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
  const totalCostUsd = selectDefinedValue(() => (aggregate?.totalCostUsd), () => (null));
  return {
    module_id: selectDefinedValue(() => (event.identity.module_id), () => (null)),
    agent_type: selectDefinedValue(() => (selectDefinedValue(() => (event.identity.agent_type), () => (event.identity.agent_id))), () => (null)),
    label: selectDefinedValue(() => (event.identity.gateway_label), () => (null)),
    cost_usd: selectDefinedValue(() => (payload.cost_usd), () => (null)),
    total_cost_usd: totalCostUsd,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    gate_id: selectDefinedValue(() => (event.identity.gate_id), () => (null)),
    model: selectDefinedValue(() => (payload.model), () => (null)),
    estimated_cost_usd: selectDefinedValue(() => (payload.cost_usd), () => (null)),
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
    session_key: selectDefinedValue(() => (selectDefinedValue(() => (payload.session_key), () => (event.identity.session_key))), () => (null)),
    session_id: selectDefinedValue(() => (selectDefinedValue(() => (payload.session_id), () => (event.identity.session_id))), () => (null)),
    started_at: event.ts,
  };
}

function sessionEndedPayload(event: AgentObservabilityIngressEventV1): JsonRecord {
  const payload = event.payload;
  if (payload.hook !== 'session_end') return pluginEventPayload(event);
  return {
    ...identityPayload(event),
    session_key: selectDefinedValue(() => (selectDefinedValue(() => (payload.session_key), () => (event.identity.session_key))), () => (null)),
    session_id: selectDefinedValue(() => (selectDefinedValue(() => (payload.session_id), () => (event.identity.session_id))), () => (null)),
    outcome: selectDefinedValue(() => (payload.outcome), () => (null)),
    reason: selectDefinedValue(() => (payload.reason), () => (null)),
    duration_seconds: seconds(payload.duration_ms),
    error: jsonObjectOrNull(payload.error),
    error_message: errorMessage(payload.error),
    ended_at: event.ts,
  };
}

function payloadForTelemetryType(event: AgentObservabilityIngressEventV1, telemetryType: string, options: AgentObservabilityMapperOptions = {}): JsonRecord {
  const builders: Record<string, () => JsonRecord> = {
    'agent.spawn.requested': () => spawnRequestedPayload(event),
    'agent.spawned': () => spawnedPayload(event),
    'agent.delivery.target': () => deliveryTargetPayload(event),
    'agent.ended': () => agentEndedPayload(event, event.type === 'openclaw.subagent.ended' ? 'subagent' : 'agent'),
    'agent.llm.input.summary': () => llmInputSummaryPayload(event),
    'agent.llm.output.summary': () => llmOutputSummaryPayload(event),
    'agent.tool.started': () => toolStartedPayload(event),
    'agent.tool.finished': () => toolFinishedPayload(event),
    'agent.model.started': () => modelStartedPayload(event),
    'agent.model.ended': () => modelEndedPayload(event),
    'cost.update': () => costUpdatePayload(event, options.modelUsageAggregate),
    'agent.session.started': () => sessionStartedPayload(event),
    'agent.session.ended': () => sessionEndedPayload(event),
    'plugin.event': () => pluginEventPayload(event),
  };
  return (builders[telemetryType] ?? builders['plugin.event']!)();
}

export function mapAgentObservabilityEventToTelemetry(
  event: AgentObservabilityIngressEventV1,
  options: AgentObservabilityMapperOptions = {},
): AgentObservabilityTelemetryEmission | null {
  const mapping = getAgentObservabilityTelemetryMapping(event.type);
  if (!mapping?.promoted_by_default) return null;
  if (!mapping.current_telemetry_type) return null;

  return {
    eventType: mapping.current_telemetry_type,
    payload: payloadForTelemetryType(event, mapping.current_telemetry_type, options),
    options: baseOptions(event),
  };
}
