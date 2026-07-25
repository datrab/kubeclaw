import type { AgentObservabilityIngressEventType, AgentObservabilityIngressEventV1, AgentObservabilityPayloadSizeCheckV1, AgentObservabilityStreamKind } from './types.ts';
export declare function selectAgentObservabilityStreamKind(type: AgentObservabilityIngressEventType): AgentObservabilityStreamKind;
export declare function selectAgentObservabilityStreamKey(type: AgentObservabilityIngressEventType): string;
export declare function normalizeAgentObservabilityMaxEventBytes(value: unknown): number;
export declare function measureAgentObservabilityEventBytes(event: AgentObservabilityIngressEventV1): number;
export declare function checkAgentObservabilityPayloadSize(event: AgentObservabilityIngressEventV1, maxBytes: number): AgentObservabilityPayloadSizeCheckV1;
