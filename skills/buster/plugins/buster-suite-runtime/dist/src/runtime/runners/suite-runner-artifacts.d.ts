import type { SuiteVerdict } from '../services/verdict-schema.js';
export declare const RESULTS_DIR: string;
export declare function resolveSuiteResultsDir(moduleId: string, attempt: number | undefined): string;
export declare function writeSuiteResults(input: {
    suiteMap: Record<string, SuiteVerdict>;
    moduleId: string;
    project: string;
    swarmResultsDir: string | null;
    attempt: number | undefined;
    telemetryContext: unknown;
}): Promise<void>;
export declare function createSuiteLogSink(logPath: string | null, moduleId: string | undefined): ((entry: Record<string, unknown>) => void) | null;
export declare function initializeSuiteResultsDir(resultsDir: string | null, moduleId: string | undefined): void;
export declare function cleanupSuiteResources(cleanups: Array<() => Promise<void> | void>, context: Record<string, unknown>): Promise<void>;
