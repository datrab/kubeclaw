type IncidentOutput = (level: string, line: string) => void;
type ClassifiedNonBlockingErrorOptions = {
    reporter?: string;
    classification?: string;
    incidentKey?: string | null;
    message?: string;
    error?: unknown;
    includeErrorDetail?: boolean;
    level?: string;
    log?: IncidentOutput | null;
    fallback?: IncidentOutput | null;
};
export declare function sanitizeNonBlockingErrorDetail(value: unknown, maxChars?: number): string;
export declare function buildNonBlockingIncidentKey(...parts: unknown[]): string;
export declare function normalizeNonBlockingErrorDetail(error: unknown): string | null;
export declare function reportClassifiedNonBlockingError({ reporter, classification, incidentKey, message, error, includeErrorDetail, level, log, fallback, }?: ClassifiedNonBlockingErrorOptions): boolean;
export {};
