import { createHash } from 'node:crypto';
import { types } from 'node:util';

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

// Preserve the existing ordering: these bytes already identify durable artifacts
// and effect payloads. A portable ordering requires a separately versioned cutover.
export function canonicalJson(value: unknown): string {
  return serializeJsonValue(value, new Set());
}

function dataProperty(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
    throw new Error('CANONICAL_JSON_PROPERTY_INVALID');
  }
  return descriptor.value;
}

function serializeJsonValue(value: unknown, seen: Set<object>): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('CANONICAL_JSON_NUMBER_INVALID');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new Error('CANONICAL_JSON_VALUE_UNSUPPORTED');
  if (types.isProxy(value)) throw new Error('CANONICAL_JSON_PROXY_UNSUPPORTED');
  if (seen.has(value)) throw new Error('CANONICAL_JSON_CYCLE');
  seen.add(value);
  try {
    const keys = Reflect.ownKeys(value);
    if (Array.isArray(value)) return serializeJsonArray(value, keys, seen);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error('CANONICAL_JSON_PROTOTYPE_INVALID');
    if (keys.some((key) => typeof key !== 'string')) throw new Error('CANONICAL_JSON_PROPERTY_INVALID');
    return `{${(keys as string[]).sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${serializeJsonValue(dataProperty(value, key), seen)}`)
      .join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function serializeJsonArray(value: unknown[], keys: PropertyKey[], seen: Set<object>): string {
  if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error('CANONICAL_JSON_PROTOTYPE_INVALID');
  if (keys.length !== value.length + 1) throw new Error('CANONICAL_JSON_ARRAY_INVALID');
  const entries: string[] = [];
  for (let index = 0; index < value.length; index++) {
    entries.push(serializeJsonValue(dataProperty(value, String(index)), seen));
  }
  return `[${entries.join(',')}]`;
}

export function sha256Text(value: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function sha256Bytes(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
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
