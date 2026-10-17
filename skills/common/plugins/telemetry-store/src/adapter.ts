import type { AdapterActivationContext, AdapterInstance } from '@kubeclaw/plugin-sdk';
import { FileDurableRecordStore } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { telemetryProjection } from './projection.ts';

export function activate(context: AdapterActivationContext): AdapterInstance {
  const root = context.config.root;
  if (typeof root !== 'string' || root.length === 0) throw new Error('root is required');
  const maxRecordBytes = Number(context.config.maxRecordBytes);
  const maximumRecords = Number(context.config.maximumRecords);
  const maximumStoreBytes = Number(context.config.maximumStoreBytes);
  if (typeof context.config.maxRecordBytes !== 'number' || !Number.isSafeInteger(maxRecordBytes) || maxRecordBytes < 1) throw new Error('maxRecordBytes is invalid');
  if (typeof context.config.maximumRecords !== 'number' || !Number.isSafeInteger(maximumRecords) || maximumRecords < 1) throw new Error('maximumRecords is invalid');
  if (typeof context.config.maximumStoreBytes !== 'number' || !Number.isSafeInteger(maximumStoreBytes) || maximumStoreBytes < 1) throw new Error('maximumStoreBytes is invalid');
  const maxJsonDepth = context.config.maxJsonDepth;
  const maxJsonNodes = context.config.maxJsonNodes;
  if (typeof maxJsonDepth !== 'number' || !Number.isSafeInteger(maxJsonDepth) || maxJsonDepth < 1) throw new Error('maxJsonDepth is invalid');
  if (typeof maxJsonNodes !== 'number' || !Number.isSafeInteger(maxJsonNodes) || maxJsonNodes < 1) throw new Error('maxJsonNodes is invalid');
  const jsonLimits = Object.freeze({ maxJsonDepth, maxJsonNodes });
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
          telemetryProjection(request.payload, maxRecordBytes, jsonLimits),
          request.attempt.runId,
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
