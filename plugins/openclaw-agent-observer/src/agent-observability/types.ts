import type {
  AGENT_OBSERVABILITY_DIAGNOSTICS,
  AGENT_OBSERVABILITY_HOOKS,
  AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES,
} from './constants.ts';

export type AgentObservabilityIngressEventType = (typeof AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES)[number];
export type AgentObservabilityHook = (typeof AGENT_OBSERVABILITY_HOOKS)[number];
export type AgentObservabilityDiagnostic = (typeof AGENT_OBSERVABILITY_DIAGNOSTICS)[number];
export type AgentObservabilityPayloadHook = AgentObservabilityHook | 'model_usage' | 'subagent_spawning';
export type AgentObservabilityStreamKind = 'control' | 'payload';
export type AgentObservabilityCanonicalTelemetryType =
  | 'agent.ended'
  | 'agent.spawn.requested'
  | 'agent.spawned'
  | 'agent.subagent.ended'
  | 'agent.tool.started'
  | 'agent.tool.finished'
  | 'agent.model.started'
  | 'agent.model.ended'
  | 'agent.session.started'
  | 'agent.session.ended'
  | 'agent.llm.input.summary'
  | 'agent.llm.output.summary'
  | 'cost.update'
  | 'plugin.event';

export type AgentObservabilityJsonValue =
  | null
  | string
  | number
  | boolean
  | AgentObservabilityJsonValue[]
  | { [key: string]: AgentObservabilityJsonValue | undefined };

export interface AgentObservabilityIdentityV1 {
  run_id?: string;
  project?: string;
  session_key?: string;
  session_id?: string;
  gateway_label?: string;
  dispatch_id?: string;
  agent_id?: string;
  agent_type?: string;
  module_id?: string;
  gate_id?: string;
  tool_call_id?: string;
  model_call_id?: string;
  parent_session_key?: string;
  child_session_key?: string;
}

export interface AgentObservabilityHistoryMessageV1 {
  role?: string;
  content: AgentObservabilityJsonValue;
  name?: string;
  tool_call_id?: string;
  metadata?: Record<string, AgentObservabilityJsonValue | undefined>;
}

export interface AgentObservabilityPayloadBaseV1 {
  hook: AgentObservabilityPayloadHook;
  metadata?: Record<string, AgentObservabilityJsonValue | undefined>;
  event_bytes?: number;
}

export interface AgentObservabilityLlmInputPayloadV1 extends AgentObservabilityPayloadBaseV1 {
  hook: 'llm_input';
  prompt: AgentObservabilityJsonValue;
  system_prompt?: string | null;
  history_messages: AgentObservabilityHistoryMessageV1[];
  provider?: string | null;
  model?: string | null;
  request?: Record<string, AgentObservabilityJsonValue | undefined>;
}

export interface AgentObservabilityLlmOutputPayloadV1 extends AgentObservabilityPayloadBaseV1 {
  hook: 'llm_output';
  response: AgentObservabilityJsonValue;
  assistant_response?: string | null;
  assistant_message?: AgentObservabilityHistoryMessageV1 | AgentObservabilityJsonValue;
  history_messages?: AgentObservabilityHistoryMessageV1[];
  provider?: string | null;
  model?: string | null;
  usage?: Record<string, AgentObservabilityJsonValue | undefined>;
}

export interface AgentObservabilityAgentEndedPayloadV1 extends AgentObservabilityPayloadBaseV1 {
  hook: 'agent_end';
  outcome?: string | null;
  reason?: string | null;
  error?: AgentObservabilityJsonValue;
  duration_ms?: number | null;
  final_messages?: AgentObservabilityHistoryMessageV1[];
}

export interface AgentObservabilityToolStartedPayloadV1 extends AgentObservabilityPayloadBaseV1 {
  hook: 'before_tool_call';
  tool_name: string;
  params: AgentObservabilityJsonValue;
}

