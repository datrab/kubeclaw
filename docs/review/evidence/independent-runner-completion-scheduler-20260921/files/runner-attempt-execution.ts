import fs from 'node:fs';
import { WorkerAttemptExecutor, type WorkerAttemptOperation } from '@kubeclaw/worker-core';
import type { WorkerAttemptEnvelopeV1, WorkerAttemptResultV1 } from '@kubeclaw/pipeline-worker-core-contract';
import type { TestPlanRunnerOptions, WorkerAttemptRuntime } from './runner-types.ts';
import { canonical } from './canonical-value.ts';
import { detail } from './runner-values.ts';
import { persistRunnerCompletion, type CompletionOwner } from './runner-completion.ts';
interface ExecutionOwner {
 readonly options: TestPlanRunnerOptions;
 readonly workerRuntime: WorkerAttemptRuntime;
 readonly now: () => Date;
 readonly id: () => string;
 readonly authorityId: string;
 readonly completion: CompletionOwner;
}
export async function executeRunnerAttempt(owner: ExecutionOwner, workerEnvelope: WorkerAttemptEnvelopeV1,
  operation: WorkerAttemptOperation, stagingBase: string) {
    let workerResult: WorkerAttemptResultV1 | null = null;
    let completedWorkerResult: WorkerAttemptResultV1 | null = null;
    let workerRuntimeFault: string | null = null;
    try {
      workerResult = await owner.workerRuntime.runAttempt(
        workerEnvelope,
        async (workerSignal) => {
          const signals = [
            workerSignal,
            ...(owner.options.signal ? [owner.options.signal] : []),
          ];
          const signal =
            signals.length === 1 ? workerSignal : AbortSignal.any(signals);
          completedWorkerResult = await new WorkerAttemptExecutor({
            envelope: workerEnvelope,
            operation,
            signal,
            retainLogs: false,
            now: owner.now,
            id: owner.id,
            receiptNamespace: owner.authorityId,
          }).execute();
          return completedWorkerResult;
        },
      );
      if (
        !workerResult ||
        !completedWorkerResult ||
        canonical(workerResult) !== canonical(completedWorkerResult)
      )
        throw new Error("WORKER_RUNTIME_RESULT_MISMATCH");
      // The authoritative completion intent remains durable even if admission is pending.
      const completion = await persistRunnerCompletion(owner.completion, workerEnvelope, workerResult);
      workerResult = completion.result;
      completedWorkerResult = workerResult;
    } catch (error) {
      workerRuntimeFault = detail(error);
      workerResult = completedWorkerResult;
    } finally {
      await fs.promises.rm(stagingBase, { recursive: true, force: true });
    }
    return { workerResult, workerRuntimeFault };
}
