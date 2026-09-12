import { checkWorkerAttemptMessageBinding, validatePipelineWorkerCoreContract,
  checkWorkerNativeResultBinding, validateWorkerResourceContractV3,
  type WorkerAttemptEnvelopeV1, type WorkerAttemptResultV1,
  type WorkerAttemptEnvelopeV3, type WorkerAttemptResultV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { validateEngineResult } from '@kubeclaw/prism-contracts-v1';
import { engineResultSchema } from '@kubeclaw/prism-contracts-v1/digest';
import type { EngineOperation } from '../engine/index.ts';
import { prismRequestDigest } from '../engine/worker-envelope.ts';

/** Validate before any evidence import or database acknowledgement. */
export type PrismWorkerAttempt = WorkerAttemptEnvelopeV1 | WorkerAttemptEnvelopeV3;
export type PrismWorkerResult = WorkerAttemptResultV1 | WorkerAttemptResultV3;

function validateAttempt(attempt: PrismWorkerAttempt): void {
  if (attempt.schemaVersion === 'worker-attempt-envelope.v3') validateWorkerResourceContractV3('workerAttemptEnvelope', attempt);
  else validatePipelineWorkerCoreContract('workerAttemptEnvelope', attempt);
}

function boundResult(attempt: PrismWorkerAttempt, raw: unknown): PrismWorkerResult {
  validateAttempt(attempt);
  const native = attempt.schemaVersion === 'worker-attempt-envelope.v3';
  if (native) validateWorkerResourceContractV3('workerAttemptResult', raw);
  else validatePipelineWorkerCoreContract('workerAttemptResult', raw);
  const binding = native ? checkWorkerNativeResultBinding(attempt, raw as WorkerAttemptResultV3)
    : checkWorkerAttemptMessageBinding(attempt, raw as WorkerAttemptResultV1);
  if (!binding.ok) throw new Error(`PRISM_WORKER_RESULT_BINDING_INVALID: ${binding.errors.join('; ')}`);
  return raw as PrismWorkerResult;
}

export function acceptWorkerResult(attempt: WorkerAttemptEnvelopeV1, raw: unknown): WorkerAttemptResultV1;
export function acceptWorkerResult(attempt: WorkerAttemptEnvelopeV3, raw: unknown): WorkerAttemptResultV3;
export function acceptWorkerResult(attempt: PrismWorkerAttempt, raw: unknown): PrismWorkerResult;
export function acceptWorkerResult(attempt: PrismWorkerAttempt, raw: unknown): PrismWorkerResult {
  const result = boundResult(attempt, raw);
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
export interface StoredWorkerResult { attempt: PrismWorkerAttempt; workerResult: PrismWorkerResult }
export function acceptedCachedResult(raw: unknown, expectedRequestDigest: string, expectedExecutionId: string): StoredWorkerResult {
  if (!raw || typeof raw !== 'object' || !('attempt' in raw) || !('workerResult' in raw)) {
    throw new Error('PRISM_WORKER_CACHE_UNBOUND: legacy result requires explicit reconciliation; automatic rerun is not allowed');
  }
  const stored = raw as StoredWorkerResult;
  validateAttempt(stored.attempt);
  if (stored.attempt.executionId !== expectedExecutionId) throw new Error('PRISM_WORKER_CACHE_EXECUTION_MISMATCH');
  const input = stored.attempt.inputs.find((item) => item.name === stored.attempt.operation.values.inputName);
  if (!input || input.kind !== 'artifact' || prismRequestDigest(stored.attempt.operation, input.artifact.contentDigest) !== expectedRequestDigest) {
    throw new Error('PRISM_WORKER_CACHE_REQUEST_MISMATCH');
  }
  return { attempt: stored.attempt, workerResult: acceptWorkerResult(stored.attempt, stored.workerResult) };
}
