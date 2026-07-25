import type { AgentObservabilityIngressEventType, AgentObservabilityIngressEventV1, AgentObservabilityValidationResult } from './types.ts';
export declare class AgentObservabilityContractError extends Error {
    errors: string[];
    constructor(errors: string[]);
}
export declare function validateAgentObservabilityIngressEvent(value: unknown): AgentObservabilityValidationResult;
export declare function assertAgentObservabilityIngressEvent(value: unknown): asserts value is AgentObservabilityIngressEventV1;
export declare function isAgentObservabilityIngressEvent(value: unknown): value is AgentObservabilityIngressEventV1;
export declare function expectedHookForIngressType(type: AgentObservabilityIngressEventType): string;
export declare function knownAgentObservabilityHooks(): readonly string[];
