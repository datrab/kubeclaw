type JsonObject = Record<string, unknown>;
interface LoggerOptions {
    logPath?: string | null;
    module?: string | null;
    taskType?: string | null;
    gateId?: string | null;
    attempt?: unknown;
    dispatchId?: string | null;
    sessionKey?: string | null;
    emitTelemetry?: (type: string, payload: JsonObject) => unknown;
}
export interface Logger {
    info(tag: string, msg: string, data?: JsonObject): void;
    warn(tag: string, msg: string, data?: JsonObject): void;
    error(tag: string, msg: string, data?: JsonObject): void;
    step(stepName: string): void;
    flush(): void;
}
export declare function writeBusterRuntimeLog(level: 'info' | 'warn' | 'error', component: string, message: string, data?: JsonObject): void;
/**
 * Create a structured logger that writes JSON entries to stdout and a JSONL file.
 *
 * Log directory is created once on construction (not per entry).
 * File writes use appendFileSync — no buffering, no async I/O in the hot path.
 *
 * @param {object} opts
 * @param {string} [opts.logPath]    - Absolute or relative path to JSONL output file.
 *                                     If omitted, writes to stdout only.
 * @param {string} [opts.module]     - Module identifier (e.g. "06-observability-alignment")
 * @param {string} [opts.taskType]   - Task type (e.g. "module_test")
 * @returns {Logger}
 */
export declare function createLogger(opts?: LoggerOptions): Logger;
export {};
