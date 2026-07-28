export declare const PROMPT_CONTRACT_VERSION: "prompt-envelope.v1";
export interface PromptEnvelopeInput {
    readonly task: string;
    readonly evidence: unknown;
    readonly responseContract: unknown;
    readonly guidance?: readonly string[];
}
export interface PromptEnvelope {
    readonly schemaVersion: typeof PROMPT_CONTRACT_VERSION;
    readonly task: string;
    readonly evidence: unknown;
    readonly responseContract: unknown;
    readonly guidance: readonly string[];
}
export interface PromptLimits {
    readonly maxBytes?: number;
    readonly maxDepth?: number;
    readonly maxEntries?: number;
}
export declare function stablePromptJson(value: unknown, limits?: PromptLimits): string;
export declare function createPromptEnvelope(input: PromptEnvelopeInput, limits?: PromptLimits): PromptEnvelope;
export declare function serializePromptEnvelope(input: PromptEnvelopeInput, limits?: PromptLimits): string;
