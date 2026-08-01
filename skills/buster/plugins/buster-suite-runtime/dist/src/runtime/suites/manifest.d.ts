import type { SuiteVerdict } from '../services/verdict-schema.js';
export { dumpYamlDocuments, loadYamlDocuments } from './manifest-parser.js';
type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;
interface ManifestContext {
    logSink?: LogSink | null;
    config?: {
        manifest?: AnyRecord;
        serve?: AnyRecord;
    };
}
export default function manifestSuite(context: ManifestContext): Promise<SuiteVerdict>;
