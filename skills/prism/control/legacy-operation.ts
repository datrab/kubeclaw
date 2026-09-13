import { inTransaction, type ContentAddressedArtifactStore, type Database, type Queryable } from '../storage/index.ts';
import { prismAttempt, prismRequestDigest } from '../engine/worker-envelope.ts';
import type { EngineOperation } from '../engine/index.ts';
import type { loadControlServerConfig } from '../server/control-config.ts';
import { WorkerArtifactClient } from '../server/worker-artifacts.ts';
import { acceptedCachedResult } from './worker-results.ts';
import { hydrateWorkerResult } from './worker-evidence.ts';
import { requestWorkerResult } from './worker-operation-transport.ts';

type Config = ReturnType<typeof loadControlServerConfig>;

/** Explicit legacy migration path; it never accepts a failed native attempt as a reason to rerun V1. */
export async function runLegacyPrismOperation(database: Database, artifacts: ContentAddressedArtifactStore,
  config: Config, operation: EngineOperation, input: Record<string, unknown>, key: string): Promise<Record<string, unknown>> {
  const stored = await artifacts.put(Buffer.from(JSON.stringify(input)));
  const attempt = prismAttempt(operation, { artifactId: stored.artifactId, type: 'prism-engine-input', mediaType: 'application/json',
    contentDigest: stored.digest, sizeBytes: stored.sizeBytes,
    storageUrl: new URL(`/v1/internal/artifacts/${stored.digest}`, config.controlInternalUrl).toString() }, key);
  const requestDigest = prismRequestDigest(attempt.operation, stored.digest);
  return inTransaction(database, connection => runLocked(connection, config, attempt, key, requestDigest));
}

async function runLocked(connection: Queryable, config: Config, attempt: ReturnType<typeof prismAttempt>,
  key: string, requestDigest: string): Promise<Record<string, unknown>> {
  await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
  const previous = (await connection.query<{ request_digest: string | null; attempt_id: string; result: unknown }>(
    'SELECT request_digest,attempt_id,result FROM prism.engine_operation WHERE idempotency_key=$1', [key])).rows[0];
  if (previous?.request_digest && previous.request_digest !== requestDigest) throw new Error('idempotency key was used for a different Prism request');
  const artifacts = new WorkerArtifactClient(config.controlInternalUrl, config.workerSecret, config.spiffeEnabled);
  if (previous?.result) {
    const stored = acceptedCachedResult(previous.result, requestDigest, previous.attempt_id);
    return (await hydrateWorkerResult(stored.attempt, stored.workerResult, artifacts)).values;
  }
  // Migration 017 refuses this identity replacement for any durable native row.
  await connection.query('INSERT INTO prism.engine_operation(idempotency_key,attempt_id,operation,request_digest) VALUES($1,$2,$3,$4) ON CONFLICT(idempotency_key) DO UPDATE SET attempt_id=excluded.attempt_id,request_digest=COALESCE(prism.engine_operation.request_digest,excluded.request_digest)',
    [key, attempt.executionId, String(attempt.operation.values.operation), requestDigest]);
  const accepted = await hydrateWorkerResult(attempt, await requestWorkerResult(config, attempt), artifacts);
  await connection.query('UPDATE prism.engine_operation SET result=$2::jsonb,completed_at=now() WHERE idempotency_key=$1',
    [key, JSON.stringify({ attempt, workerResult: accepted.result })]);
  return accepted.values;
}
