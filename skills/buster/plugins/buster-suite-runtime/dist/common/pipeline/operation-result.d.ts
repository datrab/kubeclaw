export type OperationFailureKind = 'retryable' | 'terminal' | 'noncritical';
export type OperationDiagnostics = Readonly<Record<string, unknown>>;
export type OperationSuccess<T> = Readonly<{
    ok: true;
    value: T;
}>;
export type OperationFailure = Readonly<{
    ok: false;
    code: string;
    kind: OperationFailureKind;
    message: string;
    diagnostics: OperationDiagnostics;
}>;
export type StructuredOperationErrorOptions = {
    kind?: OperationFailureKind;
    diagnostics?: OperationDiagnostics;
    cause?: unknown;
};
export declare class StructuredOperationError extends Error {
    readonly code: string;
    readonly kind: OperationFailureKind;
    readonly diagnostics: OperationDiagnostics;
    readonly cause?: unknown;
    constructor(code: string, message: string, options?: StructuredOperationErrorOptions);
}
export declare function operationSuccess<T>(value: T): OperationSuccess<T>;
export declare function operationFailure(error: StructuredOperationError): OperationFailure;
export declare function errorMessage(error: unknown): string;
export declare function errorCode(error: unknown, fallback: string): string;
