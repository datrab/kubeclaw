import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type JsonSafeValue = unknown;

function serializedFunctionName(value: Function): string {
  return typeof value.name === 'string' && value.name.trim() ? value.name : 'anonymous';
}

export function sanitizeForJson(value: unknown, seen: WeakSet<object> = new WeakSet()): JsonSafeValue {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const valueType = typeof value;
  if (selectTruthyValue(() => (selectTruthyValue(() => (valueType === 'string'), () => (valueType === 'number'))), () => (valueType === 'boolean'))) return value;
  if (valueType === 'bigint') return String(value);
  if (valueType === 'function') return `[Function ${serializedFunctionName(value as Function)}]`;
  if (valueType !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry) => sanitizeForJson(entry, seen));
    const output: Record<string, JsonSafeValue> = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = sanitizeForJson(child, seen);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

export function cloneSerializable<T = unknown>(value: T): T {
  if (value === undefined) return undefined as T;
  return JSON.parse(JSON.stringify(sanitizeForJson(value)));
}

export function deepClone<T = unknown>(value: T): T {
  if (value === undefined) return undefined as T;
  return JSON.parse(JSON.stringify(value));
}

export function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!value), () => (typeof value !== 'object'))), () => (seen.has(value)))) return value;
  seen.add(value);
  for (const entry of Object.values(value)) {
    deepFreeze(entry, seen);
  }
  return Object.freeze(value);
}

export function cloneReadonlySnapshot(value: unknown, seen: WeakMap<object, unknown> = new WeakMap()): unknown {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return value;
  if (typeof value === 'function') return undefined;
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const entry of value) {
      const clonedEntry = cloneReadonlySnapshot(entry, seen);
      if (selectTruthyValue(() => (clonedEntry !== undefined), () => (entry === undefined))) {
        clone.push(clonedEntry);
      } else if (typeof entry === 'function') {
        clone.push(null);
      }
    }
    return clone;
  }

  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  for (const [key, entry] of Object.entries(value)) {
    const clonedEntry = cloneReadonlySnapshot(entry, seen);
    if (selectTruthyValue(() => (clonedEntry !== undefined), () => (entry === undefined))) {
      clone[key] = clonedEntry;
    }
  }
  return clone;
}

export function createReadonlySnapshot<T = unknown>(value: T): T {
  return deepFreeze(cloneReadonlySnapshot(value)) as T;
}
