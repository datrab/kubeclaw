import type { Finding, SuiteVerdict } from '../services/verdict-schema.js';
import type { AnyRecord } from './api-values.js';
type Log = (message: string) => void;
export interface ApiRunContext {
    tests: AnyRecord[];
    defaults: AnyRecord;
    vars: Record<string, string>;
    baseUrl: string;
    timeoutMs: number;
    wsTimeout: number;
    maxFindings: number;
    log: Log;
}
export interface ApiRunSummary {
    passed: number;
    failed: number;
    findings: Finding[];
}
export declare function executeApiTests(context: ApiRunContext): Promise<ApiRunSummary>;
export declare function buildApiVerdict(input: {
    startTime: number;
    summary: ApiRunSummary;
    tests: AnyRecord[];
    thresholds: AnyRecord | null;
    specPath: string;
    baseUrl: string;
    hasAuth: boolean;
    log: Log;
}): SuiteVerdict;
export {};
