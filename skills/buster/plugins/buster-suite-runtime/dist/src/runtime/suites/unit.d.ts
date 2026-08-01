import type { SuiteVerdict } from '../services/verdict-schema.js';
type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;
interface UnitContext {
    logSink?: LogSink | null;
    suiteAbortSignal?: AbortSignal;
    suiteDeadlineMs?: number;
    config?: {
        serve?: AnyRecord;
        unit?: AnyRecord;
    };
}
export default function unitSuite(context: UnitContext): Promise<SuiteVerdict>;
export {};
