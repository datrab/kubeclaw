export interface ParsedTestOutput {
    framework: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
}
export interface FailureDetail {
    test: string;
    message: string;
}
export declare function parseOutput(output: string, exitCode: number): ParsedTestOutput;
export declare function extractFailures(output: string): FailureDetail[];
export declare function firstOutputLine(output: string): string | null;
