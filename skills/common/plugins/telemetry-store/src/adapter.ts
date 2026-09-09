import type { AdapterActivationContext, AdapterInstance } from '@kubeclaw/plugin-sdk';
import { FileDurableRecordStore } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { telemetryProjection } from './projection.ts';

export function activate(context: AdapterActivationContext): AdapterInstance {
  const root = context.config.root;
  if (typeof root !== 'string' || root.length === 0) throw new Error('root is required');
  const maxRecordBytes = Number(context.config.maxRecordBytes ?? 1_048_576);
  const maximumRecords = Number(context.config.maximumRecords ?? 100_000);
  const maximumStoreBytes = Number(context.config.maximumStoreBytes ?? 256 * 1024 * 1024);
  if (!Number.isSafeInteger(maxRecordBytes) || maxRecordBytes < 1) throw new Error('maxRecordBytes is invalid');
  if (!Number.isSafeInteger(maximumRecords) || maximumRecords < 1) throw new Error('maximumRecords is invalid');
  if (!Number.isSafeInteger(maximumStoreBytes) || maximumStoreBytes < 1) throw new Error('maximumStoreBytes is invalid');
  const store = new FileDurableRecordStore(root, {
    maximumRecords,
    maximumBytes: maximumStoreBytes,
    maximumRecordBytes: maxRecordBytes,
  });
  const stream = 'telemetry/plugin-events';
  return {
    async ready() { await store.read<Record<string, unknown>>(stream); },
    async invoke({ request, signal, confidential, fence }) {
      if (!confidential) fence.assertCurrent();
      if (request.capability !== 'telemetry.emit' || request.operation !== 'append') throw new Error('TELEMETRY_OPERATION_UNSUPPORTED');
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      try {
        const committed = await store.append(
          stream,
          request.idempotencyKey,
          telemetryProjection(request.payload, maxRecordBytes),
        );
        return { accepted: committed.appended, sequence: committed.record.sequence };
      } catch (error) {
        if (error instanceof Error && error.message === 'DURABLE_RECORD_SIZE_EXCEEDED') {
          throw new Error('TELEMETRY_RECORD_SIZE_EXCEEDED');
        }
        throw error;
      }
    },
    async shutdown() {},
  };
}
