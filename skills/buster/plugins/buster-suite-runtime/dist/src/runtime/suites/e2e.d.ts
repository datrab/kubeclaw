import type { SuiteVerdict } from '../services/verdict-schema.js';
type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;
interface E2eContext {
    logSink?: LogSink | null;
    suiteAbortSignal?: AbortSignal;
    suiteDeadlineMs?: number;
    config?: {
        serve?: AnyRecord;
        e2e?: AnyRecord;
    };
}
export default function e2eSuite(context: E2eContext): Promise<SuiteVerdict>;
export {};
