import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson, type AdapterActivationContext, type AdapterInstance } from '@kubeclaw/plugin-sdk';

interface StateRecord {
  readonly schemaVersion: 'plugin-state-record.v2';
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly appendedAt: string;
  readonly value: Record<string, unknown>;
}

function safeNamespace(root: string, namespace: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/.test(namespace)) {
    throw new Error(`STATE_NAMESPACE_INVALID:${namespace}`);
  }
  return path.join(root, `${namespace.replaceAll('/', '__')}.jsonl`);
}

function records(file: string, maxEntryBytes: number): StateRecord[] {
  if (!fs.existsSync(file)) return [];
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('STATE_JOURNAL_SYMLINK_DENIED');
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
    if (Buffer.byteLength(line, 'utf8') > maxEntryBytes) throw new Error('STATE_RECORD_SIZE_EXCEEDED');
    const parsed = JSON.parse(line) as StateRecord;
    if (
      parsed.schemaVersion !== 'plugin-state-record.v2'
      || !Number.isSafeInteger(parsed.sequence)
      || typeof parsed.idempotencyKey !== 'string'
      || typeof parsed.appendedAt !== 'string'
      || !parsed.value
      || typeof parsed.value !== 'object'
      || Array.isArray(parsed.value)
    ) throw new Error('STATE_RECORD_INVALID');
    return parsed;
  });
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const configured = context.config.root;
  if (typeof configured !== 'string') throw new Error('state root is required');
  const root = path.resolve(configured);
  const maxEntryBytes = Number(context.config.maxEntryBytes ?? 1_048_576);
  if (!Number.isSafeInteger(maxEntryBytes) || maxEntryBytes < 1) throw new Error('maxEntryBytes is invalid');
  return {
    async ready() { fs.mkdirSync(root, { recursive: true }); },
    async invoke({ request, signal, confidential, fence }) {
      if (!confidential) fence.assertCurrent();
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      const namespace = request.resource.canonicalId;
      const file = safeNamespace(root, namespace);
      if (request.operation === 'read') {
        if (request.capability !== 'state.read') throw new Error('STATE_OPERATION_UNSUPPORTED');
        return { entries: records(file, maxEntryBytes) };
      }
      if (request.capability !== 'state.append' || request.operation !== 'append') {
        throw new Error('STATE_OPERATION_UNSUPPORTED');
      }
      if (!request.payload || typeof request.payload !== 'object' || Array.isArray(request.payload)) {
        throw new Error('STATE_VALUE_INVALID');
      }
      const existing = records(file, maxEntryBytes);
      const duplicate = existing.find((entry) => entry.idempotencyKey === request.idempotencyKey);
      if (duplicate) {
        if (canonicalJson(duplicate.value) !== canonicalJson(request.payload)) {
          throw new Error('STATE_IDEMPOTENCY_CONFLICT');
        }
        return { appended: false, entry: duplicate };
      }
      const entry: StateRecord = {
        schemaVersion: 'plugin-state-record.v2',
        sequence: existing.length + 1,
        idempotencyKey: request.idempotencyKey,
        appendedAt: new Date().toISOString(),
        value: request.payload,
      };
      const serialized = JSON.stringify(entry);
      if (Buffer.byteLength(serialized, 'utf8') > maxEntryBytes) throw new Error('STATE_ENTRY_SIZE_EXCEEDED');
      const descriptor = fs.openSync(file, 'a', 0o600);
      try {
        fs.writeSync(descriptor, `${serialized}\n`);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      return { appended: true, entry };
    },
    async shutdown() {},
  };
}
