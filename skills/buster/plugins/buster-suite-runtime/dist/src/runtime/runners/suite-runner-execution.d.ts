import type { SuiteVerdict } from '../services/verdict-schema.js';
import type { SuiteContext, SuiteFunction, SuiteResult } from './suite-runner-contracts.js';
export declare function runSuiteWithTimeout(suiteName: string, suiteFn: SuiteFunction, context: SuiteContext, timeoutMs: number): Promise<SuiteVerdict>;
export declare function runOneSuite(input: {
    suiteName: string;
    suiteFn: SuiteFunction;
    context: SuiteContext;
    timeoutMs: number;
    telemetryContext: unknown;
    moduleId: string | undefined;
    attempt: number | undefined;
}): Promise<SuiteResult>;
