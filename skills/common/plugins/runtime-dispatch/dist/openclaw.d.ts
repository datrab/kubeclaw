import type { AdapterActivationContext } from '@kubeclaw/plugin-sdk';
export interface OpenClawTarget {
    readonly endpoint: string;
    readonly tokenSecret: string;
    readonly runtime: 'acp' | 'subagent';
    readonly agentId: string;
    readonly agentRole: string;
    readonly model: string;
    readonly thinking: string;
    readonly cwd: string;
    readonly repositoryRoot: string;
    readonly pollMs: number;
    readonly maxPollMs: number;
    readonly maxPolls: number;
    readonly sessionTimeoutMs: number;
    readonly resultPathPrefix: string;
    readonly resultEndpoint?: string;
    readonly resultTokenSecret?: string;
}
type JsonRecord = Record<string, unknown>;
export declare function buildOpenClawTask(payload: JsonRecord, resultFile: string): string;
export interface RuntimeSessionEvidence {
    readonly sessionId: string;
    readonly startedAt: string;
    readonly completedAt: string;
    readonly transcriptDigest: string;
    readonly termination: 'completed' | 'blocked' | 'cancelled';
}
export declare function attachRuntimeEvidence(payload: JsonRecord, result: unknown, session: RuntimeSessionEvidence): unknown;
export declare function dispatchOpenClaw(context: AdapterActivationContext, target: OpenClawTarget, payload: JsonRecord, signal: AbortSignal): Promise<Readonly<{
    result: unknown;
}>>;
export {};
