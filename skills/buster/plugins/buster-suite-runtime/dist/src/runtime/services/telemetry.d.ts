type RecordValue = Record<string, unknown>;
export interface BusterTelemetryContext {
    readonly project?: string;
    readonly runId?: string;
    readonly moduleId?: string;
    readonly gateId?: string;
    readonly gateType?: string;
    readonly dispatchId?: string;
    readonly sessionKey?: string;
}
export declare function createTelemetryContext(options?: RecordValue): BusterTelemetryContext;
export declare function emitEvent(_context: unknown, _type: string, _data?: RecordValue): Promise<void>;
export declare function emitPluginEvent(context: unknown, pluginEvent: string, data?: RecordValue): Promise<void>;
export declare function closeTelemetry(_context: unknown): Promise<void>;
export {};
