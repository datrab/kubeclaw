import { randomUUID } from 'node:crypto';
import {
  validateWorkerResourceContractV3, checkWorkerNativeResultBinding, initialWorkerNativeResourceAccounting,
  workerAttemptResultDigest, sha256Digest, type WorkerAttemptEnvelopeV3, type WorkerAttemptResultV3,
} from '@kubeclaw/pipeline-worker-core-contract';
import { runNativeWorkerProcess, type NativeWorkerProcessOptions, type NativeWorkerProcessResult } from './native-worker-process.ts';

export interface NativeWorkerAttemptExecutorOptions {
  readonly envelope: WorkerAttemptEnvelopeV3;
  readonly process: Omit<NativeWorkerProcessOptions, 'identity' | 'input'>;
}

/** The child's receipt is provisional; only the quiescent tree's final counters seal this receipt. */
export async function executeNativeWorkerAttempt(options: NativeWorkerAttemptExecutorOptions): Promise<WorkerAttemptResultV3> {
  const envelope = structuredClone(options.envelope);
  validateWorkerResourceContractV3('workerAttemptEnvelope', envelope);
  const started = new Date();
  const limits = options.process.limits;
  const accepted = { cpuTimeMs: limits.cpuTimeMs, maximumMemoryBytes: limits.memoryBytes, maximumTasks: limits.tasks };
  for (const [metric, maximum] of Object.entries(accepted)) {
    const budget = envelope.resourceBudgets[metric as keyof typeof accepted];
    if (budget.state !== 'requested' || budget.limit !== maximum) throw new Error('WORKER_NATIVE_ACCEPTED_LIMIT_MISMATCH');
  }
  const claimRemaining = Date.parse(envelope.claim.expiresAt) - started.getTime();
  if (started.getTime() < Date.parse(envelope.claim.claimedAt) || claimRemaining <= 0
    || started.getTime() >= Date.parse(envelope.queueDeadline)) throw new Error('WORKER_NATIVE_CLAIM_NOT_ACTIVE');
  const process = await runNativeWorkerProcess({ ...options.process,
    limits: { ...limits, timeoutMs: Math.min(limits.timeoutMs, claimRemaining) },
    identity: { workerId: envelope.claim.workerId, attemptId: envelope.attemptId, claimId: envelope.claim.claimId,
      generation: envelope.claim.generation, profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest },
    input: Buffer.from(JSON.stringify(envelope)),
  });
  const completed = new Date();
  const candidate = provisionalResult(envelope, process);
  const result = candidate.result ?? failedHostResult(envelope, started, completed, process.fault ?? candidate.fault!);
  const native = process.resources;
  if (native.populated) throw new Error('WORKER_NATIVE_RESULT_SCOPE_POPULATED');
  result.resources.cpuTimeMs = Math.ceil(native.cpuTimeMicroseconds / 1000);
  result.resources.maximumMemoryBytes = native.maximumMemoryBytes;
  result.resources.maximumTasks = native.maximumTasks;
  result.resourceAccounting.observations = {
    cpuTimeMs: { status: 'observed', value: result.resources.cpuTimeMs },
    maximumMemoryBytes: { status: 'observed', value: native.maximumMemoryBytes },
    maximumTasks: { status: 'observed', value: native.maximumTasks },
  };
  const fault = process.fault ?? (completed.getTime() >= Date.parse(envelope.claim.expiresAt) ? 'WORKER_CLAIM_EXPIRED' : null);
  if (fault && result.state === 'completed') {
    result.state = 'errored'; result.error = { code: fault, message: fault }; result.summary = fault;
    result.specialistResult = null; result.resources.resultBytes = 0;
  }
  result.completedAt = completed.toISOString();
  result.durationMs = Math.max(0, completed.getTime() - Date.parse(result.startedAt));
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

function failedHostResult(envelope: WorkerAttemptEnvelopeV3, started: Date, completed: Date, code: string): WorkerAttemptResultV3 {
  return { schemaVersion: 'worker-attempt-result.v3', protocolVersion: envelope.protocolVersion, attemptId: envelope.attemptId,
    claimId: envelope.claim.claimId, claimGeneration: envelope.claim.generation, workerId: envelope.claim.workerId,
    profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest,
    state: 'errored', startedAt: started.toISOString(), completedAt: completed.toISOString(), durationMs: completed.getTime() - started.getTime(),
    summary: code, specialistResult: null, error: { code, message: code }, evidence: [],
    resources: { logBytes: 0, resultBytes: 0, evidenceBytes: 0 }, cleanup: { state: 'not_required', summary: null },
    exitCode: null, signal: null, resourceAccounting: initialWorkerNativeResourceAccounting(envelope),
    resultDigest: '', receipt: { receiptId: '', receiptDigest: '' },
  };
}
