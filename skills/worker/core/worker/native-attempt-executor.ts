import {
  validateWorkerResourceContractV3, type WorkerAttemptEnvelopeV3, type WorkerAttemptResultV3,
} from '@kubeclaw/pipeline-worker-core-contract';
import { runNativeWorkerProcess, type NativeWorkerProcessOptions } from './native-worker-process.ts';
import { NativeWorkerAttemptBusy, type NativeAttemptJournal } from './native-attempt-journal.ts';
import { NativeWorkerOutputSpool } from './native-output-spool.ts';
import { journalIdentity } from './native-journal-state.ts';
import { finalizeNativeWorkerResult } from './native-result.ts';
import { recoverNativeAttempt } from './native-attempt-recovery.ts';

export interface NativeWorkerAttemptExecutorOptions {
  readonly envelope: WorkerAttemptEnvelopeV3;
  readonly journal: NativeAttemptJournal;
  readonly process: Omit<NativeWorkerProcessOptions, 'identity' | 'input' | 'outputCapture'>;
}

/** A fsynced identity precedes launch; a fsynced sealed receipt precedes delivery. */
export async function executeNativeWorkerAttempt(options: NativeWorkerAttemptExecutorOptions): Promise<WorkerAttemptResultV3> {
  validateWorkerResourceContractV3('workerAttemptEnvelope', options.envelope);
  try {
    const result = await options.journal.withAttempt(options.envelope, async context => {
      const envelope = context.envelope;
      const cached = await options.journal.readResult(envelope);
      if (cached) return cached;
      const started = new Date(context.acceptedAt);
      const recovered = await recoverNativeAttempt(options.journal, options.process.owner, envelope, started, context.newlyAccepted);
      if (recovered) return options.journal.seal(envelope, recovered);
      const limits = acceptedLimits(options, envelope, new Date());
      const spool = await NativeWorkerOutputSpool.create(context.outputRoot, limits.maximumOutputBytes);
      try {
        const process = await runNativeWorkerProcess({ ...options.process, limits, outputCapture: spool,
          identity: journalIdentity(envelope), input: Buffer.from(JSON.stringify(envelope)) });
        const completed = new Date();
        await spool.flush();
        await options.journal.recordProcess(envelope, process, completed);
        return await options.journal.seal(envelope, finalizeNativeWorkerResult(envelope, process, started, completed));
      } finally { await spool.close(); }
    });
    if (result.cleanup.state === 'failed') options.process.owner.fenceAdmission();
    return result;
  } catch (error) {
    if (error instanceof NativeWorkerAttemptBusy) throw error;
    // Persistence or ownership uncertainty cannot permit a later admission.
    options.process.owner.fenceAdmission();
    throw error;
  }
}


function acceptedLimits(options: NativeWorkerAttemptExecutorOptions, envelope: WorkerAttemptEnvelopeV3, started: Date) {
  const limits = options.process.limits;
  const accepted = { cpuTimeMs: limits.cpuTimeMs, maximumMemoryBytes: limits.memoryBytes, maximumTasks: limits.tasks };
  for (const [metric, maximum] of Object.entries(accepted)) {
    const budget = envelope.resourceBudgets[metric as keyof typeof accepted];
    if (budget.state !== 'requested' || budget.limit !== maximum) throw new Error('WORKER_NATIVE_ACCEPTED_LIMIT_MISMATCH');
  }
  const claimRemaining = Date.parse(envelope.claim.expiresAt) - started.getTime();
  if (started.getTime() < Date.parse(envelope.claim.claimedAt) || claimRemaining <= 0
    || started.getTime() >= Date.parse(envelope.queueDeadline)) throw new Error('WORKER_NATIVE_CLAIM_NOT_ACTIVE');
  return { ...limits, timeoutMs: Math.min(limits.timeoutMs, claimRemaining) };
}
