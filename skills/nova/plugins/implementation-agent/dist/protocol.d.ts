export interface ImplementationInput {
    readonly runId: string;
    readonly moduleId: string;
    readonly attempt: number;
    readonly task: string;
    readonly headBefore: string;
}
export interface ImplementationCompletion {
    readonly status: 'ready_for_testing' | 'blocked';
    readonly runId: string;
    readonly moduleId: string;
    readonly attempt: number;
    readonly summary: string;
    readonly changedPaths: readonly string[];
    readonly checks: readonly {
        readonly name: string;
        readonly passed: boolean;
    }[];
    readonly session: {
        readonly sessionId: string;
        readonly startedAt: string;
        readonly completedAt: string;
        readonly transcriptDigest: string;
        readonly handoffs: number;
        readonly termination: 'completed' | 'blocked' | 'cancelled';
    };
}
export declare function buildRequest(agent: string, input: ImplementationInput, helperPrompt?: string): Readonly<Record<string, unknown>>;
export declare function parseCompletion(value: unknown, input: ImplementationInput): ImplementationCompletion;
