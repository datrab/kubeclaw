import type { AnyRecord, ApiTestResult } from './api-values.js';
type Log = (message: string) => void;
export declare function runWsTest(test: AnyRecord, baseUrl: string, vars: Record<string, string>, timeoutMs: number, log: Log): Promise<ApiTestResult>;
export {};
