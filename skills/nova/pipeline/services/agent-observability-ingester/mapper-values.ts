import type { AgentObservabilityJsonValue } from '../../agent-observability/src/index.ts';

export type JsonRecord = Record<string, AgentObservabilityJsonValue | undefined>;

export function seconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value / 1000 : null;
}

export function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function jsonSize(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function charCount(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value.length : JSON.stringify(value).length;
}

export function isJsonObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function asJsonValue(value: unknown): AgentObservabilityJsonValue {
  return value as AgentObservabilityJsonValue;
}

export function jsonObjectOrNull(value: unknown): AgentObservabilityJsonValue {
  return isJsonObject(value) ? value as AgentObservabilityJsonValue : null;
}

export function errorMessage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (isJsonObject(value) && typeof value.message === 'string') return value.message;
  return JSON.stringify(value);
}

export function usageNumber(usage: unknown, ...keys: string[]): number | null {
  if (!isJsonObject(usage)) return null;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}
