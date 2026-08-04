export type OptionalAbsenceReader<T> = () => T;
export type ValueRecord = Record<string, any>;

export function selectDefinedValue<T>(...readers: Array<OptionalAbsenceReader<T>>): T {
  let lastValue: T | undefined;
  for (const reader of readers) {
    const value = reader();
    lastValue = value;
    if (value !== undefined && value !== null) return value;
  }
  return lastValue as T;
}

export function selectTruthyValue<T>(...readers: Array<OptionalAbsenceReader<T>>): T {
  let lastValue: T | undefined;
  for (const reader of readers) {
    const value = reader();
    lastValue = value;
    if (value) return value;
  }
  return lastValue as T;
}

export function arrayValue<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function objectRecord(value: unknown): ValueRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ValueRecord : {};
}

export function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function selectPresentValue(...values: unknown[]): string {
  return values.find((value) => typeof value === 'string' && value.length > 0) as string | undefined ?? '';
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const DEFAULT_SENSITIVE_KEY = /(?:authorization|cookie|password|secret|token|api[_-]?key|credential)/i;

function redact(value: unknown, depth: number): unknown {
  if (depth > 16) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, 1_000).map((entry) => redact(entry, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .slice(0, 1_000)
      .map(([key, entry]) => [
        key,
        DEFAULT_SENSITIVE_KEY.test(key) ? '[redacted]' : redact(entry, depth + 1),
      ]));
  }
  if (typeof value === 'string' && value.length > 65_536) return `${value.slice(0, 65_536)}[truncated]`;
  return value;
}

export function redactStructuredValue(value: unknown): unknown {
  return redact(value, 0);
}
