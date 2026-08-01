import type { SuiteVerdict } from '../services/verdict-schema.js';
type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;
interface BundleContext {
    logSink?: LogSink | null;
    suiteAbortSignal?: AbortSignal;
    suiteDeadlineMs?: number;
    config?: {
        bundle?: AnyRecord;
    };
}
export default function bundleSuite(context: BundleContext): Promise<SuiteVerdict>;
export {};