export interface AgentObservabilityToolFinishedPayloadV1 extends AgentObservabilityPayloadBaseV1 {
  hook: 'after_tool_call';
  tool_name: string;
  params?: AgentObservabilityJsonValue;
  result?: AgentObservabilityJsonValue;
  error?: AgentObservabilityJsonValue;
  duration_ms?: number | null;
  outcome?: string | null;
}

export interface AgentObservabilityModelStartedPayloadV1 extends AgentObservabilityPayloadBaseV1 {
  hook: 'model_call_started';
  provider?: string | null;
  model?: string | null;
  request?: Record<string, AgentObservabilityJsonValue | undefined>;
}

export interface AgentObservabilityModelEndedPayloadV1 extends AgentObservabilityPayloadBaseV1 {
  hook: 'model_call_ended';
  provider?: string | null;
  model?: string | null;
  outcome?: string | null;
  error?: AgentObservabilityJsonValue;
  duration_ms?: number | null;
  usage?: Record<string, AgentObservabilityJsonValue | undefined>;
}

export interface AgentObservabilityModelUsagePayloadV1 extends AgentObservabilityPayloadBaseV1 {
  hook: 'model_usage';
  provider?: string | null;
  model?: string | null;
  cost_usd?: number | null;
  duration_ms?: number | null;
  context?: Record<string, AgentObservabilityJsonValue | undefined>;
  usage?: Record<string, AgentObservabilityJsonValue | undefined>;
}

export interface AgentObservabilitySubagentPayloadV1 extends AgentObservabilityPayloadBaseV1 {
  hook: 'subagent_spawning' | 'subagent_spawned' | 'subagent_delivery_target' | 'subagent_ended';
  child_session_key?: string | null;
  child_session_id?: string | null;
  agent_id?: string | null;
  requester_session_key?: string | null;
  child_run_id?: string | null;
  mode?: string | null;
  spawn_mode?: string | null;
  thread?: boolean | null;
  expects_completion_message?: boolean | null;
  requester_origin?: AgentObservabilityJsonValue;
  outcome?: string | null;
  reason?: string | null;
  error?: AgentObservabilityJsonValue;
  duration_ms?: number | null;
}

export interface AgentObservabilitySessionPayloadV1 extends AgentObservabilityPayloadBaseV1 {
  hook: 'session_start' | 'session_end';
  session_key?: string | null;
  session_id?: string | null;
  outcome?: string | null;
  reason?: string | null;
  error?: AgentObservabilityJsonValue;
  duration_ms?: number | null;
}

export type AgentObservabilityIngressPayloadV1 =
  | AgentObservabilityLlmInputPayloadV1
  | AgentObservabilityLlmOutputPayloadV1
  | AgentObservabilityAgentEndedPayloadV1
  | AgentObservabilityToolStartedPayloadV1
  | AgentObservabilityToolFinishedPayloadV1
  | AgentObservabilityModelStartedPayloadV1
  | AgentObservabilityModelEndedPayloadV1
  | AgentObservabilityModelUsagePayloadV1
  | AgentObservabilitySubagentPayloadV1
  | AgentObservabilitySessionPayloadV1;

export interface AgentObservabilityIngressEventV1 {
  v: 1;
  type: AgentObservabilityIngressEventType;
  source: string;
  ts: string;
  identity: AgentObservabilityIdentityV1;
  payload: AgentObservabilityIngressPayloadV1;
}

export interface AgentObservabilityTelemetryMappingV1 {
  ingress_type: AgentObservabilityIngressEventType;
  hook: AgentObservabilityPayloadHook;
  current_telemetry_type: AgentObservabilityCanonicalTelemetryType | null;
  future_telemetry_type: AgentObservabilityCanonicalTelemetryType | null;
  promoted_by_default: boolean;
  notes: string;
}

export interface AgentObservabilityPayloadSizeCheckV1 {
  ok: boolean;
  bytes: number;
  max_bytes: number;
  reason?: 'agent_observability_payload_too_large';
  identity?: AgentObservabilityIdentityV1;
}

export interface AgentObservabilityValidationResult {
  ok: boolean;
  errors: string[];
}
