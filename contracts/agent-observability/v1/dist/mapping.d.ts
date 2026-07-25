import type { AgentObservabilityTelemetryMappingV1 } from './types.ts';
export declare const AGENT_OBSERVABILITY_TELEMETRY_MAPPINGS: readonly ({
    ingress_type: "openclaw.agent.ended";
    hook: "agent_end";
    current_telemetry_type: "agent.ended";
    future_telemetry_type: "agent.ended";
    promoted_by_default: true;
    notes: string;
} | {
    ingress_type: "openclaw.llm.input";
    hook: "llm_input";
    current_telemetry_type: "agent.llm.input.summary";
    future_telemetry_type: "agent.llm.input.summary";
    promoted_by_default: false;
    notes: string;
} | {
    ingress_type: "openclaw.llm.output";
    hook: "llm_output";
    current_telemetry_type: "agent.llm.output.summary";
    future_telemetry_type: "agent.llm.output.summary";
    promoted_by_default: false;
    notes: string;
} | {
    ingress_type: "openclaw.subagent.spawning";
    hook: "subagent_spawning";
    current_telemetry_type: "agent.spawn.requested";
    future_telemetry_type: "agent.spawn.requested";
    promoted_by_default: true;
    notes: string;
} | {
    ingress_type: "openclaw.subagent.spawned";
    hook: "subagent_spawned";
    current_telemetry_type: "agent.spawned";
    future_telemetry_type: "agent.spawned";
    promoted_by_default: true;
    notes: string;
} | {
    ingress_type: "openclaw.subagent.delivery_target";
    hook: "subagent_delivery_target";
    current_telemetry_type: "agent.delivery.target";
    future_telemetry_type: "agent.delivery.target";
    promoted_by_default: true;
    notes: string;
} | {
    ingress_type: "openclaw.subagent.ended";
    hook: "subagent_ended";
    current_telemetry_type: "agent.ended";
    future_telemetry_type: "agent.ended";
    promoted_by_default: true;
    notes: string;
} | {
    ingress_type: "openclaw.tool.started";
    hook: "before_tool_call";
    current_telemetry_type: "agent.tool.started";
    future_telemetry_type: "agent.tool.started";
    promoted_by_default: true;
    notes: string;
} | {
    ingress_type: "openclaw.tool.finished";
    hook: "after_tool_call";
    current_telemetry_type: "agent.tool.finished";
    future_telemetry_type: "agent.tool.finished";
    promoted_by_default: true;
    notes: string;
} | {
    ingress_type: "openclaw.model.started";
    hook: "model_call_started";
    current_telemetry_type: "agent.model.started";
    future_telemetry_type: "agent.model.started";
    promoted_by_default: true;
    notes: string;
} | {
    ingress_type: "openclaw.model.ended";
    hook: "model_call_ended";
    current_telemetry_type: "agent.model.ended";
    future_telemetry_type: "agent.model.ended";
    promoted_by_default: true;
    notes: string;
} | {
    ingress_type: "openclaw.model.usage";
    hook: "model_usage";
    current_telemetry_type: "cost.update";
    future_telemetry_type: "cost.update";
    promoted_by_default: true;
    notes: string;
} | {
    ingress_type: "openclaw.session.started";
    hook: "session_start";
    current_telemetry_type: "agent.session.started";
    future_telemetry_type: "agent.session.started";
    promoted_by_default: true;
    notes: string;
} | {
    ingress_type: "openclaw.session.ended";
    hook: "session_end";
    current_telemetry_type: "agent.session.ended";
    future_telemetry_type: "agent.session.ended";
    promoted_by_default: true;
    notes: string;
})[];
export declare function getAgentObservabilityTelemetryMapping(ingressType: string): AgentObservabilityTelemetryMappingV1 | null;
