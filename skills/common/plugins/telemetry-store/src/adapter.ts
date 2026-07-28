import fs from 'node:fs';
import path from 'node:path';
import type { AdapterActivationContext, AdapterInstance } from '@kubeclaw/plugin-sdk';

interface TelemetryRecord {
  readonly schemaVersion: 'telemetry-record.v2';
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly recordedAt: string;
  readonly payload: Record<string, unknown>;
}

const sensitive = /(?:authorization|cookie|password|secret|token)/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitive.test(key) ? '[REDACTED]' : sanitize(item),
    ]));
  }
  return value;
}

function readRecords(file: string, maxRecordBytes: number): TelemetryRecord[] {
  if (!fs.existsSync(file)) return [];
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('TELEMETRY_JOURNAL_SYMLINK_DENIED');
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
    if (Buffer.byteLength(line, 'utf8') > maxRecordBytes) throw new Error('TELEMETRY_RECORD_SIZE_EXCEEDED');
    const parsed = JSON.parse(line) as TelemetryRecord;
    if (
      parsed.schemaVersion !== 'telemetry-record.v2'
      || !Number.isSafeInteger(parsed.sequence)
      || typeof parsed.idempotencyKey !== 'string'
      || typeof parsed.recordedAt !== 'string'
      || !parsed.payload
      || typeof parsed.payload !== 'object'
      || Array.isArray(parsed.payload)
    ) throw new Error('TELEMETRY_RECORD_INVALID');
    return parsed;
  });
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const configured = context.config.journalPath;
  if (typeof configured !== 'string') throw new Error('journalPath is required');
  const file = path.resolve(configured);
  const maxRecordBytes = Number(context.config.maxRecordBytes ?? 1_048_576);
  if (!Number.isSafeInteger(maxRecordBytes) || maxRecordBytes < 1) throw new Error('maxRecordBytes is invalid');
  return {
    async ready() { fs.mkdirSync(path.dirname(file), { recursive: true }); },
    async invoke({ request, signal }) {
      if (request.capability !== 'telemetry.emit' || request.operation !== 'append') throw new Error('TELEMETRY_OPERATION_UNSUPPORTED');
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      const existing = readRecords(file, maxRecordBytes);
      const duplicate = existing.find((record) => record.idempotencyKey === request.idempotencyKey);
      if (duplicate) return { accepted: false, sequence: duplicate.sequence };
      const record: TelemetryRecord = {
        schemaVersion: 'telemetry-record.v2',
        sequence: existing.length + 1,
        idempotencyKey: request.idempotencyKey,
        recordedAt: new Date().toISOString(),
        payload: sanitize(request.payload) as Record<string, unknown>,
      };
      const serialized = JSON.stringify(record);
      if (Buffer.byteLength(serialized, 'utf8') > maxRecordBytes) throw new Error('TELEMETRY_RECORD_SIZE_EXCEEDED');
      const descriptor = fs.openSync(file, 'a', 0o600);
      try {
        fs.writeSync(descriptor, `${serialized}\n`);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      return { accepted: true, sequence: record.sequence };
    },
    async shutdown() {},
  };
}
