export class StructuredOperationError extends Error {
    code;
    kind;
    diagnostics;
    cause;
    constructor(code, message, options = {}) {
        super(message);
        this.name = 'StructuredOperationError';
        this.code = code;
        this.kind = options.kind ?? 'terminal';
        this.diagnostics = options.diagnostics ?? {};
        if (options.cause !== undefined)
            this.cause = options.cause;
    }
}
export function operationSuccess(value) {
    return { ok: true, value };
}
export function operationFailure(error) {
    return {
        ok: false,
        code: error.code,
        kind: error.kind,
        message: error.message,
        diagnostics: error.diagnostics,
    };
}
export function errorMessage(error) {
    if (error instanceof Error)
        return error.message;
    return String(error);
}
export function errorCode(error, fallback) {
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && error.code) {
        return error.code;
    }
    return fallback;
}
