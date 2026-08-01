import type { SuiteVerdict } from '../services/verdict-schema.js';
type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;
interface SecurityContext {
    logSink?: LogSink | null;
    config?: {
        serve?: AnyRecord;
        security?: AnyRecord;
    };
}
export default function securitySuite(context: SecurityContext): Promise<SuiteVerdict>;
export {};
