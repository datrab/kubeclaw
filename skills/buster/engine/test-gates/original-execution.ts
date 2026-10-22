import { assertPipelineBootCapture, type PipelineBootCapture } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';
import { projectBusterSettings, projectBusterWorkerCore, selectedWorkerCorePolicy } from '@kubeclaw/plugin-foundation/config/pipeline-composition';
import { validateBusterExecutionSettings, type BusterExecutionSettings } from '@kubeclaw/plugin-foundation/config/buster-execution';
import { readWorkerCorePolicyCapture, type WorkerCorePolicyCapture } from '@kubeclaw/plugin-foundation/config/worker-core-policy';
import { validateLocalWorkerRuntimePolicy, type LocalWorkerRuntimePolicy } from '@kubeclaw/worker-core';

/** Original selected execution values, not a new task/source authority. */
export interface BusterOriginalExecution {
  readonly schemaVersion: 'buster-original-execution.v1' | 'buster-original-execution.v2';
  readonly generationDigest: string;
  readonly selectionDigest: string;
  readonly executionPolicy: BusterExecutionSettings;
  readonly workerLocalRuntime: LocalWorkerRuntimePolicy;
  readonly workerCore: WorkerCorePolicyCapture | null;
}

export function readBusterOriginalExecution(value: unknown): BusterOriginalExecution {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'executionPolicy,generationDigest,schemaVersion,selectionDigest,workerCore,workerLocalRuntime') {
    throw new Error('BUSTER_ORIGINAL_EXECUTION_INVALID');
  }
  const original = value as BusterOriginalExecution;
  if (!['buster-original-execution.v1', 'buster-original-execution.v2'].includes(original.schemaVersion)
    || ![original.generationDigest, original.selectionDigest].every(v => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v))) {
    throw new Error('BUSTER_ORIGINAL_EXECUTION_INVALID');
  }
  if (!original.workerLocalRuntime || Object.keys(original.workerLocalRuntime).sort().join(',') !== 'cancellationTimeoutMs,drainTimeoutMs,replayLimit') {
    throw new Error('BUSTER_ORIGINAL_EXECUTION_INVALID');
  }
  const executionPolicy = validateBusterExecutionSettings(original.executionPolicy);
  if ((original.schemaVersion === 'buster-original-execution.v2') !== ('schemaVersion' in executionPolicy)) {
    throw new Error('BUSTER_ORIGINAL_EXECUTION_VERSION_MISMATCH');
  }
  return Object.freeze({ schemaVersion: original.schemaVersion,
    generationDigest: original.generationDigest, selectionDigest: original.selectionDigest,
    executionPolicy,
    workerLocalRuntime: Object.freeze(validateLocalWorkerRuntimePolicy(structuredClone(original.workerLocalRuntime))),
    workerCore: original.workerCore === null ? null : readWorkerCorePolicyCapture(original.workerCore) });
}

/** Production creation is restricted to the authenticated, caller-specific boot. */
export function captureBusterOriginalExecution(boot: PipelineBootCapture): BusterOriginalExecution {
  assertPipelineBootCapture(boot, 'buster-runtime');
  const executionPolicy = projectBusterSettings(boot, 'buster-runtime').execution;
  return readBusterOriginalExecution({ schemaVersion: 'schemaVersion' in executionPolicy
      ? 'buster-original-execution.v2' : 'buster-original-execution.v1',
    generationDigest: boot.selectionReceipt.generationDigest, selectionDigest: boot.selectionReceipt.digest,
    executionPolicy,
    workerLocalRuntime: projectBusterWorkerCore(boot).localRuntime,
    workerCore: selectedWorkerCorePolicy(boot) ?? null });
}
