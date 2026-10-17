import { validateWorkerResourceContractV3, type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { canonicalJson } from '@kubeclaw/worker-core';
import { inTransaction, type Database, type Queryable } from '../storage/index.ts';
import { prismRequestDigest } from '../engine/worker-envelope.ts';
import { acceptedCachedResult, boundWorkerResult, type PrismWorkerResult, type StoredWorkerResult } from './worker-results.ts';

type Row = Record<string, unknown> & { request_digest: string | null; attempt_id: string;
  operation: string; attempt: WorkerAttemptEnvelopeV3 | null; result: StoredWorkerResult | null };

function requestIdentity(attempt: WorkerAttemptEnvelopeV3): string {
  validateWorkerResourceContractV3('workerAttemptEnvelope', attempt);
  const input = attempt.inputs.find(item => item.name === attempt.operation.values.inputName);
  if (!input || input.kind !== 'artifact') throw new Error('PRISM_NATIVE_OPERATION_INPUT_REQUIRED');
  return prismRequestDigest(attempt.operation, input.artifact.contentDigest);
}

async function lock(connection: Queryable, key: string): Promise<void> {
  await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
}

async function read(connection: Queryable, key: string): Promise<Row | undefined> {
  return (await connection.query<Row>('SELECT request_digest,attempt_id,operation,attempt,result FROM prism.engine_operation WHERE idempotency_key=$1', [key])).rows[0];
}

/** A committed original envelope survives Control death before, during or after dispatch. */
export async function reserveNativePrismOperation(database: Database, key: string,
  proposed: WorkerAttemptEnvelopeV3): Promise<{ attempt: WorkerAttemptEnvelopeV3; result: StoredWorkerResult | null }> {
  const attempt = structuredClone(proposed); const requestDigest = requestIdentity(attempt);
  return inTransaction(database, async connection => {
    await lock(connection, key);
    const previous = await read(connection, key);
    if (previous) {
      if (previous.request_digest !== requestDigest) throw new Error('PRISM_OPERATION_IDEMPOTENCY_CONFLICT');
      if (previous.result && !previous.attempt) return { attempt, result: acceptedCachedResult(previous.result, requestDigest, previous.attempt_id) };
      if (!previous.attempt) throw new Error('PRISM_NATIVE_LEGACY_PENDING_RECONCILIATION_REQUIRED');
      if (requestIdentity(previous.attempt) !== requestDigest || previous.attempt.executionId !== previous.attempt_id
        || previous.operation !== String(previous.attempt.operation.values.operation)) throw new Error('PRISM_NATIVE_OPERATION_BINDING_INVALID');
      if (previous.result && canonicalJson(previous.result.attempt) !== canonicalJson(previous.attempt)) throw new Error('PRISM_NATIVE_OPERATION_BINDING_INVALID');
      return { attempt: previous.attempt, result: previous.result ? acceptedCachedResult(previous.result, requestDigest, previous.attempt_id) : null };
    }
    await connection.query('INSERT INTO prism.engine_operation(idempotency_key,attempt_id,operation,request_digest,attempt) VALUES($1,$2,$3,$4,$5::jsonb)',
      [key, attempt.executionId, String(attempt.operation.values.operation), requestDigest, JSON.stringify(attempt)]);
    return { attempt, result: null };
  });
}

/** Preserve a bound terminal receipt before hydration; failed hydration cannot cause another execution. */
export async function recordNativePrismResult(database: Database, key: string,
  attempt: WorkerAttemptEnvelopeV3, raw: unknown): Promise<PrismWorkerResult> {
  const captured = structuredClone(attempt); const result = boundWorkerResult(captured, raw);
  const stored = structuredClone({ attempt: captured, workerResult: result });
  return inTransaction(database, async connection => {
    await lock(connection, key);
    const current = await read(connection, key);
    if (!current?.attempt || canonicalJson(current.attempt) !== canonicalJson(captured)) throw new Error('PRISM_NATIVE_OPERATION_BINDING_INVALID');
    if (current.result) {
      if (canonicalJson(current.result) !== canonicalJson(stored)) throw new Error('PRISM_NATIVE_OPERATION_RESULT_CONFLICT');
      return current.result.workerResult;
    }
    await connection.query('UPDATE prism.engine_operation SET result=$2::jsonb WHERE idempotency_key=$1', [key, JSON.stringify(stored)]);
    return stored.workerResult;
  });
}

export async function completeNativePrismOperation(database: Database, key: string, executionId: string): Promise<void> {
  const changed = await database.query("UPDATE prism.engine_operation SET completed_at=COALESCE(completed_at,now()) WHERE idempotency_key=$1 AND attempt_id=$2 AND result->'workerResult'->>'state'='completed' RETURNING idempotency_key", [key, executionId]);
  if (changed.rows.length !== 1) throw new Error('PRISM_NATIVE_OPERATION_COMPLETION_CONFLICT');
}
