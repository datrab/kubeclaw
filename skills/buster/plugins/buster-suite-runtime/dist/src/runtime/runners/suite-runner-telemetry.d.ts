import type { SuiteVerdict } from '../services/verdict-schema.js';
export declare function emitSuiteCompleted(tctx: unknown, moduleId: string | undefined, suiteName: string, result: SuiteVerdict, attempt: number | undefined, startMs: number): Promise<void>;
