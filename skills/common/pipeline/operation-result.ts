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

export type OperationResult<T> = OperationSuccess<T> | OperationFailure;

export type StructuredOperationErrorOptions = {
  kind?: OperationFailureKind;
  diagnostics?: OperationDiagnostics;
  cause?: unknown;
};

export class StructuredOperationError extends Error {
  readonly code: string;
  readonly kind: OperationFailureKind;
  readonly diagnostics: OperationDiagnostics;
  override readonly cause?: unknown;

  constructor(code: string, message: string, options: StructuredOperationErrorOptions = {}) {
    super(message);
    this.name = 'StructuredOperationError';
    this.code = code;
    this.kind = options.kind ?? 'terminal';
    this.diagnostics = options.diagnostics ?? {};
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export function operationSuccess<T>(value: T): OperationSuccess<T> {
  return { ok: true, value };
}

export function operationFailure(error: StructuredOperationError): OperationFailure {
  return {
    ok: false,
    code: error.code,
    kind: error.kind,
    message: error.message,
    diagnostics: error.diagnostics,
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function errorCode(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && error.code) {
    return error.code;
  }
  return fallback;
}
