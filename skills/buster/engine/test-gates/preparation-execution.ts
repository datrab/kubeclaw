import { randomBytes } from 'node:crypto';
import type { NativeAttemptJournal, NativeWorkerOwnership } from '@kubeclaw/worker-core';
import type { BusterPreparationSettings } from '@kubeclaw/plugin-foundation/config/swarm';
import { preparationDigest, type PreparedPlanJob } from './preparation-header.ts';
import { assertStagedInput, type StagedAdmission } from './preparation-input.ts';
import { preparationProfile } from './preparation-envelope.ts';
import type { PreparationCommandConfig } from './preparation-command.ts';
import { createPreparationGate, retainPreparationGate, removeEmptyPreparationGate } from './preparation-gate.ts';
import { decodePreparationMessage, encodePreparationMessage, type PreparationIngress } from './preparation-channel.ts';
import type { PreparationSourceLedger } from './preparation-ledger.ts';
import { runPreparationPhase } from './preparation-native-phase.ts';

export interface PreparationExecutionOptions {
  readonly owner: NativeWorkerOwnership;
  readonly journal: NativeAttemptJournal;
  readonly ledger: PreparationSourceLedger;
  readonly settings: BusterPreparationSettings;
  readonly command: PreparationCommandConfig;
  readonly engineContentDigest: string;
}

/** A positive result means the original wire is durable and its native writer is quiescent. */
export async function executeBusterPreparation(options: PreparationExecutionOptions,
  ingress: PreparationIngress, signal: AbortSignal,
  admit: (job: PreparedPlanJob) => Promise<boolean>): Promise<StagedAdmission | null> {
  const { ledger } = options;
  const admissionId = randomBytes(16).toString('hex');
  const envelope = await ledger.reserve(admissionId, preparationProfile(options.engineContentDigest), new Date());
  const gate = await createPreparationGate(options.command.sourceRoot, admissionId, envelope);
  await ledger.bindGate(admissionId, gate);
  let permitted: StagedAdmission | undefined;
  const result = await runPreparationPhase(options, envelope, signal, async (channel, cancelled) => {
    const stop = () => ingress.fail(cancelled.reason);
    cancelled.addEventListener('abort', stop, { once: true });
    try {
      if (cancelled.aborted) stop();
      for await (const chunk of ingress.chunks()) await channel.send(encodePreparationMessage('bytes', admissionId, chunk));
      await channel.send(encodePreparationMessage('end', admissionId));
      const reader = channel.messages()[Symbol.asyncIterator]();
      const reply = await reader.next();
      if (reply.done) throw new Error('BUSTER_PREPARATION_VALIDATION_MISSING');
      const message = decodePreparationMessage(reply.value);
      if (message.kind !== 'validated' || message.admissionId !== admissionId) {
        throw new Error('BUSTER_PREPARATION_VALIDATION_INVALID');
      }
      const staged = JSON.parse(message.content.toString('utf8')) as StagedAdmission;
      assertStagedInput(staged.input, staged.job);
      if (staged.input.admissionId !== admissionId || staged.input.attemptSpecDigest !== envelope.attemptSpecDigest
        || staged.input.preparationUid !== envelope.operation.values.preparationUid) {
        throw new Error('BUSTER_PREPARATION_RESULT_IDENTITY_INVALID');
      }
      if (await admit(structuredClone(staged.job))) {
        await ledger.stageInput(staged);
        permitted = staged;
      }
      await channel.send(encodePreparationMessage(permitted ? 'proceed' : 'decline', admissionId));
    } finally { cancelled.removeEventListener('abort', stop); }
  });
  if (!permitted) {
    if (result.specialistResult?.schemaId !== 'buster-declined-input-result.v1'
      || preparationDigest(result.specialistResult.values) !== preparationDigest({ declined: true })) {
      throw new Error('BUSTER_PREPARATION_DECLINE_INVALID');
    }
    await ledger.beginEmptyGateReclaim(admissionId, preparationDigest(result));
    await removeEmptyPreparationGate(options.command.sourceRoot, admissionId, gate);
    await ledger.released(admissionId);
    return null;
  }
  if (result.specialistResult?.schemaId !== 'buster-staged-input-result.v1'
    || preparationDigest(result.specialistResult.values) !== preparationDigest(permitted)) {
    throw new Error('BUSTER_PREPARATION_RESULT_IDENTITY_INVALID');
  }
  await retainPreparationGate(options.command.sourceRoot, admissionId, gate);
  await ledger.retainInput(permitted);
  return permitted;
}
