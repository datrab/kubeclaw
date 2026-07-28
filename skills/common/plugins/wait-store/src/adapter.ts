import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AdapterActivationContext, AdapterInstance, WaitRequest } from '@kubeclaw/plugin-sdk';

interface WaitRecord {
  readonly schemaVersion: 'wait-record.v2';
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly wait: WaitRequest;
}

const NAMESPACED_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const ISSUER_TYPES = new Set(['orchestrator', 'operator', 'adapter']);
const RFC3339_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)(Z|([+-])(\d{2}):(\d{2}))$/i;
const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

function isJson(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => isJson(entry, depth + 1));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>)
    .every(([key, entry]) => key.length > 0 && isJson(entry, depth + 1));
}

function isDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = RFC3339_DATE_TIME.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetSign = match[8] === '-' ? -1 : 1;
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maximumDay = month === 2 && leapYear ? 29 : (DAYS_IN_MONTH[month] ?? 0);
  if (
    month < 1 || month > 12
    || day < 1 || day > maximumDay
    || offsetHour > 23 || offsetMinute > 59
  ) return false;
  if (hour <= 23 && minute <= 59 && second < 60) return true;
  const utcMinute = minute - offsetMinute * offsetSign;
  const utcHour = hour - offsetHour * offsetSign - (utcMinute < 0 ? 1 : 0);
  return (utcHour === 23 || utcHour === -1)
    && (utcMinute === 59 || utcMinute === -1)
    && second < 61;
}

function parseWait(value: unknown, requireIdentity: boolean): WaitRequest | Omit<WaitRequest, 'schemaVersion' | 'waitId'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('WAIT_REQUEST_INVALID');
  const payload = value as Record<string, unknown>;
  const required = requireIdentity
    ? ['schemaVersion', 'waitId', 'kind', 'signalType', 'authorizedIssuer', 'expiresAt']
    : ['kind', 'signalType', 'authorizedIssuer', 'expiresAt'];
  if (!exactKeys(payload, required, ['request'])) throw new Error('WAIT_REQUEST_INVALID');
  if (requireIdentity && (
    payload.schemaVersion !== 'wait-request.v2'
    || typeof payload.waitId !== 'string'
    || !OPAQUE_ID.test(payload.waitId)
  )) throw new Error('WAIT_REQUEST_INVALID');
  if (payload.kind !== 'signal' && payload.kind !== 'orchestrator') throw new Error('WAIT_REQUEST_INVALID');
  if (
    typeof payload.signalType !== 'string'
    || payload.signalType.length > 160
    || !NAMESPACED_ID.test(payload.signalType)
  ) throw new Error('WAIT_REQUEST_INVALID');
  if (!payload.authorizedIssuer || typeof payload.authorizedIssuer !== 'object' || Array.isArray(payload.authorizedIssuer)) {
    throw new Error('WAIT_REQUEST_INVALID');
  }
  const issuer = payload.authorizedIssuer as Record<string, unknown>;
  if (
    !exactKeys(issuer, ['type', 'id'])
    || typeof issuer.type !== 'string'
    || !ISSUER_TYPES.has(issuer.type)
    || typeof issuer.id !== 'string'
    || !OPAQUE_ID.test(issuer.id)
  ) throw new Error('WAIT_REQUEST_INVALID');
  if (payload.expiresAt !== null && !isDateTime(payload.expiresAt)) throw new Error('WAIT_EXPIRY_INVALID');
  if (Object.hasOwn(payload, 'request') && (
    !payload.request
    || typeof payload.request !== 'object'
    || Array.isArray(payload.request)
    || !isJson(payload.request)
  )) throw new Error('WAIT_REQUEST_INVALID');
  const parsed = {
    kind: payload.kind,
    signalType: payload.signalType,
    authorizedIssuer: { type: issuer.type, id: issuer.id },
    expiresAt: payload.expiresAt,
    ...(Object.hasOwn(payload, 'request') ? { request: payload.request as Record<string, unknown> } : {}),
  } as Omit<WaitRequest, 'schemaVersion' | 'waitId'>;
  return requireIdentity
    ? { schemaVersion: 'wait-request.v2', waitId: payload.waitId as string, ...parsed }
    : parsed;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function readRecords(file: string, maxEntryBytes: number): WaitRecord[] {
  if (!fs.existsSync(file)) return [];
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('WAIT_JOURNAL_SYMLINK_DENIED');
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
    if (Buffer.byteLength(line, 'utf8') > maxEntryBytes) throw new Error('WAIT_RECORD_SIZE_EXCEEDED');
    const record = JSON.parse(line) as WaitRecord;
    if (
      !record
      || typeof record !== 'object'
      || Array.isArray(record)
      || !exactKeys(record as unknown as Record<string, unknown>, [
        'schemaVersion', 'idempotencyKey', 'createdAt', 'wait',
      ])
      || record.schemaVersion !== 'wait-record.v2'
      || typeof record.idempotencyKey !== 'string'
      || !OPAQUE_ID.test(record.idempotencyKey)
      || !isDateTime(record.createdAt)
    ) throw new Error('WAIT_RECORD_INVALID');
    try {
      return { ...record, wait: parseWait(record.wait, true) as WaitRequest };
    } catch {
      throw new Error('WAIT_RECORD_INVALID');
    }
  });
}

function parsePayload(payload: Record<string, unknown>): Omit<WaitRequest, 'schemaVersion' | 'waitId'> {
  return parseWait(payload, false) as Omit<WaitRequest, 'schemaVersion' | 'waitId'>;
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const journalPath = context.config.journalPath;
  if (typeof journalPath !== 'string') throw new Error('journalPath is required');
  const file = path.resolve(journalPath);
  const maxEntryBytes = Number(context.config.maxEntryBytes ?? 1_048_576);
  if (!Number.isSafeInteger(maxEntryBytes) || maxEntryBytes < 1) throw new Error('maxEntryBytes is invalid');
  return {
    async ready() {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('WAIT_JOURNAL_SYMLINK_DENIED');
    },
    async invoke({ request, signal }) {
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      if (request.capability !== 'signal.wait') throw new Error('WAIT_OPERATION_UNSUPPORTED');
      const existing = readRecords(file, maxEntryBytes);
      if (request.operation === 'read') {
        return { waits: existing.map((record) => record.wait) };
      }
      if (request.operation !== 'create') throw new Error('WAIT_OPERATION_UNSUPPORTED');
      const parsed = parsePayload(request.payload);
      const duplicate = existing.find((record) => record.idempotencyKey === request.idempotencyKey);
      if (duplicate) {
        const expected = { ...parsed, waitId: duplicate.wait.waitId, schemaVersion: 'wait-request.v2' };
        if (canonical(duplicate.wait) !== canonical(expected)) throw new Error('WAIT_IDEMPOTENCY_CONFLICT');
        return { created: false, wait: duplicate.wait };
      }
      const wait: WaitRequest = {
        schemaVersion: 'wait-request.v2',
        waitId: `wait:${crypto.randomUUID()}`,
        ...parsed,
      };
      const record: WaitRecord = {
        schemaVersion: 'wait-record.v2',
        idempotencyKey: request.idempotencyKey,
        createdAt: new Date().toISOString(),
        wait,
      };
      const serialized = JSON.stringify(record);
      if (Buffer.byteLength(serialized, 'utf8') > maxEntryBytes) throw new Error('WAIT_ENTRY_SIZE_EXCEEDED');
      const descriptor = fs.openSync(file, 'a', 0o600);
      try {
        fs.writeSync(descriptor, `${serialized}\n`);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      return { created: true, wait };
    },
    async shutdown() {},
  };
}
