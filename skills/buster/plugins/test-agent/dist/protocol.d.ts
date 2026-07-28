export interface TestInput {
    readonly runId: string;
    readonly taskId: string;
    readonly attempt: number;
    readonly task: string;
    readonly suiteEvidence: readonly {
        readonly suite: string;
        readonly passed: boolean;
        readonly summary: string;
    }[];
}
export interface TestVerdict {
    readonly verdict: 'PASS' | 'FAIL';
    readonly runId: string;
    readonly taskId: string;
    readonly attempt: number;
    readonly summary: string;
    readonly findings: readonly string[];
}
export declare function buildRequest(agent: string, input: TestInput): Readonly<Record<string, unknown>>;
export declare function parseVerdict(value: unknown, input: TestInput): TestVerdict;
