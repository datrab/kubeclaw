export const AGENT_OBSERVABILITY_SCHEMA_VERSION = 1 as const;

export const AGENT_OBSERVABILITY_SOURCE = 'openclaw.plugin.agent-observer' as const;

export const AGENT_OBSERVABILITY_CONTROL_STREAM = 'pipeline:agent-observability:control:v1' as const;
export const AGENT_OBSERVABILITY_PAYLOAD_STREAM = 'pipeline:agent-observability:payload:v1' as const;
export const AGENT_OBSERVABILITY_DEADLETTER_STREAM = 'pipeline:agent-observability:deadletter:v1' as const;

export const AGENT_OBSERVABILITY_REDIS_DATA_FIELD = 'data' as const;

export const AGENT_OBSERVABILITY_MASKING_PROFILE = 'kubeclaw-agent-observer-v1-minimal-api-key-mask' as const;
export const AGENT_OBSERVABILITY_MASK_BASIC_API_KEY_PATTERN = 'basic_api_key_pattern' as const;

export const AGENT_OBSERVABILITY_DEFAULT_MAX_EVENT_BYTES = 3 * 1024 * 1024;
export const AGENT_OBSERVABILITY_ABSOLUTE_MAX_EVENT_BYTES = 5 * 1024 * 1024;
export const AGENT_OBSERVABILITY_PAYLOAD_TOO_LARGE_REASON = 'agent_observability_payload_too_large' as const;

export const AGENT_OBSERVABILITY_INGRESS_EVENT_TYPES = Object.freeze([
  'openclaw.agent.ended',
  'openclaw.llm.input',
  'openclaw.llm.output',
  'openclaw.subagent.spawning',
  'openclaw.subagent.spawned',
  'openclaw.subagent.delivery_target',
  'openclaw.subagent.ended',
  'openclaw.tool.started',
  'openclaw.tool.finished',
  'openclaw.model.started',
  'openclaw.model.ended',
  'openclaw.model.usage',
  'openclaw.session.started',
  'openclaw.session.ended',
] as const);

export const AGENT_OBSERVABILITY_DIAGNOSTICS = Object.freeze([
  'model.usage',
] as const);

export const AGENT_OBSERVABILITY_HOOKS = Object.freeze([
  'agent_end',
  'llm_input',
  'llm_output',
  'subagent_spawned',
  'subagent_delivery_target',
  'subagent_ended',
  'before_tool_call',
  'after_tool_call',
  'model_call_started',
  'model_call_ended',
  'session_start',
  'session_end',
] as const);
