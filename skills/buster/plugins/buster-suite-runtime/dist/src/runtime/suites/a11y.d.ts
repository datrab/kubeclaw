import type { SuiteVerdict } from '../services/verdict-schema.js';
type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;
interface A11yContext {
    logSink?: LogSink | null;
    config?: {
        serve?: AnyRecord;
        a11y?: AnyRecord;
    };
}
export default function a11ySuite(context: A11yContext): Promise<SuiteVerdict>;
export {};
