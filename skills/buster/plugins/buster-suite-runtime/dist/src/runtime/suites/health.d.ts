import type { SuiteVerdict } from '../services/verdict-schema.js';
type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;
interface HealthContext {
    logSink?: LogSink | null;
    config?: {
        serve?: AnyRecord;
    };
    [key: string]: unknown;
}
export default function healthSuite(context: HealthContext): Promise<SuiteVerdict>;
export {};
