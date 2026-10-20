import type { BusterPreparationV10Settings } from '@kubeclaw/plugin-foundation/config/buster-preparation-v10';
import { historicalChannelLimits } from './preparation-historical-channel.ts';
import { assertHistoricalImportDescriptor, type HistoricalImportDescriptor } from './preparation-historical-reference.ts';
import { preparationOperationSettings } from './preparation-envelope.ts';
import { executeNativeWorkerAttempt, type NativeWorkerControlChannel } from '@kubeclaw/worker-core';
import type { WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { assertPreparationSlot } from './preparation-slots.ts';
import { preparationCommand } from './preparation-command.ts';
import { preparationHostChannelLimits } from './preparation-host-channel.ts';
import type { PreparationExecutionOptions } from './preparation-execution.ts';

/** Both source phases use the same native owner, journal and quiescence requirement. */
export async function runPreparationPhase(options: PreparationExecutionOptions,
  envelope: WorkerAttemptEnvelopeV3, signal: AbortSignal,
  exchange: (channel: NativeWorkerControlChannel, cancelled: AbortSignal) => Promise<void>) {
  const { owner, journal } = options;
  const { settings, limits } = preparationPhasePolicy(envelope);
  const slot = envelope.operation.values.preparationUid;
  const admissionId = envelope.operation.values.admissionId;
  assertPreparationSlot(slot);
  if (typeof admissionId !== 'string') throw new Error('BUSTER_PREPARATION_ADMISSION_ID_INVALID');
  const phase = envelope.operation.values.phase as { kind?: unknown; descriptor?: unknown };
  const historical = phase?.kind === 'historical';
  if (historical) assertHistoricalImportDescriptor(phase.descriptor);
  const channelLimits = historical
    ? historicalChannelLimits(phase.descriptor as HistoricalImportDescriptor, settings)
    : preparationHostChannelLimits(settings);
  const result = await executeNativeWorkerAttempt({ envelope, journal, process: {
    owner, signal, command: preparationCommand(admissionId, settings, options.command, slot, historical ? 'historical' : 'prepare'),
    limits,
    control: { limits: channelLimits, run: exchange },
  } });
  if (result.state !== 'completed' || result.cleanup.state !== 'completed') {
    throw new Error(result.error?.code ?? 'BUSTER_PREPARATION_FAILED');
  }
  const ownership = await owner.record({ workerId: envelope.claim.workerId, attemptId: envelope.attemptId,
    claimId: envelope.claim.claimId, generation: envelope.claim.generation,
    profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest });
  if (ownership?.phase !== 'disposed' || ownership.finalObservation?.populated !== false) {
    throw new Error('BUSTER_PREPARATION_PUBLICATION_QUIESCENCE_UNPROVEN');
  }
  return result;
}

/** Original envelope codec drives the real native launch, never current options. */
export function preparationPhasePolicy(envelope: WorkerAttemptEnvelopeV3) {
  const settings = preparationOperationSettings(envelope);
  return { settings, limits: { cpuTimeMs: settings.resourcePolicy.cpuTimeMs, memoryBytes: settings.resourcePolicy.memoryBytes,
      tasks: settings.resourcePolicy.tasks, timeoutMs: settings.timeoutMs + (envelope.operation.contractId === 'kubeclaw.buster-preparation@2'
        ? (settings as BusterPreparationV10Settings).completionPhaseAllowance : 8) * settings.cleanupTimeoutMs,
      maximumInputBytes: settings.maximumInputBytes, maximumOutputBytes: settings.maximumOutputBytes,
      pollIntervalMs: settings.pollIntervalMs, closeTimeoutMs: settings.closeTimeoutMs } };
}
