import type { SuiteVerdict } from '../services/verdict-schema.js';
import type { SuiteFunction, SuiteResult, SuiteRunnerOptions } from './suite-runner-contracts.js';
export interface SuiteGraphAuthority {
    registry: Readonly<Record<string, SuiteFunction>>;
    dependencies: Record<string, string[]>;
    executionOrder: string[];
    validateNames: (suites: readonly unknown[]) => string[];
    resolveTimeout: (config: Record<string, unknown>) => number;
}
export declare function buildDetailedSuiteSummary(results: readonly SuiteVerdict[]): string;
export declare function applyBuildRuntimePort(config: Record<string, unknown>, result: SuiteVerdict): void;
export declare function collectReadySuites(names: readonly string[], completed: Record<string, SuiteVerdict>, dependencies: Record<string, string[]>, order: string[]): string[];
export declare function executeSuites(authority: SuiteGraphAuthority, suites: readonly unknown[], opts: SuiteRunnerOptions): Promise<{
    results: SuiteResult[];
    suiteSummary: string;
    suiteDetailSummary: string;
    criticalFailed: boolean;
}>;
