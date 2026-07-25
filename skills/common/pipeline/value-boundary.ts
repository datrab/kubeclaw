export type ValueRecord = Record<string, any>;

export function isValueRecord(value: unknown): value is ValueRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeOptionalString(value: unknown): string | null {
  return value === undefined || value === null || value === '' ? null : String(value);
}

export function arrayValue<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function objectRecord(value: unknown): ValueRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ValueRecord : {};
}

export function nullableObjectRecord(value: unknown): ValueRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ValueRecord : null;
}

export function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function selectPresentValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

export function selectPresent<T>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

export function firstDefinedValue<T>(...values: T[]): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || 'missing_error_detail');
}
