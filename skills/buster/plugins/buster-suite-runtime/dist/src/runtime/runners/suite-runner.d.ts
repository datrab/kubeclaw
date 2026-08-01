import type { SuiteVerdict } from '../services/verdict-schema.js';
import type { SuiteResult, SuiteRunnerOptions } from './suite-runner-contracts.js';
import { resolveSuiteResultsDir } from './suite-runner-artifacts.js';
import { runSuiteWithTimeout } from './suite-runner-execution.js';
import { applyBuildRuntimePort, buildDetailedSuiteSummary } from './suite-runner-graph.js';
export declare const EXECUTION_ORDER: string[];
export declare const DEPENDENCIES: Record<string, string[]>;
export declare function validateSuiteNames(suites: readonly unknown[]): string[];
export declare function resolveSuiteTimeoutMs(config: Record<string, unknown>): number;
export { applyBuildRuntimePort, buildDetailedSuiteSummary, resolveSuiteResultsDir, runSuiteWithTimeout };
export declare function collectReadySuites(suiteNames: readonly string[], completedResults?: Record<string, SuiteVerdict>): string[];
export declare function runSuites(suites: readonly unknown[], opts: SuiteRunnerOptions): Promise<{
    results: SuiteResult[];
    suiteSummary: string;
    suiteDetailSummary: string;
    criticalFailed: boolean;
}>;
