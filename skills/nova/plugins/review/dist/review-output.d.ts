import type { StageResult } from '@kubeclaw/plugin-sdk';
export interface ReviewIssue {
    readonly source: string;
    readonly description: string;
    readonly affected_files: readonly string[];
    readonly recommended_fix: string;
}
export interface ReviewOutput {
    readonly status: 'PASS' | 'FAIL';
    readonly critical_issues: readonly ReviewIssue[];
    readonly deferred_issues: readonly ReviewIssue[];
    readonly checked_contracts: readonly string[];
    readonly opened_artifacts: readonly string[];
    readonly failed_commands: readonly string[];
    readonly unverified_requirements: readonly string[];
    readonly summary: string;
}
export type ParsedReviewOutput = {
    readonly ok: true;
    readonly value: ReviewOutput;
} | {
    readonly ok: false;
    readonly error: string;
};
export declare function parseReviewOutput(value: unknown): ParsedReviewOutput;
export declare function parseReviewDispatchResponse(response: Readonly<Record<string, unknown>>): ParsedReviewOutput;
export declare function reviewOutputToStageResult(parsed: ParsedReviewOutput): StageResult;
