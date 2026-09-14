import { requestWorkerResult } from './worker-operation-transport.ts';
import type { ContentAddressedArtifactStore, Database } from '../storage/index.ts';
import { prismNativeAttempt } from '../engine/worker-envelope.ts';
import type { EngineOperation } from '../engine/index.ts';
import type { loadControlServerConfig } from '../server/control-config.ts';
import { WorkerArtifactClient } from '../server/worker-artifacts.ts';
import { hydrateWorkerResult } from './worker-evidence.ts';
import { reserveNativePrismOperation, recordNativePrismResult, completeNativePrismOperation } from './native-operation-store.ts';

type Config = ReturnType<typeof loadControlServerConfig>;

export async function runNativePrismOperation(database: Database, artifacts: ContentAddressedArtifactStore,
  config: Config, operation: EngineOperation, input: Record<string, unknown>, key: string): Promise<Record<string, unknown>> {
  const stored = await artifacts.put(Buffer.from(JSON.stringify(input)));
  const proposed = prismNativeAttempt(operation, { artifactId: stored.artifactId, type: 'prism-engine-input', mediaType: 'application/json',
    contentDigest: stored.digest, sizeBytes: stored.sizeBytes,
    storageUrl: new URL(`/v1/internal/artifacts/${stored.digest}`, config.controlInternalUrl).toString() }, key);
  const reserved = await reserveNativePrismOperation(database, key, proposed);
  const client = new WorkerArtifactClient(config.controlInternalUrl, config.workerSecret, config.spiffeEnabled);
  if (reserved.result) {
    const hydrated = await hydrateWorkerResult(reserved.result.attempt, reserved.result.workerResult, client);
    await completeNativePrismOperation(database, key, reserved.result.attempt.executionId);
    return hydrated.values;
  }
  const received = await requestWorkerResult(config, reserved.attempt);
  const result = await recordNativePrismResult(database, key, reserved.attempt, received);
  const hydrated = await hydrateWorkerResult(reserved.attempt, result, client);
  await completeNativePrismOperation(database, key, reserved.attempt.executionId);
  return hydrated.values;
}

