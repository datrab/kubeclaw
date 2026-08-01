export declare const STATUS: Readonly<{
    PASS: "PASS";
    FAIL: "FAIL";
    SKIP: "SKIP";
    ERROR: "ERROR";
}>;
export type SuiteStatus = typeof STATUS[keyof typeof STATUS];
export declare const SEVERITY: Readonly<{
    CRITICAL: "critical";
    SERIOUS: "serious";
    MODERATE: "moderate";
    MINOR: "minor";
}>;
export type FindingSeverity = typeof SEVERITY[keyof typeof SEVERITY];
declare const RECOMMENDATION: Readonly<{
    NO_SUBAGENT: "NO_SUBAGENT";
    SPAWN: "SPAWN";
}>;
type RunnerRecommendation = typeof RECOMMENDATION[keyof typeof RECOMMENDATION];
export interface FindingOptions {
    rule?: string | null;
    element?: string | null;
    file?: string | null;
    line?: number | null;
}
export interface Finding {
    severity: FindingSeverity;
    message: string;
    rule: string | null;
    element: string | null;
    file: string | null;
    line: number | null;
}
export interface SuiteVerdictOptions {
    critical?: boolean;
    duration_ms?: number;
    checks_total?: number;
    checks_passed?: number;
    checks_failed?: number;
    findings?: Finding[];
    metadata?: Record<string, unknown>;
    reason?: string | null;
    error?: string | null;
}
export interface SuiteVerdict {
    suite: string;
    status: SuiteStatus;
    critical: boolean;
    duration_ms: number;
    checks_total: number;
    checks_passed: number;
    checks_failed: number;
    findings: Finding[];
    metadata: Record<string, unknown>;
    reason?: string;
    error?: string;
}
export interface RunnerVerdict {
    run_id: string;
    module: string;
    project: string;
    timestamp: string;
    overall_status: SuiteStatus;
    critical_failure: boolean;
    duration_ms: number;
    suites: Record<string, SuiteVerdict>;
    summary: string;
    recommendation: RunnerRecommendation;
}
export declare function createSuiteVerdict(suite: string, status: SuiteStatus, opts?: SuiteVerdictOptions): SuiteVerdict;
export declare function createFinding(severity: FindingSeverity, message: string, opts?: FindingOptions): Finding;
export declare function createRunnerVerdict(module: string, project: string, suiteResults: Record<string, SuiteVerdict> | null | undefined): RunnerVerdict;
export {};
