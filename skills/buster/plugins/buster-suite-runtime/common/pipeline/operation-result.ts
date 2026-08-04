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

type OperationResult<T> = OperationSuccess<T> | OperationFailure;

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
