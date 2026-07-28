export interface ReviewInput {
    readonly runId: string;
    readonly attempt: number;
    readonly task: string;
    readonly evidence: readonly {
        readonly kind: string;
        readonly digest: string;
    }[];
}
export interface ReviewReport {
    readonly status: 'reviewed';
    readonly runId: string;
    readonly attempt: number;
    readonly summary: string;
    readonly observations: readonly {
        readonly dimension: 'architecture' | 'agents' | 'prompts' | 'tests' | 'configuration';
        readonly finding: string;
        readonly priority: 'low' | 'medium' | 'high';
    }[];
}
export declare function buildRequest(agent: string, input: ReviewInput): Readonly<Record<string, unknown>>;
export declare function parseReport(value: unknown, input: ReviewInput): ReviewReport;
