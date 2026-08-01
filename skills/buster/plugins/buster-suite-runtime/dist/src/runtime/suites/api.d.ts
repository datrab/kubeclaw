import type { SuiteVerdict } from '../services/verdict-schema.js';
import type { AnyRecord } from './api-values.js';
type LogSink = (entry: Record<string, unknown>) => void;
interface ApiContext {
    logSink?: LogSink | null;
    config?: {
        serve?: AnyRecord;
        api?: AnyRecord;
    };
}
export default function apiSuite(context: ApiContext): Promise<SuiteVerdict>;
export {};
