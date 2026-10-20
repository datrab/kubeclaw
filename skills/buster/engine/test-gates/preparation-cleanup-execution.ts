import { preparationCleanupPolicy } from './preparation-cleanup-policy.ts';
import { executeNativeWorkerAttempt, recoverNativeAttempt, verifyNativeSourceCleanupResult } from '@kubeclaw/worker-core';
import type { WorkerAttemptResultV3 } from '@kubeclaw/pipeline-worker-core-contract';
import type { PreparationCleanupAssociation } from './preparation-cleanup-binding.ts';
import type { PreparationExecutionOptions } from './preparation-execution.ts';
import { preparationCommand } from './preparation-command.ts';
import { preparationDigest } from './preparation-header.ts';

/** Existing predecessor recovery reuses Core's exact finalizer without launching or unfencing. */
export async function recoverPreparationCleanup(options: PreparationExecutionOptions,
  association: PreparationCleanupAssociation): Promise<WorkerAttemptResultV3 | null> {
  if (!await options.journal.hasAttempt(association.envelope)) return null;
  return options.journal.withAttempt(association.envelope, async context => {
    if (context.newlyAccepted) throw new Error('BUSTER_PREPARATION_CLEANUP_PREDECESSOR_MISSING');
    const cached = await options.journal.readResult(association.envelope);
    if (cached) return cached;
    const result = await recoverNativeAttempt(options.journal, options.owner, association.envelope,
      new Date(context.acceptedAt), false);
    if (!result) throw new Error('BUSTER_PREPARATION_CLEANUP_RECOVERY_REQUIRED');
    return options.journal.seal(association.envelope, result);
  });
}

/** Only this invocation's new cleanup may launch; a new failure keeps the owner fenced. */
export async function executePreparationCleanup(options: PreparationExecutionOptions,
  association: PreparationCleanupAssociation): Promise<WorkerAttemptResultV3> {
  const { envelope, effects } = association;
  const { settings, limits } = preparationCleanupPolicy(envelope, association.settings);
  const command = preparationCommand(effects.admissionId, settings, options.command, effects.gate.preparationUid, 'cleanup');
  const encoded = JSON.stringify({ effects, settings });
  if (Buffer.byteLength(encoded) > settings.maximumInputBytes) throw new Error('BUSTER_PREPARATION_CLEANUP_INPUT_LIMIT');
  const result = await executeNativeWorkerAttempt({ envelope, journal: options.journal, process: {
    owner: options.owner,
    command: { ...command, environment: { ...command.environment, BUSTER_PREPARATION_ASSIGNED_CLEANUP: encoded } },
    limits,
  } });
  await options.ledger.recordCleanupResult(effects.admissionId, preparationDigest(envelope), result.resultDigest);
  await verifyNativeSourceCleanupResult(options.journal, options.owner, envelope);
  return result;
}
