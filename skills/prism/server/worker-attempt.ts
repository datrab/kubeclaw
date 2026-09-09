import { WorkerAttemptExecutor } from '@kubeclaw/worker-core';
import type { WorkerAttemptEnvelopeV1, WorkerAttemptResultV1 } from '@kubeclaw/pipeline-worker-core-contract';
import type { PrismEngine } from '../engine/index.ts';
import { operationFor } from './worker-operation.ts';
import type { WorkerArtifactClient } from './worker-artifacts.ts';

/** One service invocation, including the mandatory durable full-log callback. */
export async function executeWorkerAttempt(envelope: WorkerAttemptEnvelopeV1, engine: PrismEngine,
  artifacts: WorkerArtifactClient): Promise<WorkerAttemptResultV1> {
  return new WorkerAttemptExecutor({
    envelope, operation: operationFor(envelope, engine, artifacts), receiptNamespace: 'prism-worker',
    storeFullLog(attemptId, content) {
      if (attemptId !== envelope.attemptId) throw new Error('Prism log attempt identity mismatch');
      return artifacts.upload('prism-full-log', 'log', 'text/plain', Buffer.from(content),
        AbortSignal.timeout(envelope.limits.cleanupTimeoutMs));
    },
  }).execute();
}
