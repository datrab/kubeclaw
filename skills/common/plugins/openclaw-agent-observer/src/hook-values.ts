import type {
  AgentObservabilityHistoryMessageV1,
  AgentObservabilityJsonValue,
} from './agent-observability/index.ts';

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function valueAt(source: unknown, ...keys: string[]): unknown {
  if (!isRecord(source)) return undefined;
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

export function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

export function stringValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

export function numberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

export function boolValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function normalizeError(error: Error): Record<string, AgentObservabilityJsonValue> {
  const normalized: Record<string, AgentObservabilityJsonValue> = {
    name: error.name,
    message: error.message,
  };
  if (error.stack) normalized.stack = error.stack;
  return normalized;
}

function normalizeObject(
  value: UnknownRecord,
  seen: Set<object>,
): Record<string, AgentObservabilityJsonValue> {
  if (seen.has(value)) return { value: '[Circular]' };
  seen.add(value);
  const next: Record<string, AgentObservabilityJsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) next[key] = toJsonValue(item, seen);
  }
  seen.delete(value);
  return next;
}

function normalizeScalar(value: unknown): AgentObservabilityJsonValue | undefined {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return String(value);
  return undefined;
}

export function toJsonValue(
  value: unknown,
  seen = new Set<object>(),
): AgentObservabilityJsonValue {
  const scalar = normalizeScalar(value);
  if (scalar !== undefined) return scalar;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return normalizeError(value);
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item, seen));
  if (!isRecord(value)) return String(value);
  if (seen.has(value)) return '[Circular]';
  return normalizeObject(value, seen);
}

export function toJsonRecord(
  value: unknown,
): Record<string, AgentObservabilityJsonValue> | undefined {
  if (!isRecord(value)) return undefined;
  return toJsonValue(value) as Record<string, AgentObservabilityJsonValue>;
}

export function dropUndefined(value: AgentObservabilityJsonValue): AgentObservabilityJsonValue {
  if (Array.isArray(value)) return value.map((item) => dropUndefined(item));
  if (value && typeof value === 'object') {
    const next: Record<string, AgentObservabilityJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) next[key] = dropUndefined(item);
    }
    return next;
  }
  return value;
}

export function historyMessages(value: unknown): AgentObservabilityHistoryMessageV1[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((item) => {
    if (!isRecord(item)) return { content: toJsonValue(item) };
    const content = 'content' in item ? item.content : firstValue(item.text, item.message, item);
    const message: AgentObservabilityHistoryMessageV1 = { content: toJsonValue(content) };
    const role = stringValue(item.role);
    const name = stringValue(item.name);
    const toolCallId = stringValue(item.tool_call_id ?? item.toolCallId);
    const metadata = toJsonRecord(item.metadata);
    if (role) message.role = role;
    if (name) message.name = name;
    if (toolCallId) message.tool_call_id = toolCallId;
    if (metadata) message.metadata = metadata;
    return message;
  });
}
