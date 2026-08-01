export type SuiteRecord = Record<string, any>;
export type SuiteLogSink = (entry: Record<string, unknown>) => void;

export function suiteObject(value: unknown): SuiteRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as SuiteRecord : null;
}

export function suiteObjectOrEmpty(value: unknown): SuiteRecord {
  const record = suiteObject(value);
  return record === null ? {} : record;
}

export function suiteNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function suiteArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function suiteErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return error == null ? 'missing_error_detail' : String(error);
}

export function createSuiteLog(
  suite: string,
  label: string,
  logSink: SuiteLogSink | null | undefined,
): (message: string) => void {
  return (message: string): void => {
    console.log(`[SUITE] [${label}] ${message}`);
    if (logSink) logSink({ suite, msg: message });
  };
}
