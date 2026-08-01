export declare const JOB_SCHEMA = "buster-suite-job.v2";
export declare const STATUS_SCHEMA = "buster-suite-status.v2";
export declare const RESULT_SCHEMA = "buster-suite-result.v2";
export declare const SUPPORTED_SUITES: readonly ["manifest", "build", "health", "k8s", "tailscale-preview", "a11y", "perf", "bundle", "security", "visual-reg", "api", "e2e", "unit"];
export declare function requiredCapabilitiesForSuites(suites: readonly string[]): readonly string[];
export type JobState = 'accepted' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface BusterSuiteResult {
    readonly schemaVersion: typeof RESULT_SCHEMA;
    readonly jobId: string;
    readonly results: readonly Readonly<Record<string, unknown>>[];
    readonly suiteSummary: string;
    readonly suiteDetailSummary: string;
    readonly criticalFailed: boolean;
    readonly completedAt: string;
}
export interface BusterSuiteJob {
    readonly schemaVersion: typeof JOB_SCHEMA;
    readonly jobId: string;
    readonly idempotencyKey: string;
    readonly archive: {
        readonly encoding: 'base64';
        readonly sha256: string;
        readonly bytes: number;
        readonly data: string;
    };
    readonly suites: readonly string[];
    readonly testConfig: Readonly<Record<string, unknown>>;
    readonly task: Readonly<Record<string, unknown>>;
    readonly moduleId?: string;
    readonly attempt?: number;
    readonly capabilities: readonly string[];
    readonly timeoutMs: number;
}
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function exact(value: Record<string, unknown>, fields: readonly string[], code: string): void;
export declare function stringList(value: unknown, label: string, allowEmpty?: boolean): readonly string[];
export declare function sha256(value: Buffer | string): string;
export declare function parseJob(value: unknown, maxArchiveBytes: number): BusterSuiteJob;
export declare function parseResult(value: unknown, expectedJobId?: string): BusterSuiteResult;
export declare function relocateRepositoryValues(value: unknown, sourceRoot: string, marker?: string): unknown;
export declare function materializeRepositoryValues(value: unknown, repositoryRoot: string): unknown;
