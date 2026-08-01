export type SuiteRecord = Record<string, any>;
export type SuiteLogSink = (entry: Record<string, unknown>) => void;
export declare function suiteObject(value: unknown): SuiteRecord | null;
export declare function suiteObjectOrEmpty(value: unknown): SuiteRecord;
export declare function suiteNonEmptyString(value: unknown): string | null;
export declare function suiteArray<T = any>(value: unknown): T[];
export declare function suiteErrorMessage(error: unknown): string;
export declare function createSuiteLog(suite: string, label: string, logSink: SuiteLogSink | null | undefined): (message: string) => void;
