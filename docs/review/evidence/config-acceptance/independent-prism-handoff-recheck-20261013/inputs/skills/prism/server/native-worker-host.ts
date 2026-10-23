import { WorkerAttemptExecutor } from '@kubeclaw/worker-core';
import { validateWorkerResourceContractV3, type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { PrismEngine, DeterministicDesignProvider } from '../engine/index.ts';
import { WorkerArtifactClient } from './worker-artifacts.ts';
import { nativeOperationFor } from './worker-operation.ts';
import { nativePrismHostConfig } from '../config/native-worker.ts';

const cancellation = new AbortController();
const cancel = () => cancellation.abort(new Error('WORKER_ATTEMPT_CANCELLED'));
process.once('SIGTERM', cancel); process.once('SIGINT', cancel);

async function main(): Promise<void> {
const config = nativePrismHostConfig();
const chunks: Buffer[] = [];
let bytes = 0;
for await (const chunk of process.stdin) {
  bytes += chunk.length;
  if (bytes > config.maximumInputBytes) throw new Error('PRISM_NATIVE_INPUT_LIMIT');
  chunks.push(Buffer.from(chunk));
}
const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')) as WorkerAttemptEnvelopeV3;
validateWorkerResourceContractV3('workerAttemptEnvelope', envelope);
const artifacts = new WorkerArtifactClient(config.controlInternalUrl, config.workerSecret, config.spiffeEnabled);
const engine = new PrismEngine(new DeterministicDesignProvider());
const result = await new WorkerAttemptExecutor({ envelope, signal: cancellation.signal,
  operation: nativeOperationFor(envelope, engine, artifacts, config.scope), receiptNamespace: 'prism-native-provisional',
  storeFullLog(attemptId, content, { signal }) {
    if (attemptId !== envelope.attemptId) throw new Error('Prism log attempt identity mismatch');
    return artifacts.upload('prism-full-log', 'log', 'text/plain', Buffer.from(content), signal);
  },
}).execute();
// Closing stdout is not the completion boundary: the supervisor drains the tree and reseals.
process.stdout.write(JSON.stringify(result));
}
try { await main(); }
finally { process.removeListener('SIGTERM', cancel); process.removeListener('SIGINT', cancel); }
