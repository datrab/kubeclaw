export interface LintExecutionRequest {
    readonly workingDirectory: string;
    readonly policyPath: string;
    readonly policyProject: string;
    readonly tier: 'pre-check' | 'full';
    readonly project?: string;
    readonly modulePath?: string;
    readonly changedFiles?: readonly string[];
    readonly includeDebt?: boolean;
    readonly includeExperimental?: boolean;
}
export declare function executeLintReport(request: LintExecutionRequest): Promise<Record<string, unknown>>;
