import type { SuiteVerdict } from '../services/verdict-schema.js';
export { resolveVisualRegOverallStatus, summarizeDiscordDelivery } from './visual-reg-delivery.js';
type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;
interface VisualRegContext {
    module?: string;
    moduleId?: string;
    project?: string;
    runId?: string;
    run_id?: string;
    dispatchId?: string;
    dispatch_id?: string;
    sessionKey?: string;
    session_key?: string;
    attempt?: number;
    screenshotsDir?: string;
    testsLogDir?: string;
    resultsDir?: string;
    logDir?: string;
    pipelineLogPath?: string;
    pipeline_log_path?: string;
    pipelineRunLogPath?: string;
    pipeline_run_log_path?: string;
    telemetryContext?: unknown;
    payload?: AnyRecord;
    logSink?: LogSink | null;
    config?: {
        project?: string;
        runId?: string;
        run_id?: string;
        serve?: AnyRecord;
        'visual-reg'?: AnyRecord;
    };
    [key: string]: unknown;
}
export declare function resolveVisualRegProjectDir(serve?: AnyRecord): string;
export declare function resolveVisualRegBaselineDir(context?: VisualRegContext): string;
export declare function runVisualReg(context: Record<string, unknown>): Promise<SuiteVerdict>;
