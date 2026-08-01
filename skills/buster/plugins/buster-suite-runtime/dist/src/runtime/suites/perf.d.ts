import type { SuiteVerdict } from '../services/verdict-schema.js';
type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;
interface PerfContext {
    moduleId?: string | undefined;
    module?: string | undefined;
    runId?: string | undefined;
    run_id?: string | undefined;
    logSink?: LogSink | null | undefined;
    attempt?: number | undefined;
    resultsDir?: string | undefined;
    testsLogDir?: string | null | undefined;
    suiteAbortSignal?: AbortSignal | undefined;
    suiteDeadlineMs?: number | undefined;
    config?: {
        serve?: AnyRecord;
        perf?: AnyRecord;
    };
}
interface PerfReportPaths {
    scratchPath: string;
    finalPath: string;
}
export declare function resolvePerfReportPaths(context?: PerfContext, perfConf?: AnyRecord): PerfReportPaths;
export default function perfSuite(context: PerfContext): Promise<SuiteVerdict>;
export {};
