export interface SummaryInput {
    readonly projectId: string;
    readonly runId: string;
    readonly status: 'succeeded' | 'failed' | 'blocked' | 'cancelled';
    readonly metrics: {
        readonly modulesTotal: number;
        readonly modulesPassed: number;
        readonly testsPassed: number;
        readonly testsFailed: number;
        readonly agentInvocations: number;
    };
    readonly diagnostics?: readonly string[];
}
export interface ProjectSummary extends SummaryInput {
    readonly schemaVersion: 'project-summary.v2';
    readonly deliveryPercent: number;
    readonly testPassPercent: number;
    readonly markdown: string;
}
export declare function buildSummary(input: SummaryInput): ProjectSummary;
