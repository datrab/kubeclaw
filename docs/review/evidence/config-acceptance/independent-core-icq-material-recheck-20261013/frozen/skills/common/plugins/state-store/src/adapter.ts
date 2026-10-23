import { canonicalJson, type AdapterActivationContext, type AdapterInstance } from '@kubeclaw/plugin-sdk';
import { FileDurableRecordStore } from '@kubeclaw/plugin-foundation/observability/durable-records';

interface StateRecord {
  readonly schemaVersion: 'plugin-state-record.v2';
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly appendedAt: string;
  readonly value: Record<string, unknown>;
}
interface StoredStateValue {
  readonly schemaVersion: 'plugin-state-value.v1';
  readonly value: Record<string, unknown>;
}

const DEFAULT_MAXIMUM_RECORDS = 100_000;
const DEFAULT_MAXIMUM_STORE_BYTES = 256 * 1024 * 1024;

function stream(namespace: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/.test(namespace)) {
    throw new Error(`STATE_NAMESPACE_INVALID:${namespace}`);
  }
  return `state/${namespace}`;
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const configured = context.config.root;
  if (typeof configured !== 'string' || configured.length === 0) throw new Error('state root is required');
  const maxEntryBytes = Number(context.config.maxEntryBytes ?? 1_048_576);
  const maximumRecords = Number(context.config.maximumRecords ?? DEFAULT_MAXIMUM_RECORDS);
  const maximumStoreBytes = Number(context.config.maximumStoreBytes ?? DEFAULT_MAXIMUM_STORE_BYTES);
  if (!Number.isSafeInteger(maxEntryBytes) || maxEntryBytes < 1) throw new Error('maxEntryBytes is invalid');
  if (!Number.isSafeInteger(maximumRecords) || maximumRecords < 1) throw new Error('maximumRecords is invalid');
  if (!Number.isSafeInteger(maximumStoreBytes) || maximumStoreBytes < 1) throw new Error('maximumStoreBytes is invalid');
  const store = new FileDurableRecordStore(configured, {
    maximumRecords,
    maximumBytes: maximumStoreBytes,
    maximumRecordBytes: maxEntryBytes,
  });
  const stateEntry = (record: Awaited<ReturnType<typeof store.read<StoredStateValue>>>[number]): StateRecord => ({
    schemaVersion: 'plugin-state-record.v2',
    sequence: record.sequence,
    idempotencyKey: record.idempotencyKey,
    appendedAt: record.committedAt,
    value: record.payload.value,
  });
  return {
    async ready() { await store.read<StateRecord>('state/readiness'); },
    async invoke({ request, signal, confidential, fence }) {
      if (!confidential) fence.assertCurrent();
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      const namespace = stream(request.resource.canonicalId);
      if (request.operation === 'read') {
        if (request.capability !== 'state.read') throw new Error('STATE_OPERATION_UNSUPPORTED');
        return { entries: (await store.read<StoredStateValue>(namespace)).map(stateEntry) };
      }
      if (request.capability !== 'state.append' || request.operation !== 'append') {
        throw new Error('STATE_OPERATION_UNSUPPORTED');
      }
      if (!request.payload || typeof request.payload !== 'object' || Array.isArray(request.payload)) {
        throw new Error('STATE_VALUE_INVALID');
      }
      const existing = await store.read<StoredStateValue>(namespace);
      const duplicate = existing.find((record) => record.idempotencyKey === request.idempotencyKey);
      if (duplicate) {
        if (canonicalJson(duplicate.payload.value) !== canonicalJson(request.payload)) {
          throw new Error('STATE_IDEMPOTENCY_CONFLICT');
        }
        return { appended: false, entry: stateEntry(duplicate) };
      }
      const value: StoredStateValue = {
        schemaVersion: 'plugin-state-value.v1',
        value: request.payload,
      };
      let committed;
      try { committed = await store.append(namespace, request.idempotencyKey, value); } catch (error) {
        if (error instanceof Error && error.message === 'DURABLE_RECORD_SIZE_EXCEEDED') throw new Error('STATE_ENTRY_SIZE_EXCEEDED');
        if (error instanceof Error && error.message === 'DURABLE_RECORD_IDEMPOTENCY_CONFLICT') throw new Error('STATE_IDEMPOTENCY_CONFLICT');
        throw error;
      }
      return { appended: committed.appended, entry: stateEntry(committed.record) };
    },
    async shutdown() {},
  };
}
