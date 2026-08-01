export interface TestSuitePlan {
    readonly repositoryRoot: string;
    readonly suites: readonly string[];
    readonly testConfig: Readonly<Record<string, unknown>>;
    readonly task: Readonly<Record<string, unknown>>;
    readonly moduleId?: string;
}
export interface GateInput {
    readonly runId: string;
    readonly gateId: string;
    readonly attempt: number;
    readonly task: string;
    readonly suiteEvidence: readonly {
        readonly suite: string;
        readonly passed: boolean;
        readonly summary: string;
    }[];
    readonly suitePlan: TestSuitePlan;
}
export type GateOutcome = 'passed' | 'request_fix' | 'blocked';
export interface GateVerdict {
    readonly outcome: GateOutcome;
    readonly runId: string;
    readonly gateId: string;
    readonly attempt: number;
    readonly summary: string;
    readonly failureClass: 'none' | 'test_failure' | 'contract' | 'configuration' | 'infrastructure' | 'rate_limit' | 'timeout';
    readonly findings: readonly string[];
}
export declare function buildRequest(agent: string, input: GateInput): Readonly<Record<string, unknown>>;
export declare function parseVerdict(value: unknown, input: GateInput): GateVerdict;
