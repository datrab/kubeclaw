import { randomUUID } from 'node:crypto';
import { checkWorkerNativeResultBinding, initialWorkerNativeResourceAccounting, workerAttemptResultDigest, sha256Digest,
  type WorkerAttemptEnvelopeV3, type WorkerAttemptResultV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { validateNativeWorkerResourceObservation, type NativeWorkerResourceObservation } from './native-resource-observation.ts';
import type { NativeWorkerProcessResult } from './native-worker-process.ts';

export function finalizeNativeWorkerResult(envelope: WorkerAttemptEnvelopeV3, process: NativeWorkerProcessResult,
  started: Date, completed: Date): WorkerAttemptResultV3 {
  const candidate = provisionalResult(envelope, process);
  const result = candidate.result ?? failedHostResult(envelope, started, completed, process.fault ?? candidate.fault!, false);
  if (!candidate.result) { result.exitCode = process.exitCode; result.signal = process.signal; }
  applyNativeObservation(result, process.resources);
  const fault = process.fault ?? (completed.getTime() >= Date.parse(envelope.claim.expiresAt) ? 'WORKER_CLAIM_EXPIRED' : null);
  if (fault && result.state === 'completed') {
    result.state = 'errored'; result.error = { code: fault, message: fault }; result.summary = fault;
    result.specialistResult = null; result.resources.resultBytes = 0;
  }
  result.startedAt = started.toISOString();
  result.completedAt = completed.toISOString();
  result.durationMs = Math.max(0, completed.getTime() - started.getTime());
  return sealResult(envelope, result);
}

export function interruptedNativeWorkerResult(envelope: WorkerAttemptEnvelopeV3, started: Date, code: string,
  observation: NativeWorkerResourceObservation | null, notLaunched: boolean): WorkerAttemptResultV3 {
  const result = failedHostResult(envelope, started, new Date(), code, notLaunched);
  if (observation !== null) applyNativeObservation(result, observation);
  return sealResult(envelope, result);
}

function applyNativeObservation(result: WorkerAttemptResultV3, observation: NativeWorkerResourceObservation): void {
  validateNativeWorkerResourceObservation(observation);
  if (observation.populated) throw new Error('WORKER_NATIVE_RESULT_SCOPE_POPULATED');
  result.resources.cpuTimeMs = Math.ceil(observation.cpuTimeMicroseconds / 1000);
  result.resources.maximumMemoryBytes = observation.maximumMemoryBytes;
  result.resources.maximumTasks = observation.maximumTasks;
  result.resourceAccounting.observations = {
    cpuTimeMs: { status: 'observed', value: result.resources.cpuTimeMs },
    maximumMemoryBytes: { status: 'observed', value: observation.maximumMemoryBytes },
    maximumTasks: { status: 'observed', value: observation.maximumTasks },
  };
}

function sealResult(envelope: WorkerAttemptEnvelopeV3, result: WorkerAttemptResultV3): WorkerAttemptResultV3 {
  result.resultDigest = workerAttemptResultDigest(result);
  const receiptId = `receipt:${randomUUID()}`;
  result.receipt = { receiptId, receiptDigest: sha256Digest({ namespace: 'native-worker', receiptId, resultDigest: result.resultDigest }) };
  const binding = checkWorkerNativeResultBinding(envelope, result);
  if (!binding.ok) throw new Error(`WORKER_NATIVE_FINAL_RESULT_INVALID:${binding.errors.join(';')}`);
  return result;
}

function provisionalResult(envelope: WorkerAttemptEnvelopeV3, process: NativeWorkerProcessResult): { result: WorkerAttemptResultV3 | null; fault: string | null } {
  try {
    const result = JSON.parse(Buffer.from(process.stdout).toString('utf8')) as WorkerAttemptResultV3;
    return checkWorkerNativeResultBinding(envelope, result).ok ? { result, fault: null }
      : { result: null, fault: 'WORKER_NATIVE_RESULT_BINDING_INVALID' };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { result: null, fault: 'WORKER_NATIVE_RESULT_INVALID_JSON' };
  }
}

function failedHostResult(envelope: WorkerAttemptEnvelopeV3, started: Date, completed: Date, code: string,
  notLaunched: boolean): WorkerAttemptResultV3 {
  return { schemaVersion: 'worker-attempt-result.v3', protocolVersion: envelope.protocolVersion, attemptId: envelope.attemptId,
    claimId: envelope.claim.claimId, claimGeneration: envelope.claim.generation, workerId: envelope.claim.workerId,
    profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest,
    state: 'errored', startedAt: started.toISOString(), completedAt: completed.toISOString(), durationMs: Math.max(0, completed.getTime() - started.getTime()),
    summary: code, specialistResult: null, error: { code, message: code }, evidence: [],
    resources: { logBytes: 0, resultBytes: 0, evidenceBytes: 0 },
    cleanup: notLaunched ? { state: 'not_required', summary: null }
      : { state: 'failed', summary: 'Native host has no validated specialist cleanup result; external effects require reconciliation' },
    exitCode: null, signal: null, resourceAccounting: initialWorkerNativeResourceAccounting(envelope),
    resultDigest: '', receipt: { receiptId: '', receiptDigest: '' },
  };
}
