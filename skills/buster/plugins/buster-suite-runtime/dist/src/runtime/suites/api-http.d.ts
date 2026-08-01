import type { AnyRecord, ApiTestResult } from './api-values.js';
export declare function runHttpTest(test: AnyRecord, baseUrl: string, defaults: AnyRecord, vars: Record<string, string>, timeoutMs: number): Promise<ApiTestResult>;
