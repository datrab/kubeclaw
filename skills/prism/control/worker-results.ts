import { checkWorkerAttemptMessageBinding, validatePipelineWorkerCoreContract,
  type WorkerAttemptEnvelopeV1, type WorkerAttemptResultV1 } from '@kubeclaw/pipeline-worker-core-contract';
import { validateEngineResult } from '@kubeclaw/prism-contracts-v1';
import { engineResultSchema } from '@kubeclaw/prism-contracts-v1/digest';
import type { EngineOperation } from '../engine/index.ts';
import { prismRequestDigest } from '../engine/worker-envelope.ts';

/** Validate before any evidence import or database acknowledgement. */
export function acceptWorkerResult(attempt: WorkerAttemptEnvelopeV1, raw: unknown): WorkerAttemptResultV1 {
  validatePipelineWorkerCoreContract('workerAttemptEnvelope', attempt);
  validatePipelineWorkerCoreContract('workerAttemptResult', raw);
  const result = raw as WorkerAttemptResultV1;
  const binding = checkWorkerAttemptMessageBinding(attempt, result);
  if (!binding.ok) throw new Error(`PRISM_WORKER_RESULT_BINDING_INVALID: ${binding.errors.join('; ')}`);
  if (result.state !== 'completed') throw new Error(result.error?.message ?? 'Prism worker attempt failed', { cause: result.error });
  const name = attempt.operation.values.operation as EngineOperation;
  const expected = engineResultSchema(name);
  const specialist = result.specialistResult;
  if (!specialist || specialist.schemaId !== expected.schemaId || specialist.schemaDigest !== expected.schemaDigest) {
    throw new Error('PRISM_WORKER_RESULT_SCHEMA_MISMATCH');
  }
  validateEngineResult(name, specialist.values);
  return result;
}
export interface StoredWorkerResult { attempt: WorkerAttemptEnvelopeV1; workerResult: WorkerAttemptResultV1 }
export function acceptedCachedResult(raw: unknown, expectedRequestDigest: string, expectedExecutionId: string): StoredWorkerResult {
  if (!raw || typeof raw !== 'object' || !('attempt' in raw) || !('workerResult' in raw)) {
    throw new Error('PRISM_WORKER_CACHE_UNBOUND: legacy result requires explicit reconciliation; automatic rerun is not allowed');
  }
  const stored = raw as StoredWorkerResult;
  validatePipelineWorkerCoreContract('workerAttemptEnvelope', stored.attempt);
  if (stored.attempt.executionId !== expectedExecutionId) throw new Error('PRISM_WORKER_CACHE_EXECUTION_MISMATCH');
  const input = stored.attempt.inputs.find((item) => item.name === stored.attempt.operation.values.inputName);
  if (!input || input.kind !== 'artifact' || prismRequestDigest(stored.attempt.operation, input.artifact.contentDigest) !== expectedRequestDigest) {
    throw new Error('PRISM_WORKER_CACHE_REQUEST_MISMATCH');
  }
  return { attempt: stored.attempt, workerResult: acceptWorkerResult(stored.attempt, stored.workerResult) };
}
