export type UnknownRecord = Record<string, any>;

export function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function objectRecord(value: unknown): UnknownRecord {
  return isPlainObject(value) ? value : {};
}
