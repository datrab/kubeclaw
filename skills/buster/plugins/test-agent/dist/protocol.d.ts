export interface CommandSuite {
    readonly suite: string;
    readonly executable: string;
    readonly args: readonly string[];
    readonly workingDirectory: string;
}
export interface SuiteEvidence {
    readonly suite: string;
    readonly passed: boolean;
    readonly summary: string;
}
export interface TestInput {
    readonly runId: string;
    readonly taskId: string;
    readonly attempt: number;
    readonly task: string;
    readonly suiteEvidence: readonly SuiteEvidence[];
    readonly commandSuites?: readonly CommandSuite[];
}
export interface TestVerdict {
    readonly verdict: 'PASS' | 'FAIL';
    readonly runId: string;
    readonly taskId: string;
    readonly attempt: number;
    readonly summary: string;
    readonly findings: readonly string[];
    readonly session: {
        readonly sessionId: string;
        readonly startedAt: string;
        readonly completedAt: string;
        readonly transcriptDigest: string;
        readonly termination: 'completed' | 'blocked' | 'cancelled';
    };
}
export declare function buildRequest(agent: string, input: TestInput): Readonly<Record<string, unknown>>;
export declare function parseVerdict(value: unknown, input: TestInput): TestVerdict;
