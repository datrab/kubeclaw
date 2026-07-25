import { AGENT_OBSERVABILITY_CONTROL_STREAM, AGENT_OBSERVABILITY_PAYLOAD_STREAM } from '../../agent-observability/src/index.ts';
import { emitEvent as defaultEmitEvent } from '../telemetry/dispatch.ts';
import { recordObservabilityDegraded as defaultRecordObservabilityDegraded, recordObservabilityRestored as defaultRecordObservabilityRestored } from '../observability.ts';
import type { AgentObservabilityStreamKey, EmitEvent, ObservabilityReporter, StreamEntry } from './consumer-boundary.ts';
import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';

const TELEMETRY_EMIT_FAILED = 'telemetry emit failed';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isExpectedRedisCloseDuringShutdown(error: unknown): boolean {
  return /(connection is closed|connection closed|closed before ready|connection ended|stream isn't writeable|write after end)/i.test(errorMessage(error));
}

export function emitFailureError(result: unknown): string | null {
  if (selectTruthyValue(() => (!result), () => (typeof result !== 'object'))) return null;
  const record = result as Record<string, unknown>;
  if (record.validationError) return null;
  if (record.ok === false && record.skipped !== true) {
    return errorMessage(selectDefinedValue(() => (selectDefinedValue(() => (record.error), () => (record.reason))), () => (TELEMETRY_EMIT_FAILED)));
  }
  if (record.error && record.ok !== true && record.skipped !== true) return errorMessage(record.error);
  return null;
}

export function redisFieldValue(value: unknown): string {
  return selectTruthyValue(() => (value === undefined), () => (value === null)) ? '' : String(value);
}

export function redisCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve: any, reject: any) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function streamEntryFromRedis(stream: AgentObservabilityStreamKey, entry: unknown, reclaimed: boolean): StreamEntry | null {
  if (!Array.isArray(entry)) return null;
  if (entry.length < 2) return null;
  if (typeof entry[0] !== 'string') return null;
  if (!Array.isArray(entry[1])) return null;
  const fields: Record<string, string> = {};
  for (let i = 0; i < entry[1].length; i += 2) {
    fields[String(entry[1][i])] = redisFieldValue(entry[1][i + 1]);
  }
  return { stream, id: entry[0], data: fields, reclaimed };
}

export function entriesFromXreadgroup(result: unknown): StreamEntry[] {
  if (!Array.isArray(result)) return [];
  const entries: StreamEntry[] = [];
  for (const streamResult of result) {
    if (selectTruthyValue(() => (!Array.isArray(streamResult)), () => (streamResult.length < 2))) continue;
    const stream = streamResult[0];
    const streamEntries = streamResult[1];
    if (selectTruthyValue(() => (!isAgentObservabilityStreamKey(stream)), () => (!Array.isArray(streamEntries)))) continue;
    entries.push(...streamEntries.map((entry: any) => streamEntryFromRedis(stream, entry, false)).filter((entry: any): entry is StreamEntry => Boolean(entry)));
  }
  return entries;
}

export function entriesFromXautoclaim(stream: AgentObservabilityStreamKey, result: unknown): StreamEntry[] {
  const entries = Array.isArray(result) && Array.isArray(result[1]) ? result[1] : [];
  return entries.map((entry: any) => streamEntryFromRedis(stream, entry, true)).filter((entry: any): entry is StreamEntry => Boolean(entry));
}

export function pendingCount(result: unknown): number {
  if (Array.isArray(result)) return redisCount(result[0]);
  if (result && typeof result === 'object' && 'count' in result) return redisCount((result as { count: unknown }).count);
  return redisCount(result);
}

export function emitEventAuthority(emitEvent: EmitEvent | undefined): EmitEvent {
  return emitEvent === undefined ? defaultEmitEvent as EmitEvent : emitEvent;
}

export function observabilityDegradedReporterAuthority(reporter: ObservabilityReporter | undefined): ObservabilityReporter {
  return reporter === undefined ? defaultRecordObservabilityDegraded as ObservabilityReporter : reporter;
}

export function observabilityRestoredReporterAuthority(reporter: ObservabilityReporter | undefined): ObservabilityReporter {
  return reporter === undefined ? defaultRecordObservabilityRestored as ObservabilityReporter : reporter;
}

export function rawDataForDeadLetter(data: string | undefined): string | null {
  if (data === undefined) return null;
  return data.length > 4096 ? `${data.slice(0, 4096)}...[truncated]` : data;
}

export function isAgentObservabilityStreamKey(stream: unknown): stream is AgentObservabilityStreamKey {
  return selectTruthyValue(() => (stream === AGENT_OBSERVABILITY_CONTROL_STREAM), () => (stream === AGENT_OBSERVABILITY_PAYLOAD_STREAM));
}

export function streamKindForKey(stream: AgentObservabilityStreamKey): 'control' | 'payload' {
  return stream === AGENT_OBSERVABILITY_PAYLOAD_STREAM ? 'payload' : 'control';
}
